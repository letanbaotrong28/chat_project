const db = require('../db');
const sessions = require('../sessions');
const { TYPES } = require('../../common/protocol');

const PAGE_SIZE = 128;
const selectPage = db.prepare(`
  SELECT id, username FROM users
  WHERE id > ? AND username <> ? ORDER BY id LIMIT ?
`);

function* contactPages(username) {
  let afterId = 0;
  while (true) {
    // Chỉ đọc một trang sau mỗi lần ghi TCP để giữ mỗi gói dưới giới hạn.
    const rows = selectPage.all(afterId, username, PAGE_SIZE + 1);
    const complete = rows.length <= PAGE_SIZE;
    const contacts = rows.slice(0, PAGE_SIZE).map(row => ({
      username: row.username,
      status: sessions.get(row.username) ? 'online' : 'offline'
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

module.exports = { contactPages, publishPresence, endSession };
