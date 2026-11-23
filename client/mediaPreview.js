const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { Readable } = require('node:stream');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { mediaFormat } = require('../common/media');
const { fileInfo, downloadFile } = require('./fileTransfer');

function createMediaPreview(getChannel) {
  let session = null;
  const cleanup = new Set();

  function reset(loggedIn = false) {
    const old = session;
    session = loggedIn ? { key: randomUUID(), files: new Map(), dir: null } : null;
    if (old?.dir) {
      const done = Promise.allSettled(old.files.values()).then(async () => {
        const dir = await old.dir;
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 4 });
      }).catch(error => console.warn('Không dọn được bộ nhớ đệm media:', error.code));
      cleanup.add(done);
      done.then(() => cleanup.delete(done));
    }
    return session?.key;
  }

  async function cache(current, id) {
    const channel = getChannel();
    const file = await fileInfo(channel, id);
    const format = mediaFormat(file.name);
    if (!format.mime) throw new Error('Tệp không có bản xem trước.');
    if (current !== session) throw new Error('Phiên đã kết thúc.');
    current.dir ??= fs.mkdtemp(path.join(os.tmpdir(), 'chat-preview-'));
    const dir = await current.dir;
    channel.assertActive();
    const filename = path.join(dir, id + format.extension);
    await downloadFile(channel, id, file, filename, () => {});
    return { filename, mime: format.mime, size: file.size };
  }

  async function respond(request) {
    const url = new URL(request.url);
    const current = session;
    const [, key, value] = url.pathname.split('/');
    const id = Number(value);
    if (!current || url.host !== 'preview' || key !== current.key ||
        !Number.isSafeInteger(id) || id <= 0 || request.method !== 'GET') return new Response(null, { status: 404 });
    try {
      if (!current.files.has(id)) {
        current.files.set(id, cache(current, id).catch(error => {
          current.files.delete(id);
          throw error;
        }));
      } else {
        // Quyền xem có thể thay đổi trong cùng phiên khi chủ nhóm xóa nhóm.
        await fileInfo(getChannel(), id);
      }
      const { filename, mime, size } = await current.files.get(id);
      if (current !== session) return new Response(null, { status: 403 });
      const range = request.headers.get('range');
      const headers = new Headers({ 'Content-Type': mime, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' });
      let start = 0;
      let end = size - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match?.[1]) {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        } else if (match?.[2]) {
          start = Math.max(0, size - Number(match[2]));
        } else return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
        if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
        headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
      }
      headers.set('Content-Length', String(end - start + 1));
      const body = size ? Readable.toWeb(createReadStream(filename, { start, end, signal: request.signal })) : null;
      return new Response(body, { status: range ? 206 : 200, headers });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
  function close() {
    reset();
    return Promise.all(cleanup);
  }
  return { reset, respond, close };
}

module.exports = { createMediaPreview };
