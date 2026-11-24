const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const db = require('../db');
const sessions = require('../sessions');
const { UPLOAD_DIRS, FILE_CHUNK_BYTES } = require('../config');
const { sha256File } = require('../utils/checksum');
const { TYPES } = require('../../common/protocol');
const { ERROR_CODES } = require('../../common/constants');
const { decodeChunk, readChunk, validFileName } = require('../../common/file');
const { mediaFormat, storedFile, folders } = require('../../common/media');
const { deliverPrivate } = require('./message');
const { isMember, notifyMembers } = require('./group');
const { canReply, replyPreview, reactionSummary } = require('./messageContext');

const uploads = new WeakMap();
const completed = new WeakMap();
const userId = db.prepare('SELECT id FROM users WHERE username = ?').pluck();
const insertFile = db.prepare(`
  INSERT INTO messages(id, sender_id, receiver_id, group_id, type, content, file_path, time, status, reply_to)
  VALUES ((SELECT message_id FROM next_chat_ids), ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const findDownload = db.prepare(`
  SELECT m.type, m.file_path, m.content FROM messages m JOIN users u ON u.username = ?
  WHERE m.id = ? AND m.type IN ('FILE', 'IMAGE', 'VIDEO', 'SOUND')
    AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = u.id) AND (
    u.id IN (m.sender_id, m.receiver_id) OR EXISTS (
      SELECT 1 FROM group_members gm WHERE gm.group_id = m.group_id AND gm.user_id = u.id
    )
  )
