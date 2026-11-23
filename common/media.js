const path = require('node:path');

const mimeTypes = new Map(Object.entries({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.weba': 'audio/webm', '.flac': 'audio/flac'
}));
const folders = { FILE: 'files', IMAGE: 'images', VIDEO: 'videos', SOUND: 'sounds' };

function mediaFormat(name) {
  const extension = path.extname(name).toLowerCase();
  const mime = mimeTypes.get(extension);
  if (!mime) return { type: 'FILE' };
  const type = { image: 'IMAGE', video: 'VIDEO', audio: 'SOUND' }[mime.split('/')[0]];
  return { type, mime, extension };
}

// Tệp cũ của phần 9 chỉ lưu tên, kích thước và checksum.
function storedFile(json) {
  const file = JSON.parse(json);
  const { mime } = mediaFormat(file.name);
  if (mime) file.mime = mime;
  return file;
}

module.exports = { mediaFormat, storedFile, folders, MAX_VOICE_BYTES: 16 * 1024 * 1024 };
