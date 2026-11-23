const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { encode, createPacketReader } = require('../common/protocol');

async function connect(port, sockets) {
  const socket = net.createConnection(port, '127.0.0.1');
  sockets.add(socket);
  await once(socket, 'connect');
  socket.setTimeout(10000, () => socket.destroy(new Error('Hết thời gian chờ phản hồi.')));
  async function* responses() {
    const read = createPacketReader();
    for await (const chunk of socket) yield* read(chunk);
  }
  const replies = responses();
  return {
    socket,
    async send(...packets) {
      // Gửi liền các gói để buộc Server giữ thứ tự qua ranh giới bất đồng bộ.
      socket.write(Buffer.concat(packets.map(encode)));
      const result = [];
      for (let i = 0; i < packets.length; i++) {
        const { value, done } = await replies.next();
        assert.equal(done, false, 'Server đóng kết nối trước khi trả lời');
        assert.ok(Number.isFinite(Date.parse(value.time)));
        assert.ok(!('password' in value) && !('password_hash' in value));
        result.push(value);
      }
      return result;
    }
  };
}

test('Tài khoản và phiên qua TCP', { timeout: 30000 }, async t => {
  // Tạo CSDL riêng trước khi nạp Server, tránh ghi tài khoản test vào đồ án.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-auth-'));
  process.env.CHAT_DATA_DIR = dir;
  const db = require('../server/db');
  const sessions = require('../server/sessions');
  const { createChatServer } = require('../server/server');
  const server = createChatServer();
  const sockets = new Set();
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    db.close();
    fs.unlinkSync(path.join(dir, 'chat.db'));
    fs.rmdirSync(dir);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const a = await connect(server.address().port, sockets);
  const b = await connect(server.address().port, sockets);
  const creds = { username: 'Bảo', password: ' demo 🔑 123 ' };
  const register = { type: 'REGISTER', ...creds };
  const login = { type: 'LOGIN', ...creds };
  const ping = { type: 'PING', from: 'giả', time: 'giả' };
  const logout = { type: 'LOGOUT', username: 'người-khác' };

  await t.test('Từ chối dữ liệu thiếu, sai kiểu, mật khẩu ngắn hoặc vượt 72 byte', async () => {
    for (const invalid of [{ username: '' }, { username: 'a b' }, { username: 12 },
      { password: null }, { password: 'ngắn' }, { password: '🔑'.repeat(19) }]) {
      const [reply] = await a.send({ ...register, ...invalid });
      assert.equal(reply.type, 'ERROR');
      assert.equal(reply.code, 'INVALID_INPUT');
    }
    assert.equal(db.prepare('SELECT count(*) FROM users').pluck().get(), 0);
  });

  await t.test('Hai đăng ký đồng thời tạo đúng một tài khoản và lưu hash bcrypt', async () => {
    const replies = (await Promise.all([
      a.send({ ...register, username: '  ' + creds.username.normalize('NFD') + '  ' }),
      b.send(register)
    ])).flat();
    assert.deepEqual(replies.map(p => p.type).sort(), ['ERROR', 'REGISTER']);
    assert.equal(replies.find(p => p.type === 'ERROR').code, 'USERNAME_TAKEN');
    assert.ok(replies.every(p => p.from === null));
    const rows = db.prepare('SELECT username, password_hash FROM users').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].username, creds.username);
    assert.notEqual(rows[0].password_hash, creds.password);
    const bcrypt = require(require.resolve('bcryptjs', { paths: [path.resolve(__dirname, '../server')] }));
    assert.ok(await bcrypt.compare(creds.password, rows[0].password_hash));
  });

  await t.test('Sai mật khẩu hoặc tên không tồn tại đều giữ socket ở trạng thái khách', async () => {
    const [wrong, missing, guest] = await a.send(
      { ...login, password: creds.password.trim() }, { ...login, username: 'unknown' }, ping
    );
    assert.equal(wrong.code, 'INVALID_CREDENTIALS');
    assert.equal(missing.code, wrong.code);
    assert.equal(guest.from, null);
  });

  await t.test('LOGIN → PING → LOGOUT → PING trong cùng luồng byte', async () => {
    const replies = await a.send(login, ping, logout, ping, logout);
    assert.deepEqual(replies.map(p => p.type), ['LOGIN', 'PING', 'LOGOUT', 'PING', 'ERROR']);
    assert.deepEqual(replies.map(p => p.from), [creds.username, creds.username, null, null, null]);
    assert.equal(replies[4].code, 'NOT_LOGGED_IN');
  });

  await t.test('Hai Client tranh cùng tài khoản, thu hồi phiên khi Client ngắt', async () => {
    const [[first], [second]] = await Promise.all([a.send(login), b.send(login)]);
    const [owner, guest] = first.type === 'LOGIN' ? [a, b] : [b, a];
    assert.deepEqual([first.type, second.type].sort(), ['ERROR', 'LOGIN']);
    assert.equal([first, second].find(p => p.type === 'ERROR').code, 'ACCOUNT_IN_USE');
    const [repeat] = await owner.send(login);
    assert.equal(repeat.code, 'ALREADY_LOGGED_IN');
    const [denied] = await guest.send({ type: 'LOGOUT', username: creds.username });
    assert.equal(denied.code, 'NOT_LOGGED_IN');
    const closed = new Promise(resolve => sessions.get(creds.username).once('close', resolve));
    owner.socket.resetAndDestroy();
    await closed;
    assert.equal(sessions.get(creds.username), undefined);
    const [again, bye] = await guest.send(login, logout);
    assert.equal(again.from, creds.username);
    assert.equal(bye.type, 'LOGOUT');
  });
});
