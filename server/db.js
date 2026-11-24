const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'chat.db'));
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),
    group_id INTEGER REFERENCES groups(id),
    type TEXT NOT NULL,
    content TEXT,
    file_path TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    time TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_private_history ON messages(sender_id, receiver_id, id)
    WHERE group_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_chat_private_queue ON messages(receiver_id, id)
    WHERE group_id IS NULL AND status = 'queued';
  CREATE INDEX IF NOT EXISTS idx_chat_group_history ON messages(group_id, id)
    WHERE group_id IS NOT NULL;
  DROP INDEX IF EXISTS idx_private_history;
  DROP INDEX IF EXISTS idx_private_queue;
  DROP INDEX IF EXISTS idx_group_history;
  CREATE INDEX IF NOT EXISTS idx_groups_by_user ON group_members(user_id, group_id);
  -- Giữ mã đã cấp để một yêu cầu cũ không thể trỏ vào nhóm hoặc tệp mới.
  CREATE TABLE IF NOT EXISTS deleted_chat_ids (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    group_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO deleted_chat_ids VALUES (1, 0, 0);
  CREATE VIEW IF NOT EXISTS next_chat_ids AS
    SELECT 1 + MAX(group_id, COALESCE((SELECT MAX(id) FROM groups), 0)) AS group_id,
           1 + MAX(message_id, COALESCE((SELECT MAX(id) FROM messages), 0)) AS message_id
    FROM deleted_chat_ids;
  CREATE TABLE IF NOT EXISTS pending_file_deletions (
    type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    PRIMARY KEY (type, file_path)
  );
  CREATE TABLE IF NOT EXISTS hidden_messages (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
`);
// Nâng cấp cả chat.db đã có tin nhắn từ các phiên bản trước.
db.transaction(() => {
  const columns = db.pragma('table_info(messages)').map(column => column.name);
  if (!columns.includes('edited_at')) db.exec('ALTER TABLE messages ADD COLUMN edited_at TEXT');
  if (!columns.includes('recalled_at')) db.exec('ALTER TABLE messages ADD COLUMN recalled_at TEXT');
  if (!columns.includes('reply_to')) db.exec('ALTER TABLE messages ADD COLUMN reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_message_replies ON messages(reply_to) WHERE reply_to IS NOT NULL');
}).immediate();
module.exports = db;
