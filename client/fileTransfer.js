const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { FILE_CHUNK_BYTES } = require('../common/constants');
const { readChunk, decodeChunk, validFileName } = require('../common/file');
const { mediaFormat } = require('../common/media');

async function uploadFile(channel, peer, filename, progress, voice = false) {
  const handle = await fs.open(filename, 'r');
  let token;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !Number.isSafeInteger(stat.size)) throw new Error('Hãy chọn một tệp thông thường.');
    const name = path.basename(filename);
    const size = stat.size;
    const target = typeof peer === 'number' ? { groupId: peer } : { to: peer };
    ({ token } = await channel.request('begin', { ...target, name, size, voice }, mediaFormat(name).type));
    const hash = createHash('sha256');
    let offset = 0;
    progress(0, size, name);
    while (offset < size) {
      const bytes = await readChunk(handle, offset, Math.min(FILE_CHUNK_BYTES, size - offset));
      const reply = await channel.request('chunk', { token, offset, data: bytes.toString('base64') });
      offset += bytes.length;
      if (reply.offset !== offset) throw new Error('Server xác nhận sai vị trí khối.');
      hash.update(bytes);
      progress(offset, size, name);
    }
    if ((await handle.stat()).size !== size) throw new Error('Kích thước tệp nguồn đã thay đổi.');
    await channel.request('finish', { token, sha256: hash.digest('hex') });
  } catch (error) {
    if (token) await channel.request('cancel', { token }).catch(() => {});
    throw error;
  } finally {
    await handle.close();
  }
}

async function fileInfo(channel, id) {
  const { file } = await channel.request('info', { id });
  if (!file || !validFileName(file.name) || !Number.isSafeInteger(file.size) || file.size < 0 ||
      typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    throw new Error('Thông tin tệp từ Server không hợp lệ.');
  }
  return file;
}

async function downloadFile(channel, id, file, destination, progress) {
  channel.assertActive();
  // Chỉ đổi tên sau khi đối chiếu SHA-256, kể cả khi đích đã tồn tại.
  const temp = path.join(path.dirname(destination), '.' + randomUUID() + '.part');
  const handle = await fs.open(temp, 'wx');
  try {
    try {
      const hash = createHash('sha256');
      let offset = 0;
      progress(0, file.size, file.name);
      while (offset < file.size) {
        const reply = await channel.request('read', { id, offset });
        if (reply.offset !== offset) throw new Error('Khối tải về sai thứ tự.');
        const bytes = decodeChunk(reply.data, Math.min(FILE_CHUNK_BYTES, file.size - offset));
        await handle.writeFile(bytes);
        hash.update(bytes);
        offset += bytes.length;
        progress(offset, file.size, file.name);
      }
      if (hash.digest('hex') !== file.sha256) throw new Error('SHA-256 của tệp tải về không khớp. Hãy tải lại.');
    } finally {
      await handle.close();
    }
    channel.assertActive();
    await fs.rename(temp, destination);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

module.exports = { uploadFile, fileInfo, downloadFile };
