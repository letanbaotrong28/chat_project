const db = require('../db');
const fs = require('node:fs/promises');
const path = require('node:path');
const { UPLOAD_DIRS } = require('../config');
const { folders } = require('../../common/media');
const sessions = require('../sessions');
const { TYPES, encode } = require('../../common/protocol');
const { ERROR_CODES } = require('../../common/constants');
const { replyPreview } = require('./messageContext');

const userId = db.prepare('SELECT id FROM users WHERE username = ?').pluck();
const groupFields = `
  SELECT g.id, g.name, owner.username AS owner,
    (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS memberCount
  FROM groups g JOIN users owner ON owner.id = g.owner_id
  JOIN group_members gm ON gm.group_id = g.id
  JOIN users u ON u.id = gm.user_id WHERE u.username = ?
`;
const findGroup = db.prepare(groupFields + ' AND g.id = ?');
const listGroups = db.prepare(groupFields + ' AND g.id > ? ORDER BY g.id LIMIT 128');
const membership = db.prepare(`
  SELECT 1 FROM group_members gm JOIN users u ON u.id = gm.user_id
  WHERE u.username = ? AND gm.group_id = ?
`);

function isMember(username, groupId) {
  return Boolean(membership.get(username, groupId));
}
const insertGroup = db.prepare('INSERT INTO groups (id, name, owner_id) VALUES ((SELECT group_id FROM next_chat_ids), ?, ?)');
const insertMember = db.prepare(`
  INSERT INTO group_members (group_id, user_id) VALUES (?, ?)
  ON CONFLICT(group_id, user_id) DO NOTHING
`);
const memberNames = db.prepare(`
  SELECT u.username FROM group_members gm JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = ? AND u.username <> ?
`).pluck();
const insertMessage = db.prepare(`
  INSERT INTO messages (id, group_id, sender_id, type, content, time, reply_to)
  SELECT (SELECT message_id FROM next_chat_ids), gm.group_id, gm.user_id, 'MSG', ?, ?, ? FROM group_members gm
  JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND u.username = ?
`);

function failure(content, code = ERROR_CODES.INVALID_INPUT) {
  return { type: TYPES.ERROR, code, content };
}

const createWithOwner = db.transaction((name, from, members) => {
  const ids = members.map(username => userId.get(username));
  if (ids.some(id => !id)) return null;
  const ownerId = userId.get(from);
  const id = insertGroup.run(name, ownerId).lastInsertRowid;
  insertMember.run(id, ownerId);
  for (const memberId of ids) insertMember.run(id, memberId);
  return findGroup.get(from, id);
});

function createGroup(_socket, { from, name, members = [], time }) {
  if (!from) return failure('Hãy đăng nhập để tạo nhóm.', ERROR_CODES.NOT_LOGGED_IN);
  const title = typeof name === 'string' ? name.trim().normalize('NFC') : '';
  if (!title || [...title].length > 80 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(title)) {
    return failure('Tên nhóm cần từ 1 đến 80 ký tự và nằm trên một dòng.');
  }
  if (!Array.isArray(members) || members.some(member => typeof member !== 'string')) {
    return failure('Danh sách thành viên không hợp lệ.');
  }
  const invitees = new Set(members.map(member => member.trim().normalize('NFC')));
  invitees.delete(from);
  const group = createWithOwner(title, from, [...invitees]);
  if (!group) return failure('Một tài khoản đã chọn không tồn tại. Hãy kiểm tra lại danh sách.');
  notifyUsers(invitees, { type: TYPES.STATE, kind: 'group', group, from, time });
  return { type: TYPES.GROUP_CREATE, group };
}

function notifyMembers(groupId, from, packet) {
  notifyUsers(memberNames.iterate(groupId, from), packet);
}

function notifyUsers(usernames, packet) {
  // Một thành viên có thể đã ẩn tin gốc. Chỉ gửi trích dẫn họ được xem.
  const frame = packet.reply ? null : encode(packet);
  for (const name of usernames) {
    const socket = sessions.get(name);
    if (socket?.writable && !socket.destroyed) {
      socket.write(frame ?? encode({ ...packet, reply: replyPreview(packet.reply.id, name) }));
    }
  }
}

