const db = require('../db');
const sessions = require('../sessions');
const { TYPES, encode } = require('../../common/protocol');
const { MAX_MESSAGE_BYTES, ERROR_CODES } = require('../../common/constants');

const insertMessage = db.prepare(`
  INSERT INTO messages (sender_id, receiver_id, type, content, time)
  SELECT sender.id, receiver.id, 'MSG', ?, ?
  FROM users AS sender, users AS receiver
  WHERE sender.username = ? AND receiver.username = ?
`);

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
  const receiver = sessions.get(to);
  if (!receiver?.writable || receiver.destroyed) {
    return { type: TYPES.ERROR, code: ERROR_CODES.RECIPIENT_UNAVAILABLE, content: 'Người nhận đang offline.' };
  }
  const saved = insertMessage.run(content, time, from, to);
  if (saved.changes !== 1) throw new Error('Thiếu tài khoản khi lưu tin nhắn.');
  const message = { type: TYPES.MSG, id: saved.lastInsertRowid, from, to, time, content };
  receiver.write(encode(message));
  return message; // Bản trả về cho người gửi có cùng id và thời gian với bản chuyển tiếp.
}

module.exports = { sendMessage };