`);

function invalid(content) {
  return { type: TYPES.ERROR, code: ERROR_CODES.INVALID_INPUT, content };
}

async function discardUpload(socket) {
  const upload = uploads.get(socket);
  if (!upload) return;
  uploads.delete(socket);
  try {
    if (upload.handle) await upload.handle.close();
  } finally {
    await fs.rm(upload.temp, { force: true });
  }
}

async function begin(socket, { name, size, to, groupId, from, type, voice = false, replyTo = null }) {
  if (!validFileName(name) || !Number.isSafeInteger(size) || size < 0) return invalid('Tên hoặc kích thước tệp không hợp lệ.');
  const format = mediaFormat(name);
  if ((type !== TYPES.FILE && format.type !== type) || typeof voice !== 'boolean' || (voice && format.type !== TYPES.SOUND)) {
    return invalid('Loại nội dung không phù hợp với tệp.');
  }
  let receiverId = null;
  if (groupId !== undefined) {
    if (to !== undefined || !Number.isSafeInteger(groupId) || !isMember(from, groupId)) return invalid('Không thể gửi tệp vào nhóm này.');
  } else {
    receiverId = typeof to === 'string' ? userId.get(to) : null;
    if (!receiverId || to === from) return invalid('Tài khoản nhận tệp không hợp lệ.');
  }
  if (!canReply(from, to, groupId, replyTo)) return invalid('Tin nhắn gốc không còn khả dụng trong hội thoại này.');
  await discardUpload(socket);
  const token = randomUUID();
  const dir = UPLOAD_DIRS[folders[format.type]];
  const temp = path.join(dir, token + '.part');
  await fs.mkdir(dir, { recursive: true });
  const handle = await fs.open(temp, 'wx');
  uploads.set(socket, { token, temp, dir, format, voice, handle, name, size, from, to, groupId, receiverId, replyTo, offset: 0 });
  completed.delete(socket);
  return { type: TYPES.FILE, token };
}

async function download({ action, id, from, offset }) {
  const row = Number.isSafeInteger(id) && findDownload.get(from, id);
  if (!row) return invalid('Bạn không có quyền tải tệp này hoặc tệp không tồn tại.');
  const file = storedFile(row.content);
  const filename = path.join(UPLOAD_DIRS[folders[row.type]], row.file_path);
  if (action === 'info') {
    if ((await fs.stat(filename)).size !== file.size) return invalid('Kích thước tệp lưu trên Server đã thay đổi.');
    return { type: TYPES.FILE, file };
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= file.size) return invalid('Vị trí đọc khối không hợp lệ.');
  const handle = await fs.open(filename, 'r');
  try {
    const bytes = await readChunk(handle, offset, Math.min(FILE_CHUNK_BYTES, file.size - offset));
    return { type: TYPES.FILE, offset, data: bytes.toString('base64') };
  } finally {
    await handle.close();
  }
}

async function handleFile(socket, packet) {
  const { action, from, token, time } = packet;
  if (!from) return { type: TYPES.ERROR, code: ERROR_CODES.NOT_LOGGED_IN, content: 'Hãy đăng nhập để truyền tệp.' };
  if (action === 'begin') return begin(socket, packet);
  if (action === 'info' || action === 'read') {
    try {
      return await download(packet);
    } catch (error) {
      if (error.code === 'ENOENT') return invalid('Tệp không còn trên Server.');
      throw error;
    }
  }
  const last = completed.get(socket);
  if (action === 'finish' && last && last.from === from && last.token === token) {
    const { groupId } = last.reply.message;
    if (groupId && !isMember(from, groupId)) return invalid('Nhóm không còn tồn tại.');
    const original = last.reply.message;
    if (!findDownload.get(from, original.id)) return invalid('Tin nhắn tệp đã được thu hồi.');
    const message = { ...original };
    if (message.reply) message.reply = replyPreview(message.reply.id, from);
    const summary = reactionSummary(message.id, from);
    if (summary.reactions.length) Object.assign(message, summary);
    return { ...last.reply, message };
  }
  const u = uploads.get(socket);
  if (!u || u.token !== token || u.from !== from) return invalid('Phiên gửi tệp không hợp lệ.');
  if (action === 'cancel') {
    await discardUpload(socket);
    return { type: TYPES.FILE };
  }
  if (u.groupId && !isMember(from, u.groupId)) {
    await discardUpload(socket);
    return invalid('Nhóm không còn tồn tại.');
  }
  if (action === 'chunk') {
    if (packet.offset !== u.offset) return invalid('Khối tệp sai thứ tự.');
    let bytes;
    try {
      bytes = decodeChunk(packet.data, Math.min(FILE_CHUNK_BYTES, u.size - u.offset));
    } catch (error) {
      return invalid(error.message);
    }
    try {
      await u.handle.writeFile(bytes);
    } catch (error) {
      await discardUpload(socket);
      throw error;
    }
    u.offset += bytes.length;
    return { type: TYPES.FILE, offset: u.offset };
  }
  if (action !== 'finish') return invalid('Thao tác truyền tệp không hợp lệ.');
  if (u.offset !== u.size) return invalid('Tệp chưa đủ số byte.');
  await u.handle.close();
  u.handle = null;
  try {
    const sha256 = await sha256File(u.temp);
    if (sha256 !== packet.sha256) return invalid('SHA-256 không khớp. Hãy gửi lại tệp.');
    if (socket.destroyed || sessions.usernameOf(socket) !== from) return invalid('Phiên đã kết thúc.');
    const file = { name: u.name, size: u.size, sha256 };
    if (u.format.mime) file.mime = u.format.mime;
    if (u.voice) file.voice = true;
    const filename = path.join(u.dir, u.token);
    await fs.rename(u.temp, filename);
    // Tệp .part đã chuyển tên và handle đã đóng. Không chờ I/O dọn tệp sau khi phát MSG.
    uploads.delete(socket);
    if (u.groupId && !isMember(from, u.groupId)) {
      await fs.unlink(filename);
      return invalid('Nhóm không còn tồn tại.');
    }
    if (!canReply(from, u.to, u.groupId, u.replyTo)) {
      await fs.unlink(filename);
      return invalid('Tin nhắn gốc không còn khả dụng trong hội thoại này.');
    }
    let id;
    try {
      id = insertFile.run(userId.get(from), u.receiverId, u.groupId ?? null, u.format.type, JSON.stringify(file),
        u.token, time, u.groupId ? 'sent' : 'queued', u.replyTo).lastInsertRowid;
    } catch (error) {
      await fs.unlink(filename);
      throw error;
    }
    const target = u.groupId ? { groupId: u.groupId } : { to: u.to, status: 'sent' };
    const message = { type: TYPES.MSG, id, from, time, file, ...target };
    if (u.replyTo) message.reply = replyPreview(u.replyTo, from);
    const reply = { type: TYPES.FILE, message };
    completed.set(socket, { from, token, reply });
    if (u.groupId) notifyMembers(u.groupId, from, message);
    else deliverPrivate(u.to);
    return reply;
  } finally {
    if (uploads.get(socket) === u) await discardUpload(socket);
  }
}

async function endFileSession(socket) {
  completed.delete(socket);
  await discardUpload(socket);
}

module.exports = { handleFile, endFileSession };
