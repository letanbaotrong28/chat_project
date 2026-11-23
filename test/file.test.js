const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter, once } = require('node:events');
const { createHash, randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createNetwork } = require('../client/network');
const { uploadFile, fileInfo, downloadFile } = require('../client/fileTransfer');
const { createMediaPreview } = require('../client/mediaPreview');
const { FILE_CHUNK_BYTES } = require('../common/constants');

test('Truyền tệp qua TCP và ghép trên đĩa', { timeout: 30000 }, async t => {
  t.mock.method(console, 'log', () => {});
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chat-file-test-'));
  const uploadDir = path.join(dir, 'uploads');
  process.env.CHAT_DATA_DIR = dir;
  process.env.CHAT_UPLOAD_DIR = uploadDir;
  const db = require('../server/db');
  const { createChatServer } = require('../server/server');
  const server = createChatServer();
  const clients = [];
  const closing = new Set();
  server.on('connection', socket => {
    const closed = new Promise(resolve => socket.once('close', resolve));
    closing.add(closed);
    closed.then(() => closing.delete(closed));
  });
  t.after(async () => {
    for (const client of clients) client.close();
    await new Promise(resolve => server.close(resolve));
    await Promise.all(closing);
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const password = 'tep-demo-123';
  const bcrypt = require(require.resolve('bcryptjs', { paths: [path.resolve(__dirname, '../server')] }));
  const hash = bcrypt.hashSync(password, 4);
  for (const name of ['An', 'Bình', 'Lan']) db.prepare('INSERT INTO users(username,password_hash) VALUES (?,?)').run(name, hash);

  async function login(name) {
    const events = new EventEmitter();
    const client = createNetwork(event => {
      if (event.kind === 'received') events.emit(event.packet.type, event.packet);
      if (event.kind === 'state') events.emit(event.state);
    });
    clients.push(client);
    async function reply(type, send) {
      const received = once(events, type);
      send();
      return (await received)[0];
    }
    await reply('connected', () => client.connect('127.0.0.1', server.address().port));
    await reply('LOGIN', () => client.login(name, password));
    return { client, events, reply, channel: client.fileChannel() };
  }

  const alice = await login('An');
  const outsider = await login('Lan');
  const bytes = randomBytes(FILE_CHUNK_BYTES * 2 + 19);
  const source = path.join(dir, 'Dữ liệu.bin');
  const destination = path.join(dir, 'download.bin');
  await fs.writeFile(source, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const noop = () => {};
  let id;

  await t.test('Gửi nhiều khối khi người nhận offline, tải lại từ lịch sử và kiểm tra từng byte', async () => {
    const offsets = [];
    const sent = once(alice.events, 'MSG');
    await uploadFile(alice.channel, 'Bình', source, offset => offsets.push(offset));
    const [message] = await sent;
    id = message.id;
    assert.deepEqual(message.file, { name: path.basename(source), size: bytes.length, sha256: digest });
    assert.deepEqual(offsets, [0, FILE_CHUNK_BYTES, 2 * FILE_CHUNK_BYTES, bytes.length]);
    const bob = await login('Bình');
    const history = await bob.reply('HISTORY', () => bob.client.history('An', null, 1));
    assert.deepEqual(history.messages[0], message);
    const file = await fileInfo(bob.channel, id);
    const downloaded = [];
    await downloadFile(bob.channel, id, file, destination, offset => downloaded.push(offset));
    assert.deepEqual(downloaded, offsets);
    assert.deepEqual(await fs.readFile(destination), bytes);
    await assert.rejects(fileInfo(outsider.channel, id), /quyền/);
    await assert.rejects(outsider.channel.request('read', { id, offset: 0 }), /quyền/);
    bob.client.close();
  });

  await t.test('Sai thứ tự, thiếu byte hoặc checksum sai không tạo tin nhắn tệp', async () => {
    const request = alice.channel.request;
    const begin = { name: 'bản thử', size: 1, to: 'Bình' };
    await assert.rejects(request('begin', { ...begin, name: '../tep' }), /Tên/);
    const { token } = await request('begin', begin);
    await assert.rejects(request('chunk', { token, offset: 1, data: 'YQ==' }), /thứ tự/);
    await assert.rejects(request('chunk', { token, offset: 0, data: '!!!!' }), /khối/);
    await assert.rejects(request('finish', { token, sha256: digest }), /chưa đủ/);
    await request('chunk', { token, offset: 0, data: 'YQ==' });
    await assert.rejects(request('finish', { token, sha256: digest }), /SHA-256/);
    assert.equal(db.prepare("SELECT COUNT(*) FROM messages WHERE type='FILE'").pluck().get(), 1);
    assert.equal((await fs.readdir(path.join(uploadDir, 'files'))).length, 1);
  });

  await t.test('Lỗi kiểm tra khi tải giữ nguyên tệp đích đã có', async () => {
    const file = await fileInfo(alice.channel, id);
    const stored = db.prepare('SELECT file_path FROM messages WHERE id=?').pluck().get(id);
    await fs.writeFile(path.join(uploadDir, 'files', stored), Buffer.alloc(bytes.length));
    await assert.rejects(downloadFile(alice.channel, id, file, destination, noop), /SHA-256/);
    assert.deepEqual(await fs.readFile(destination), bytes);
    assert.ok((await fs.readdir(dir)).every(name => !name.endsWith('.part')));
  });

  await t.test('Tệp rỗng trong nhóm, quyền tải của thành viên và gửi lại lệnh hoàn tất', async () => {
    const created = await alice.reply('GROUP_CREATE', () => alice.client.createGroup('Nhóm tệp'));
    const groupId = created.group.id;
    await alice.reply('GROUP_ADD', () => alice.client.addMember(groupId, 'Bình'));
    const bob = await login('Bình');
    const count = db.prepare("SELECT COUNT(*) FROM messages WHERE type='FILE'").pluck();
    const { token } = await alice.channel.request('begin', { groupId, name: 'rỗng.txt', size: 0 });
    const finish = { token, sha256: createHash('sha256').digest('hex') };
    const delivered = once(bob.events, 'MSG');
    const { message } = await alice.channel.request('finish', finish);
    assert.deepEqual((await delivered)[0], message);
    assert.deepEqual((await alice.channel.request('finish', finish)).message, message);
    assert.equal(count.get(), 2);
    const file = await fileInfo(bob.channel, message.id);
    await downloadFile(bob.channel, message.id, file, destination, noop);
    assert.equal((await fs.stat(destination)).size, 0);
    await assert.rejects(fileInfo(outsider.channel, message.id), /quyền/);
    await assert.rejects(outsider.channel.request('begin', { groupId, name: 'a.bin', size: 0 }), /nhóm/);
  });

  await t.test('Ngắt kết nối giữa các khối dọn tệp tạm và cho phép gửi lại', async () => {
    const begin = { name: 'dang-gui.bin', size: bytes.length, to: 'An' };
    const { token } = await outsider.channel.request('begin', begin);
    await outsider.channel.request('chunk', { token, offset: 0, data: bytes.subarray(0, FILE_CHUNK_BYTES).toString('base64') });
    const partial = path.join(uploadDir, 'files', token + '.part');
    assert.equal((await fs.stat(partial)).size, FILE_CHUNK_BYTES);
    outsider.client.close();
    for (let i = 0; i < 100 && (await fs.stat(partial).catch(() => null)); i++) await delay(10);
    await assert.rejects(fs.stat(partial), { code: 'ENOENT' });
    assert.equal(db.prepare("SELECT COUNT(*) FROM messages WHERE type='FILE'").pluck().get(), 2);
    const again = await login('Lan');
    await uploadFile(again.channel, 'An', source, noop);
    assert.equal(db.prepare("SELECT COUNT(*) FROM messages WHERE type='FILE'").pluck().get(), 3);
  });

  await t.test('Ảnh, video, âm thanh và bản ghi dùng chung khối, checksum và lịch sử', async () => {
    const group = db.prepare('SELECT id FROM groups WHERE name=?').pluck().get('Nhóm tệp');
    const examples = [
      ['ảnh.PNG', 'image/png', 'IMAGE', 'images', false],
      ['phim.webm', 'video/webm', 'VIDEO', 'videos', false],
      ['nhạc.wav', 'audio/wav', 'SOUND', 'sounds', false],
      ['ghi-am.weba', 'audio/webm', 'SOUND', 'sounds', true]
    ];
    for (const [name, mime, type, folder, voice] of examples) {
      const input = path.join(dir, name);
      await fs.writeFile(input, bytes);
      const sent = once(alice.events, 'MSG');
      await uploadFile(alice.channel, group, input, noop, voice);
      const [msg] = await sent;
      assert.equal(msg.file.mime, mime);
      assert.equal(Boolean(msg.file.voice), voice);
      const row = db.prepare('SELECT type, file_path FROM messages WHERE id=?').get(msg.id);
      assert.equal(row.type, type);
      assert.deepEqual(await fs.readFile(path.join(uploadDir, folder, row.file_path)), bytes);
      assert.deepEqual(await fileInfo(alice.channel, msg.id), msg.file);
      const history = await alice.reply('HISTORY', () => alice.client.history(group, null, 10));
      assert.deepEqual(history.messages.at(-1), msg);
      if (type === 'VIDEO') {
        const preview = createMediaPreview(() => alice.channel);
        const key = preview.reset(true);
        const url = 'chat-media://preview/' + key + '/' + msg.id;
        try {
          const clip = await preview.respond(new Request(url, { headers: { Range: 'bytes=17-273' } }));
          assert.equal(clip.status, 206);
          assert.equal(clip.headers.get('Content-Type'), mime);
          assert.equal(clip.headers.get('Content-Range'), 'bytes 17-273/' + bytes.length);
          assert.deepEqual(Buffer.from(await clip.arrayBuffer()), bytes.subarray(17, 274));
          const invalid = await preview.respond(new Request(url, { headers: { Range: 'bytes=' + bytes.length + '-' } }));
          assert.equal(invalid.status, 416);
          preview.reset(true);
          assert.equal((await preview.respond(new Request(url))).status, 404);
        } finally {
          await preview.close();
        }
      }
    }
    await assert.rejects(alice.channel.request('begin', { groupId: group, name: 'a.svg', size: 0 }, 'IMAGE'), /không phù hợp/);
    const oldName = 'ảnh-cũ.jpg';
    const oldFile = { name: oldName, size: bytes.length, sha256: digest };
    const stored = db.prepare('SELECT file_path FROM messages WHERE id=?').pluck().get(id);
    await fs.writeFile(path.join(uploadDir, 'files', stored), bytes);
    db.prepare('UPDATE messages SET content=? WHERE id=?').run(JSON.stringify(oldFile), id);
    const info = await fileInfo(alice.channel, id);
    assert.equal(info.mime, 'image/jpeg');
    await downloadFile(alice.channel, id, info, destination, noop);
    assert.deepEqual(await fs.readFile(destination), bytes);
  });

  await t.test('Xóa nhóm thu hồi tệp và bản xem trước, chặn truyền dở, giữ tệp chat riêng', async () => {
    const groupId = db.prepare('SELECT id FROM groups WHERE name=?').pluck().get('Nhóm tệp');
    const attachments = db.prepare('SELECT id, type, file_path FROM messages WHERE group_id=?').all(groupId);
    const video = attachments.find(row => row.type === 'VIDEO');
    const preview = createMediaPreview(() => alice.channel);
    const url = 'chat-media://preview/' + preview.reset(true) + '/' + video.id;
    try {
      const response = await preview.respond(new Request(url));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      const { token } = await alice.channel.request('begin', { groupId, name: 'dang-gui.txt', size: 0 });
      const deleted = await alice.reply('GROUP_DELETE', () => alice.client.deleteGroup(groupId));
      assert.equal(deleted.groupId, groupId);
      await assert.rejects(alice.channel.request('finish', { token, sha256: digest }), /nhóm/i);
      assert.equal((await preview.respond(new Request(url))).status, 404);
      const { folders } = require('../common/media');
      for (const row of attachments) {
        await assert.rejects(fileInfo(alice.channel, row.id), /quyền/);
        await assert.rejects(fs.stat(path.join(uploadDir, folders[row.type], row.file_path)), { code: 'ENOENT' });
      }
      assert.equal(db.prepare('SELECT COUNT(*) FROM pending_file_deletions').pluck().get(), 0);
      assert.equal((await fileInfo(alice.channel, id)).size, bytes.length);
      await downloadFile(alice.channel, id, await fileInfo(alice.channel, id), destination, noop);
      assert.deepEqual(await fs.readFile(destination), bytes);
    } finally {
      await preview.close();
    }
  });
});
