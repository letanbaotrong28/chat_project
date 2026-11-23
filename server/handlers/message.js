const db = require('../db');
const sessions = require('../sessions');
const { TYPES, encode } = require('../../common/protocol');
const { MAX_MESSAGE_BYTES, ERROR_CODES } = require('../../common/constants');

const insertMessage = db.prepare(`
  INSERT INTO messages (sender_id, receiver_id, type, content, time, status)
  SELECT sender.id, receiver.id, 'MSG', ?, ?, 'queued'
  FROM users AS sender, users AS receiver
  WHERE sender.username = ? AND receiver.username = ?
`);
const nextQueued = db.prepare(`
  SELECT m.id, m.type, s.username AS "from", r.username AS "to", m.content, m.time, 'sent' AS status
  FROM messages m JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.receiver_id
  WHERE r.username = ? AND m.id > ? AND m.status = 'queued' AND m.type = 'MSG' AND m.group_id IS NULL
  ORDER BY m.id LIMIT 1
`);
const lastId = db.prepare('SELECT MAX(id) FROM messages').pluck();
const inboxes = new WeakMap();

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
        socket.write(encode(message), error => error ? reject(error) : resolve());
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

function sendMessage(_socket, { from, time, to, content }) {
  // Router đã gán from và time theo phiên TCP và đồng hồ Server.
  if (from === null) {
    return { type: TYPES.ERROR, code: ERROR_CODES.NOT_LOGGED_IN, content: 'Hãy đăng nhập trước khi gửi tin.' };
  }
  if (typeof to !== 'string' || !to || to === from) {
    return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Hãy chọn một tài khoản khác để nhắn tin.' };
  }
  if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content, 'utf8') > MAX_MESSAGE_BYTES) {
    return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Tin nhắn cần có nội dung và tối đa 16 KiB UTF-8.' };
  }
  const saved = insertMessage.run(content, time, from, to);
  if (!saved.changes) {
    return { type: TYPES.ERROR, code: ERROR_CODES.RECIPIENT_UNAVAILABLE, content: 'Tài khoản nhận không tồn tại.' };
  }
  const message = { type: TYPES.MSG, id: saved.lastInsertRowid, from, to, time, content, status: 'sent' };
  const receiver = sessions.get(to);
  if (receiver) void flushInbox(receiver, to);
  return message; // Bản trả về cho người gửi có cùng id và thời gian với bản chuyển tiếp.
}

module.exports = { sendMessage, openInbox, closeInbox };
