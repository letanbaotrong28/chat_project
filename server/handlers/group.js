const db = require('../db');
const sessions = require('../sessions');
const { TYPES, encode } = require('../../common/protocol');
const { ERROR_CODES } = require('../../common/constants');

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
const insertGroup = db.prepare('INSERT INTO groups (name, owner_id) VALUES (?, ?)');
const insertMember = db.prepare(`
  INSERT INTO group_members (group_id, user_id) VALUES (?, ?)
  ON CONFLICT(group_id, user_id) DO NOTHING
`);
const memberNames = db.prepare(`
  SELECT u.username FROM group_members gm JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = ? AND u.username <> ?
`).pluck();
const insertMessage = db.prepare(`
  INSERT INTO messages (group_id, sender_id, type, content, time)
  SELECT gm.group_id, gm.user_id, 'MSG', ?, ? FROM group_members gm
  JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND u.username = ?
`);

function failure(content, code = ERROR_CODES.INVALID_INPUT) {
  return { type: TYPES.ERROR, code, content };
}

const createWithOwner = db.transaction((name, from) => {
  const ownerId = userId.get(from);
  const id = insertGroup.run(name, ownerId).lastInsertRowid;
  insertMember.run(id, ownerId);
  return findGroup.get(from, id);
});

function createGroup(_socket, { from, name }) {
  if (!from) return failure('Hãy đăng nhập để tạo nhóm.', ERROR_CODES.NOT_LOGGED_IN);
  const title = typeof name === 'string' ? name.trim().normalize('NFC') : '';
  if (!title || [...title].length > 80 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(title)) {
    return failure('Tên nhóm cần từ 1 đến 80 ký tự và nằm trên một dòng.');
  }
  return { type: TYPES.GROUP_CREATE, group: createWithOwner(title, from) };
}

function notifyMembers(groupId, from, packet) {
  const frame = encode(packet);
  for (const name of memberNames.iterate(groupId, from)) {
    const socket = sessions.get(name);
    if (socket?.writable && !socket.destroyed) socket.write(frame);
  }
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

function sendGroupMessage({ from, time, groupId, content }) {
  const result = insertMessage.run(content, time, groupId, from);
  if (!result.changes) return failure('Bạn cần là thành viên để gửi tin vào nhóm.');
  const packet = { type: TYPES.MSG, id: result.lastInsertRowid, groupId, from, content, time };
  notifyMembers(groupId, from, packet);
  return packet;
}

function* groupsForLogin(username) {
  let after = 0;
  while (true) {
    const rows = listGroups.all(username, after);
    for (const group of rows) {
      yield { type: TYPES.STATE, kind: 'group', group, from: null, time: new Date().toISOString() };
    }
    if (rows.length < 128) return;
    after = rows.at(-1).id;
  }
}

module.exports = { createGroup, addMember, sendGroupMessage, groupsForLogin, isMember };
