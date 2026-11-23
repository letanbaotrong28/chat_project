const path = require('node:path');
const { DEFAULT_PORT, MAX_PACKET_BYTES, FILE_CHUNK_BYTES } = require('../common/constants');

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new RangeError('PORT phải là số nguyên từ 1 đến 65535.');
}
const DATA_DIR = process.env.CHAT_DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.CHAT_UPLOAD_DIR || path.join(__dirname, 'uploads');
const UPLOAD_DIRS = Object.fromEntries(
  ['files', 'images', 'videos', 'sounds'].map(name => [name, path.join(UPLOAD_DIR, name)])
);
module.exports = { HOST: '0.0.0.0', PORT, DATA_DIR, UPLOAD_DIRS, MAX_PACKET_BYTES, FILE_CHUNK_BYTES };
