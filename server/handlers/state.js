const db = require('../db');
const sessions = require('../sessions');
const { TYPES, encode } = require('../../common/protocol');
const { ERROR_CODES } = require('../../common/constants');

const PAGE_SIZE = 128;
const selectPage = db.prepare(`
  SELECT u.id, u.username, EXISTS (
    SELECT 1 FROM messages m WHERE m.sender_id = u.id
      AND m.receiver_id = (SELECT id FROM users WHERE username = @self)
      AND m.group_id IS NULL AND m.type IN ('MSG', 'FILE', 'IMAGE', 'VIDEO', 'SOUND') AND m.status IN ('queued', 'received')
      AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = m.receiver_id)
  ) AS unread FROM users u
  WHERE u.id > @afterId AND u.username <> @self ORDER BY u.id LIMIT @limit
`);

function* contactPages(username) {
  let afterId = 0;
  while (true) {
    // Chỉ đọc một trang sau mỗi lần ghi TCP để giữ mỗi gói dưới giới hạn.
    const rows = selectPage.all({ afterId, self: username, limit: PAGE_SIZE + 1 });
    const complete = rows.length <= PAGE_SIZE;
    const contacts = rows.slice(0, PAGE_SIZE).map(row => ({
      username: row.username,
      status: sessions.get(row.username) ? 'online' : 'offline',
      ...(row.unread ? { unread: true } : {})
    }));
    yield { type: TYPES.STATE, kind: 'list', contacts, complete, from: null, time: new Date().toISOString() };
    if (complete) return;
    afterId = rows[PAGE_SIZE - 1].id;
  }
}

function publishPresence(username, status) {
  const packet = { type: TYPES.STATE, kind: 'change', username, status, from: null, time: new Date().toISOString() };
  sessions.broadcast(packet, sessions.get(username));
}

function endSession(socket) {
  const name = sessions.usernameOf(socket);
  if (name === null) return;
  sessions.remove(socket);
  publishPresence(name, 'offline');
}

const advanceReceipt = db.prepare(`
  UPDATE messages SET status = @status
  WHERE id = @id AND receiver_id = (SELECT id FROM users WHERE username = @receiver)
    AND type IN ('MSG', 'FILE', 'IMAGE', 'VIDEO', 'SOUND') AND group_id IS NULL
    AND (status IN ('queued', 'sent') OR (status = 'received' AND @status = 'seen'))
`);
const findReceipt = db.prepare(`
  SELECT s.username AS sender, m.status FROM messages m
  JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.receiver_id
  WHERE m.id = ? AND r.username = ? AND m.type IN ('MSG', 'FILE', 'IMAGE', 'VIDEO', 'SOUND') AND m.group_id IS NULL
`);
const recordReceipt = db.transaction((id, receiver, status) => {
  const changed = advanceReceipt.run({ id, receiver, status }).changes;
  return { changed, row: findReceipt.get(id, receiver) };
});

function acknowledge(_socket, { from, time, id, status }) {
  if (!from) return { type: TYPES.ERROR, code: ERROR_CODES.NOT_LOGGED_IN, content: 'Hãy đăng nhập để xác nhận tin.' };
  if (!Number.isSafeInteger(id) || id <= 0 || !['received', 'seen'].includes(status)) {
    return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Mã tin hoặc trạng thái ACK không hợp lệ.' };
  }
  const { changed, row } = recordReceipt(id, from, status);
  if (!row) return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Không thể xác nhận tin này.' };
  const ack = { type: TYPES.ACK, id, status: row.status, from, to: row.sender, time };
  const sender = sessions.get(row.sender);
  if (changed && sender?.writable && !sender.destroyed) sender.write(encode(ack));
  return ack;
}

module.exports = { contactPages, publishPresence, endSession, acknowledge };
