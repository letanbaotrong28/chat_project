const db = require('../db');
const { TYPES } = require('../../common/protocol');
const { storedFile } = require('../../common/media');

const accessible = db.prepare(`
  SELECT m.id, m.content, m.type, m.file_path, m.recalled_at, m.group_id AS groupId,
    author.username AS sender, recipient.username AS recipient, viewer.id AS viewerId,
    EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id=m.id AND h.user_id=viewer.id) AS hidden
  FROM messages m JOIN users author ON author.id=m.sender_id
  LEFT JOIN users recipient ON recipient.id=m.receiver_id JOIN users viewer ON viewer.username=?
  WHERE m.id=? AND (
    (m.group_id IS NULL AND viewer.id IN (m.sender_id,m.receiver_id)) OR
    EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=m.group_id AND gm.user_id=viewer.id)
  )
`);
const audience = db.prepare(`
  WITH participants(user_id) AS (
    SELECT sender_id FROM messages WHERE id=@id AND group_id IS NULL
    UNION ALL
    SELECT receiver_id FROM messages WHERE id=@id AND group_id IS NULL
    UNION ALL
    SELECT gm.user_id FROM messages m JOIN group_members gm ON gm.group_id=m.group_id WHERE m.id=@id
  )
  SELECT u.username FROM participants p JOIN users u ON u.id=p.user_id
  WHERE u.username<>@actor AND NOT EXISTS (
    SELECT 1 FROM hidden_messages h WHERE h.message_id=@id AND h.user_id=u.id
  )
`).pluck();

const counts = db.prepare(`
  SELECT r.emoji, COUNT(*) AS count, MAX(u.username=?) AS mine
  FROM message_reactions r JOIN users u ON u.id=r.user_id
  WHERE r.message_id=? GROUP BY r.emoji ORDER BY count DESC, r.emoji
`);

function canReply(from, to, groupId, id) {
  if (id == null) return true;
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const row = accessible.get(from, id);
  if (!row || row.hidden || row.recalled_at) return false;
  if (groupId !== undefined) return groupId === row.groupId;
  return row.groupId === null && (row.sender === from ? row.recipient : row.sender) === to;
}

function replyPreview(id, viewer) {
  const row = accessible.get(viewer, id);
  if (!row || row.hidden || row.recalled_at) return { id };
  let text = row.content;
  if (row.type !== TYPES.MSG) {
    const file = storedFile(row.content);
    text = file.voice ? 'Tin nhắn thoại' : file.name;
  }
  return { id, from: row.sender, text: Array.from(text).slice(0, 120).join('') };
}

function reactionSummary(id, viewer) {
  const rows = counts.all(viewer, id);
  return { reactions: rows.map(({ emoji, count }) => ({ emoji, count })),
    myReaction: rows.find(row => row.mine)?.emoji || null };
}

module.exports = { accessible, audience, canReply, replyPreview, reactionSummary };
