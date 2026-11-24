const db = require('../db');
const sessions = require('../sessions');
const { storedFile } = require('../../common/media');
const { sendGroupMessage } = require('./group');
const { canReply, replyPreview, reactionSummary } = require('./messageContext');
const { TYPES, encode } = require('../../common/protocol');
const { MAX_MESSAGE_BYTES, ERROR_CODES } = require('../../common/constants');

const insertMessage = db.prepare(`
  INSERT INTO messages (id, sender_id, receiver_id, type, content, time, status, reply_to)
  SELECT (SELECT message_id FROM next_chat_ids), sender.id, receiver.id, 'MSG', ?, ?, 'queued', ?
  FROM users AS sender, users AS receiver
  WHERE sender.username = ? AND receiver.username = ?
`);
const nextQueued = db.prepare(`
  SELECT m.id, m.type, s.username AS "from", r.username AS "to", m.content, m.time,
    m.edited_at, m.recalled_at, m.reply_to, 'sent' AS status
  FROM messages m JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.receiver_id
  WHERE r.username = ? AND m.id > ? AND m.status = 'queued' AND m.type IN ('MSG', 'FILE', 'IMAGE', 'VIDEO', 'SOUND') AND m.group_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = r.id)
  ORDER BY m.id LIMIT 1
`);
const lastId = db.prepare('SELECT MAX(id) FROM messages').pluck();
const inboxes = new WeakMap();

function asChatMessage({ content, edited_at, recalled_at, reply_to, ...message }, viewer) {
  if (recalled_at) return { ...message, type: TYPES.MSG, recalledAt: recalled_at };
  if (reply_to) message.reply = replyPreview(reply_to, viewer);
  const summary = reactionSummary(message.id, viewer);
  if (summary.reactions.length) Object.assign(message, summary);
  if (message.type !== TYPES.MSG) return { ...message, type: TYPES.MSG, file: storedFile(content) };
  return { ...message, content, ...(edited_at ? { editedAt: edited_at } : {}) };
}

function validContent(content) {
  return typeof content === 'string' && Boolean(content.trim()) && Buffer.byteLength(content, 'utf8') <= MAX_MESSAGE_BYTES;
}

async function flushInbox(socket, username) {
  const inbox = inboxes.get(socket);
  if (!inbox || inbox.busy || inbox.username !== username) return;
  inbox.busy = true;
  try {
    // Chỉ phát một lần trong phiên này. Khi chưa có ACK, phiên sau sẽ nhận lại.
    while (!socket.destroyed && sessions.get(username) === socket && inboxes.get(socket) === inbox) {
      const message = nextQueued.get(username, inbox.lastOffered);
      if (!message) break;
      if (message.id <= inbox.backlogThrough) message.backlog = true;
      await new Promise((resolve, reject) => {
        socket.write(encode(asChatMessage(message, username)), error => error ? reject(error) : resolve());
      });
      inbox.lastOffered = message.id;
    }
  } catch (error) {
    socket.destroy(error);
  } finally {
    inbox.busy = false;
  }
}

function openInbox(socket, username) {
  inboxes.set(socket, { username, busy: false, lastOffered: 0, backlogThrough: lastId.get() ?? 0 });
  void flushInbox(socket, username);
}

function closeInbox(socket) {
  inboxes.delete(socket);
}

function sendMessage(_socket, { from, time, to, groupId, content, replyTo = null }) {
  // Router đã gán from và time theo phiên TCP và đồng hồ Server.
  if (from === null) {
    return { type: TYPES.ERROR, code: ERROR_CODES.NOT_LOGGED_IN, content: 'Hãy đăng nhập trước khi gửi tin.' };
  }
  if (!validContent(content)) {
    return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Tin nhắn cần có nội dung và tối đa 16 KiB UTF-8.' };
  }
  if (!canReply(from, to, groupId, replyTo)) {
    return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Tin nhắn gốc không còn khả dụng trong hội thoại này.' };
  }
  if (groupId !== undefined) {
    if (!Number.isSafeInteger(groupId) || groupId <= 0 || to !== undefined) {
      return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Địa chỉ nhóm không hợp lệ.' };
    }
    return sendGroupMessage({ from, time, groupId, content, replyTo });
  }
  if (typeof to !== 'string' || !to || to === from) {
    return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Hãy chọn một tài khoản khác để nhắn tin.' };
  }
  const saved = insertMessage.run(content, time, replyTo, from, to);
  if (!saved.changes) {
    return { type: TYPES.ERROR, code: ERROR_CODES.RECIPIENT_UNAVAILABLE, content: 'Tài khoản nhận không tồn tại.' };
  }
  const message = { type: TYPES.MSG, id: saved.lastInsertRowid, from, to, time, content, status: 'sent' };
  if (replyTo) message.reply = replyPreview(replyTo, from);
  deliverPrivate(to);
  return message; // Bản trả về cho người gửi có cùng id và thời gian với bản chuyển tiếp.
}

function deliverPrivate(username) {
  const receiver = sessions.get(username);
  if (receiver) void flushInbox(receiver, username);
}

module.exports = { sendMessage, openInbox, closeInbox, asChatMessage, deliverPrivate, validContent };
