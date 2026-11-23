const { FILE_CHUNK_BYTES } = require('./constants');

function decodeChunk(data, length) {
  if (!Number.isInteger(length) || length < 1 || length > FILE_CHUNK_BYTES ||
      typeof data !== 'string' || data.length !== 4 * Math.ceil(length / 3)) {
    throw new Error('Kích thước khối tệp không hợp lệ.');
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length !== length || bytes.toString('base64') !== data) throw new Error('Dữ liệu khối tệp không hợp lệ.');
  return bytes;
}

async function readChunk(handle, offset, length) {
  const bytes = Buffer.allocUnsafe(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(bytes, filled, length - filled, offset + filled);
    if (!bytesRead) throw new Error('Tệp kết thúc trước kích thước đã khai báo.');
    filled += bytesRead;
  }
  return bytes;
}

function validFileName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name !== '.' && name !== '..' &&
    Buffer.byteLength(name, 'utf8') <= 1024 && !/[\\/\p{Cc}]/u.test(name);
}

module.exports = { decodeChunk, readChunk, validFileName };
