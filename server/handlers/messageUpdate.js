const db = require('../db');
const { TYPES } = require('../../common/protocol');
const { ERROR_CODES } = require('../../common/constants');
const { notifyUsers, cleanDeletedFiles } = require('./group');
const { validContent } = require('./message');

const { accessible, audience, reactionSummary } = require('./messageContext');
const hide = db.prepare('INSERT OR IGNORE INTO hidden_messages (message_id,user_id) VALUES (?,?)');
const edit = db.prepare('UPDATE messages SET content=?, edited_at=? WHERE id=?');
const recall = db.prepare("UPDATE messages SET type='MSG', content=NULL, file_path=NULL, edited_at=NULL, recalled_at=? WHERE id=?");
const queueFile = db.prepare('INSERT OR IGNORE INTO pending_file_deletions(type,file_path) VALUES (?,?)');
const clearReactions = db.prepare('DELETE FROM message_reactions WHERE message_id=?');
const setReaction = db.prepare(`INSERT INTO message_reactions(message_id,user_id,emoji) VALUES (?,?,?)
  ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji`);
const removeReaction = db.prepare('DELETE FROM message_reactions WHERE message_id=? AND user_id=?');
const emojis = new Set(['👍', '❤️', '😂', '😮', '😢', '😡', '🎉']);

function failure(content, code = ERROR_CODES.INVALID_INPUT) {
  return { type: TYPES.ERROR, code, content };
}

const change = db.transaction(({ id, action, content, from, time }) => {
  const row = accessible.get(from, id);
  if (!row || (row.hidden && action !== 'hide')) return failure('Bạn không thể truy cập tin nhắn này.');
  const target = row.groupId ? { groupId: row.groupId } : { to: row.recipient };
  const packet = { type: TYPES.MSG_UPDATE, action, id, sender: row.sender, ...target, from, time };
  if (action === 'hide') {
    hide.run(id, row.viewerId);
    return { packet };
  }
  if (row.sender !== from) return failure('Chỉ người gửi mới có quyền thực hiện thao tác này.');
  if (action === 'edit') {
    if (row.recalled_at || row.type !== TYPES.MSG) return failure('Chỉ sửa được tin văn bản chưa thu hồi.');
    if (!validContent(content)) return failure('Tin nhắn cần có nội dung và tối đa 16 KiB UTF-8.');
    edit.run(content, time, id);
    packet.content = content;
    packet.editedAt = time;
  } else {
    packet.recalledAt = row.recalled_at || time;
    if (row.recalled_at) return { packet };
    if (row.file_path) queueFile.run(row.type, row.file_path);
    clearReactions.run(id);
    recall.run(time, id);
  }
  return { packet, recipients: audience.all({ id, actor: from }), cleanup: Boolean(row.file_path) };
});

async function updateMessage(_socket, request) {
  if (!request.from) return failure('Hãy đăng nhập để quản lý tin nhắn.', ERROR_CODES.NOT_LOGGED_IN);
  if (!Number.isSafeInteger(request.id) || request.id <= 0 || !['edit', 'hide', 'recall'].includes(request.action)) {
    return failure('Thao tác hoặc mã tin nhắn không hợp lệ.');
  }
  const result = change(request);
  if (!result.packet) return result;
  if (result.recipients) notifyUsers(result.recipients, result.packet);
  if (result.cleanup) await cleanDeletedFiles();
  return result.packet;
}

const recordReaction = db.transaction(({ id, emoji, from, time }) => {
  const row = accessible.get(from, id);
  if (!row || row.hidden || row.recalled_at) return failure('Bạn không thể thả cảm xúc vào tin nhắn này.');
  if (emoji === null) removeReaction.run(id, row.viewerId);
  else setReaction.run(id, row.viewerId, emoji);
  const target = row.groupId ? { groupId: row.groupId } : { to: row.recipient };
  const packet = { type: TYPES.REACTION, id, sender: row.sender, ...target, from, time,
    emoji, reactions: reactionSummary(id, from).reactions };
  return { packet, recipients: audience.all({ id, actor: from }) };
});

function reactToMessage(_socket, request) {
  if (!request.from) return failure('Hãy đăng nhập để thả cảm xúc.', ERROR_CODES.NOT_LOGGED_IN);
  if (!Number.isSafeInteger(request.id) || request.id <= 0 || (request.emoji !== null && !emojis.has(request.emoji))) {
    return failure('Tin nhắn hoặc cảm xúc không hợp lệ.');
  }
  const result = recordReaction(request);
  if (!result.packet) return result;
  notifyUsers(result.recipients, result.packet);
  return result.packet;
}

module.exports = { updateMessage, reactToMessage };
