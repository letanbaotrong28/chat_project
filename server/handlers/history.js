const db = require('../db');
const { TYPES } = require('../../common/protocol');
const { ERROR_CODES } = require('../../common/constants');

// 10 tin x 16 KiB vẫn vừa gói 1 MiB kể cả khi JSON phải escape từng byte.
const PAGE_SIZE = 10;
const userId = db.prepare('SELECT id FROM users WHERE username = ?').pluck();
const selectPage = db.prepare(`
  SELECT m.id, m.type, s.username AS "from", r.username AS "to", m.content, m.time,
    CASE WHEN m.status = 'queued' THEN 'sent' ELSE m.status END AS status
  FROM messages m JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.receiver_id
  WHERE m.type = 'MSG' AND m.group_id IS NULL
    AND ((m.sender_id = @self AND m.receiver_id = @other)
      OR (m.sender_id = @other AND m.receiver_id = @self))
    AND m.id < COALESCE(@before, 9223372036854775807)
  ORDER BY m.id DESC LIMIT @limit
`);

function getHistory(_socket, { from, peer, beforeId = null }) {
  if (!from) return { type: TYPES.ERROR, code: ERROR_CODES.NOT_LOGGED_IN, content: 'Hãy đăng nhập để xem lịch sử.' };
  if (typeof peer !== 'string' || !peer || peer === from ||
      (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId <= 0))) {
    return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Hội thoại hoặc mốc lịch sử không hợp lệ.' };
  }
  const other = userId.get(peer);
  if (other === undefined) return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content: 'Tài khoản không tồn tại.' };
  const rows = selectPage.all({ self: userId.get(from), other, before: beforeId, limit: PAGE_SIZE + 1 });
  const messages = rows.slice(0, PAGE_SIZE).reverse();
  const nextBeforeId = rows.length > PAGE_SIZE ? messages[0].id : null;
  return { type: TYPES.HISTORY, peer, messages, nextBeforeId };
}

module.exports = { getHistory };