const removeOwnedGroup = db.transaction((from, groupId) => {
  if (findGroup.get(from, groupId)?.owner !== from) return null;
  const members = memberNames.all(groupId, from);
  db.prepare(`UPDATE deleted_chat_ids SET group_id = MAX(group_id, ?),
    message_id = MAX(message_id, COALESCE((SELECT MAX(id) FROM messages WHERE group_id = ?), 0))
    WHERE singleton = 1`).run(groupId, groupId);
  db.prepare(`INSERT OR IGNORE INTO pending_file_deletions (type, file_path)
    SELECT type, file_path FROM messages WHERE group_id = ? AND file_path IS NOT NULL`).run(groupId);
  db.prepare('DELETE FROM messages WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
  return members;
});

// Một lần dừng Server hoặc tệp đang bị khóa trên Windows có thể để lại việc dọn tệp.
async function cleanDeletedFiles() {
  const rows = db.prepare('SELECT type, file_path FROM pending_file_deletions').all();
  for (const { type, file_path: token } of rows) {
    try {
      if (!Object.hasOwn(folders, type) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)) {
        throw new Error('Đường dẫn tệp lưu không hợp lệ.');
      }
      await fs.rm(path.join(UPLOAD_DIRS[folders[type]], token), { force: true });
      db.prepare('DELETE FROM pending_file_deletions WHERE type = ? AND file_path = ?').run(type, token);
    } catch (error) {
      console.warn('Chưa dọn được tệp đính kèm:', error.code || error.message);
    }
  }
}

async function deleteGroup(_socket, { from, time, groupId }) {
  if (!from) return failure('Hãy đăng nhập để xóa nhóm.', ERROR_CODES.NOT_LOGGED_IN);
  const members = Number.isSafeInteger(groupId) && groupId > 0 && removeOwnedGroup(from, groupId);
  if (!members) return failure('Chỉ chủ nhóm mới xóa được một nhóm đang tồn tại.');
  const packet = { type: TYPES.GROUP_DELETE, groupId, from, time };
  notifyUsers(members, packet);
  await cleanDeletedFiles();
  return packet;
}

function addMember(_socket, { from, time, groupId, username }) {
  if (!from) return failure('Hãy đăng nhập để thêm thành viên.', ERROR_CODES.NOT_LOGGED_IN);
  const group = Number.isSafeInteger(groupId) && findGroup.get(from, groupId);
  if (!group || group.owner !== from) return failure('Chỉ chủ nhóm được thêm thành viên.');
  const name = typeof username === 'string' ? username.trim().normalize('NFC') : '';
  const id = userId.get(name);
  if (!id) return failure('Tài khoản cần thêm không tồn tại.');
  if (!insertMember.run(groupId, id).changes) return failure('Tài khoản này đã ở trong nhóm.');
  const packet = { type: TYPES.GROUP_ADD, group: findGroup.get(from, groupId), username: name, from, time };
  notifyMembers(groupId, from, packet);
  return packet;
}

function sendGroupMessage({ from, time, groupId, content, replyTo = null }) {
  const result = insertMessage.run(content, time, replyTo, groupId, from);
  if (!result.changes) return failure('Bạn cần là thành viên để gửi tin vào nhóm.');
  const packet = { type: TYPES.MSG, id: result.lastInsertRowid, groupId, from, content, time };
  if (replyTo) packet.reply = replyPreview(replyTo, from);
  notifyMembers(groupId, from, packet);
  return packet;
}

function* groupsForLogin(username) {
  let after = 0;
  while (true) {
    const rows = listGroups.all(username, after);
    for (const group of rows) {
      if (!isMember(username, group.id)) continue;
      yield { type: TYPES.STATE, kind: 'group', group, from: null, time: new Date().toISOString() };
    }
    if (rows.length < 128) return;
    after = rows.at(-1).id;
  }
}

module.exports = { createGroup, addMember, deleteGroup, sendGroupMessage, groupsForLogin, isMember, notifyMembers, notifyUsers, cleanDeletedFiles };
