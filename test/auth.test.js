const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { encode, createPacketReader } = require('../common/protocol');
const testHost = process.env.CHAT_TEST_HOST || '127.0.0.1';

async function connect(port, sockets) {
  const socket = net.createConnection(port, testHost);
  sockets.add(socket);
  await once(socket, 'connect');
  socket.setTimeout(10000, () => socket.destroy(new Error('Hết thời gian chờ phản hồi.')));
  async function* responses() {
    const read = createPacketReader();
    for await (const chunk of socket) yield* read(chunk);
  }
  const replies = responses();
  const states = [];
  async function nextPacket() {
    const { value, done } = await replies.next();
    assert.equal(done, false, 'Server đóng kết nối trước khi trả lời');
    assert.ok(Number.isFinite(Date.parse(value.time)));
    assert.ok(!('password' in value) && !('password_hash' in value));
    return value;
  }
  return {
    socket, states,
    async nextReply() {
      let packet = await nextPacket();
      while (packet.type === 'STATE') {
        states.push(packet);
        packet = await nextPacket();
      }
      return packet;
    },
    async nextState() {
      const packet = states.shift() || await nextPacket();
      assert.equal(packet.type, 'STATE');
      return packet;
    },
    async send(...packets) {
      // Gửi liền các gói để buộc Server giữ thứ tự qua ranh giới bất đồng bộ.
      socket.write(Buffer.concat(packets.map(encode)));
      const result = [];
      for (let i = 0; i < packets.length; i++) {
        result.push(await this.nextReply());
      }
      return result;
    }
  };
}

test('Tài khoản và phiên qua TCP', { timeout: 30000 }, async t => {
  t.mock.method(console, 'log', () => {}); // Tách log kết nối khỏi đầu ra của test runner.
  // Tạo CSDL riêng trước khi nạp Server, tránh ghi tài khoản test vào đồ án.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-auth-'));
  process.env.CHAT_DATA_DIR = dir;
  const db = require('../server/db');
  const sessions = require('../server/sessions');
  const { createChatServer } = require('../server/server');
  const server = createChatServer();
  const sockets = new Set();
  const serverSockets = new Set();
  server.on('connection', socket => {
    serverSockets.add(socket);
    socket.once('close', () => serverSockets.delete(socket));
  });
  t.after(async () => {
    const closed = Array.from(serverSockets, socket => new Promise(resolve => socket.once('close', resolve)));
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await Promise.all(closed);
    db.close();
    fs.unlinkSync(path.join(dir, 'chat.db'));
    fs.rmdirSync(dir);
  });
  server.listen(0, testHost);
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

  await t.test('Danh sách và STATE trực tiếp khi đăng ký, đăng nhập, đăng xuất và mất TCP', async () => {
    const alice = await connect(server.address().port, sockets);
    const bob = await connect(server.address().port, sockets);
    const guest = await connect(server.address().port, sockets);
    const bobLogin = { ...login, username: 'An' };
    async function expectChange(status) {
      const p = await alice.nextState();
      assert.deepEqual([p.kind, p.username, p.status, p.from], ['change', 'An', status, null]);
    }
    await alice.send(login);
    const empty = await alice.nextState();
    assert.deepEqual(empty.contacts, []);
    assert.equal(empty.complete, true);
    await bob.send({ ...register, username: 'An' });
    await expectChange('offline');
    await bob.send({ ...bobLogin, password: 'sai' });
    await bob.send(bobLogin);
    await expectChange('online');
    const page = await bob.nextState();
    assert.deepEqual(page.contacts, [{ username: creds.username, status: 'online' }]);
    await bob.send(logout);
    await expectChange('offline');
    await bob.send(bobLogin);
    await expectChange('online');
    await bob.nextState();
    bob.socket.resetAndDestroy();
    await expectChange('offline');
    await guest.send(ping);
    assert.equal(guest.states.length, 0);
    await alice.send(logout);
    await guest.send(bobLogin);
    assert.deepEqual((await guest.nextState()).contacts, [{ username: creds.username, status: 'offline' }]);
    await alice.send(ping);
    assert.equal(alice.states.length, 0);
    await guest.send(logout);
  });

  await t.test('Danh sách nhiều trang đủ tên, đúng trạng thái và không lặp', async () => {
    const insert = db.prepare('INSERT INTO users (username, password_hash) SELECT ?, password_hash FROM users WHERE username = ?');
    db.transaction(() => {
      for (let i = 0; i < 150; i++) insert.run('demo' + i, creds.username);
    })();
    const client = await connect(server.address().port, sockets);
    await client.send(login);
    const names = [];
    let pages = 0;
    let page;
    do {
      page = await client.nextState();
      for (const contact of page.contacts) {
        assert.equal(contact.status, 'offline');
        names.push(contact.username);
      }
      pages++;
    } while (!page.complete);
    assert.ok(pages > 1);
    assert.equal(names.length, 151);
    assert.equal(new Set(names).size, names.length);
    assert.ok(!names.includes(creds.username));
    await client.send(logout);
  });

  await t.test('MSG riêng tư, lưu đúng một lần, gán người gửi và thời gian từ Server', async () => {
    const sender = await connect(server.address().port, sockets);
    const receiver = await connect(server.address().port, sockets);
    const observer = await connect(server.address().port, sockets);
    const content = 'Chào An 👋❤️🧑‍💻\nDòng thứ hai <b>nguyên văn</b>';
    const msg = { type: 'MSG', to: 'An', content, from: 'giả', time: '2000-01-01', id: -1 };
    const count = () => db.prepare('SELECT COUNT(*) FROM messages').pluck().get();
    const before = count();
    assert.equal((await sender.send(msg))[0].code, 'NOT_LOGGED_IN');
    await sender.send(login);
    await receiver.send({ ...login, username: 'An' });
    await observer.send({ ...register, username: 'Lan' }, { ...login, username: 'Lan' });
    const [echo] = await sender.send(msg);
    assert.equal(echo.type, 'MSG');
    assert.equal(echo.from, creds.username);
    assert.equal(echo.to, 'An');
    assert.equal(echo.content, content);
    assert.notEqual(echo.time, msg.time);
    assert.ok(Number.isInteger(echo.id) && echo.id > 0);
    assert.deepEqual(await receiver.nextReply(), echo);
    assert.equal((await observer.send(ping))[0].type, 'PING');
    const row = db.prepare(`
      SELECT m.id, m.type, s.username AS "from", r.username AS "to", m.content, m.time,
        CASE WHEN m.status = 'queued' THEN 'sent' ELSE m.status END AS status
      FROM messages m JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.receiver_id
      WHERE m.id = ? AND m.group_id IS NULL
    `).get(echo.id);
    assert.deepEqual(row, echo);
    const [answer] = await receiver.send({ type: 'MSG', to: creds.username, content: 'Chào lại!' });
    assert.deepEqual(await sender.nextReply(), answer);
    assert.equal(answer.from, 'An');
    await sender.send({ type: 'ACK', id: answer.id, status: 'received' });
    await receiver.nextReply();
    for (const invalid of [{ content: '  ' }, { content: 5 }, { content: '👋'.repeat(4097) }, { to: creds.username }]) {
      const [error] = await sender.send({ ...msg, ...invalid });
      assert.equal(error.code, 'INVALID_INPUT');
      assert.equal(error.requestType, 'MSG');
    }
    await receiver.send(logout);
    const [offline] = await sender.send(msg);
    assert.equal(offline.type, 'MSG');
    assert.equal(db.prepare('SELECT status FROM messages WHERE id=?').pluck().get(offline.id), 'queued');
    assert.equal((await sender.send({ ...msg, to: 'absent' }))[0].code, 'RECIPIENT_UNAVAILABLE');
    assert.equal(count(), before + 3);
    assert.equal((await observer.send(ping))[0].type, 'PING');
    await sender.send(logout);
    await observer.send(logout);
  });

  await t.test('Tin offline và lịch sử riêng tư: phân trang ổn định khi có tin mới', async () => {
    const a = await connect(server.address().port, sockets);
    const b = await connect(server.address().port, sockets);
    const c = await connect(server.address().port, sockets);
    const alice = { ...login, username: 'An5' };
    const bob = { ...login, username: 'Bình5' };
    const history = { type: 'HISTORY_REQ', peer: bob.username, requestId: 44 };
    assert.equal((await c.send({ ...history, from: alice.username }))[0].code, 'NOT_LOGGED_IN');
    await a.send({ ...alice, type: 'REGISTER' }, alice);
    await b.send({ ...bob, type: 'REGISTER' });
    const maxText = '\u0001'.repeat(16384); // Khi mã hoá JSON, mỗi byte nội dung cần tới 6 byte.
    const expected = [];
    for (let i = 0; i < 23; i++) {
      const [echo] = await a.send({ type: 'MSG', to: bob.username, content: i >= 13 ? maxText : 'Tin ' + i });
      assert.equal(echo.type, 'MSG');
      expected.push(echo);
    }
    await b.send(bob);
    for (const stored of expected) {
      const { backlog, ...replayed } = await b.nextReply();
      assert.equal(backlog, true);
      assert.deepEqual(replayed, stored);
    }
    const [latest] = await a.send(history);
    assert.equal(latest.type, 'HISTORY');
    assert.equal(latest.requestId, 44);
    assert.deepEqual(latest.messages, expected.slice(-10));
    const [live] = await b.send({ type: 'MSG', to: alice.username, content: 'Mới hơn trang đầu' });
    assert.deepEqual(await a.nextReply(), live);
    const [older] = await a.send({ ...history, beforeId: latest.nextBeforeId });
    const [oldest] = await a.send({ ...history, beforeId: older.nextBeforeId });
    assert.deepEqual([...oldest.messages, ...older.messages, ...latest.messages], expected);
    assert.equal(oldest.nextBeforeId, null);
    for (const beforeId of [-1, 0, 1.2, '9']) {
      const [bad] = await a.send({ ...history, beforeId });
      assert.equal(bad.code, 'INVALID_INPUT');
      assert.equal(bad.requestId, 44);
    }
    await c.send(login);
    const [privatePage] = await c.send({ ...history, from: alice.username });
    assert.deepEqual(privatePage.messages, []);
    assert.equal((await c.send(history))[0].messages.length, 0);
    await a.send(logout);
    await b.send(...expected.map(msg => ({ type: 'ACK', id: msg.id, status: 'received' })));
    await b.send(logout, bob);
    // Lần đăng nhập sau chỉ nhận tin mới. Các tin đã chuyển vẫn đọc lại được.
    assert.equal((await b.send(ping))[0].type, 'PING');
    const [afterLogin] = await b.send({ ...history, peer: alice.username });
    assert.deepEqual(afterLogin.messages.at(-1), live);
  });

  await t.test('ACK riêng tư, không lùi trạng thái, phát lại khi mất kết nối trước ACK', async () => {
    const sender = await connect(server.address().port, sockets);
    let receiver = await connect(server.address().port, sockets);
    const third = await connect(server.address().port, sockets);
    const guest = await connect(server.address().port, sockets);
    const alice = { ...login, username: 'An6' };
    const bob = { ...login, username: 'Bình6' };
    const history = { type: 'HISTORY_REQ', peer: bob.username };
    await sender.send({ ...alice, type: 'REGISTER' }, alice);
    await receiver.send({ ...bob, type: 'REGISTER' });
    await third.send({ ...register, username: 'Chi6' }, { ...login, username: 'Chi6' });
    const [msg] = await sender.send({ type: 'MSG', to: bob.username, content: 'Tin cần xác nhận' });
    const received = { type: 'ACK', id: msg.id, status: 'received' };
    const seen = { ...received, status: 'seen' };
    assert.equal(msg.status, 'sent');
    assert.equal((await guest.send(received))[0].code, 'NOT_LOGGED_IN');
    assert.equal((await sender.send(seen))[0].code, 'INVALID_INPUT');
    assert.equal((await third.send({ ...seen, from: bob.username }))[0].code, 'INVALID_INPUT');
    await receiver.send(bob);
    assert.equal((await receiver.nextReply()).id, msg.id);
    assert.equal((await sender.send(history))[0].messages[0].status, 'sent');
    const closed = new Promise(resolve => sessions.get(bob.username).once('close', resolve));
    receiver.socket.resetAndDestroy();
    await closed;
    receiver = await connect(server.address().port, sockets);
    await receiver.send(bob);
    assert.equal((await receiver.nextReply()).id, msg.id);
    for (const bad of [{ id: -1 }, { id: 1.5 }, { status: 'sent' }, { id: 9999999 }]) {
      assert.equal((await receiver.send({ ...received, ...bad }))[0].code, 'INVALID_INPUT');
    }
    for (const ack of [received, seen]) {
      const [ok] = await receiver.send({ ...ack, from: 'giả', to: 'Chi6' });
      assert.deepEqual([ok.type, ok.id, ok.status, ok.from, ok.to],
        ['ACK', msg.id, ack.status, bob.username, alice.username]);
      assert.deepEqual(await sender.nextReply(), ok);
    }
    for (const ack of [seen, received]) assert.equal((await receiver.send(ack))[0].status, 'seen');
    assert.equal((await sender.send(ping))[0].type, 'PING');
    assert.equal((await third.send(ping))[0].type, 'PING');
    const [next] = await sender.send({ type: 'MSG', to: bob.username, content: 'Đọc sau' });
    await receiver.nextReply();
    await sender.send(logout);
    await receiver.send({ ...seen, id: next.id });
    await sender.send(alice);
    const [page] = await sender.send(history);
    assert.deepEqual(page.messages.map(m => [m.id, m.status]), [[msg.id, 'seen'], [next.id, 'seen']]);
    await receiver.send(logout, bob);
    assert.equal((await receiver.send(ping))[0].type, 'PING');
  });

  await t.test('Nhóm qua TCP: quyền thành viên, thông báo trực tiếp và lịch sử khi đăng nhập lại', async () => {
    const owner = await connect(server.address().port, sockets);
    const member = await connect(server.address().port, sockets);
    const outsider = await connect(server.address().port, sockets);
    const create = { type: 'GROUP_CREATE', name: '  Nhóm học  ' };
    const add = { type: 'GROUP_ADD', username: 'Lan7' };
    const memberLogin = { ...login, username: 'Lan7' };
    const remove = { type: 'GROUP_DELETE', from: 'An7' };
    assert.equal((await owner.send({ ...remove, groupId: 1 }))[0].code, 'NOT_LOGGED_IN');
    assert.equal((await owner.send(create))[0].code, 'NOT_LOGGED_IN');
    assert.equal((await owner.send(add))[0].code, 'NOT_LOGGED_IN');
    await owner.send({ ...register, username: 'An7' }, { ...login, username: 'An7' });
    await member.send({ ...memberLogin, type: 'REGISTER' }, memberLogin);
    await outsider.send({ ...register, username: 'Tam7' }, { ...login, username: 'Tam7' });
    for (const name of ['', 'x'.repeat(81), 'hai\ndòng']) {
      assert.equal((await owner.send({ ...create, name }))[0].code, 'INVALID_INPUT');
    }
    const [created] = await owner.send({ ...create, from: 'giả' });
    const groupId = created.group.id;
    assert.ok(Number.isSafeInteger(groupId) && groupId > 0);
    assert.deepEqual(created.group, { id: groupId, name: 'Nhóm học', owner: 'An7', memberCount: 1 });
    const invite = { ...add, groupId };
    const msg = { type: 'MSG', groupId, content: '🎉❤️🧑‍💻', from: 'giả' };
    const history = { type: 'HISTORY_REQ', groupId, requestId: 71 };
    const deletion = { ...remove, groupId };
    assert.equal((await outsider.send(deletion))[0].code, 'INVALID_INPUT');
    assert.equal((await outsider.send({ ...invite, from: 'An7' }))[0].code, 'INVALID_INPUT');
    assert.equal((await owner.send({ ...invite, username: 'khong-tontai' }))[0].code, 'INVALID_INPUT');
    assert.equal((await owner.send({ ...msg, to: 'Tam7' }))[0].code, 'INVALID_INPUT');
    const [joined] = await owner.send(invite);
    assert.equal(joined.group.memberCount, 2);
    assert.deepEqual(await member.nextReply(), joined);
    assert.equal((await member.send(deletion))[0].code, 'INVALID_INPUT');
    assert.equal((await owner.send(invite))[0].code, 'INVALID_INPUT');
    assert.equal((await member.send({ ...invite, username: 'Tam7' }))[0].code, 'INVALID_INPUT');
    const [echo] = await member.send(msg);
    assert.equal(echo.from, 'Lan7');
    assert.equal(echo.groupId, groupId);
    assert.equal(echo.content, msg.content);
    assert.deepEqual(await owner.nextReply(), echo);
    assert.equal((await owner.send({ type: 'ACK', id: echo.id, status: 'seen' }))[0].code, 'INVALID_INPUT');
    assert.equal((await outsider.send(msg))[0].code, 'INVALID_INPUT');
    assert.equal((await outsider.send({ ...history, from: 'Lan7' }))[0].code, 'INVALID_INPUT');
    assert.equal((await member.send({ ...history, peer: 'An7' }))[0].code, 'INVALID_INPUT');
    assert.equal((await member.send({ type: 'HISTORY_REQ', peer: 'An7' }))[0].messages.length, 0);
    await member.send(logout);
    const offline = await owner.send(...Array.from({ length: 11 }, (_, i) => ({ ...msg, content: 'Tin ' + i })));
    await member.send(memberLogin);
    assert.equal((await member.send(ping))[0].type, 'PING');
    const restored = member.states.filter(p => p.kind === 'group').map(p => p.group);
    assert.deepEqual(restored, [joined.group]);
    const [latest] = await member.send(history);
    assert.equal(latest.requestId, 71);
    assert.deepEqual(latest.messages, offline.slice(-10));
    const [older] = await member.send({ ...history, beforeId: latest.nextBeforeId });
    assert.deepEqual(older.messages, [echo, offline[0]]);
    assert.equal(older.nextBeforeId, null);
    assert.equal((await outsider.send(ping))[0].type, 'PING');
    assert.ok(outsider.states.every(p => p.kind !== 'group'));
    await outsider.send(logout);
    const [addedOffline] = await owner.send({ ...invite, username: 'Tam7' });
    assert.equal(addedOffline.group.memberCount, 3);
    assert.deepEqual(await member.nextReply(), addedOffline);
    await outsider.send({ ...login, username: 'Tam7' });
    const [afterJoin] = await outsider.send(history);
    assert.deepEqual(afterJoin.messages, latest.messages);
    assert.deepEqual(outsider.states.filter(p => p.kind === 'group').at(-1).group, addedOffline.group);
    await outsider.send(logout);
    outsider.states.length = 0;
    const [deleted] = await owner.send(deletion);
    assert.equal(deleted.type, 'GROUP_DELETE');
    assert.equal(deleted.groupId, groupId);
    assert.deepEqual(await member.nextReply(), deleted);
    assert.equal((await member.send(history))[0].code, 'INVALID_INPUT');
    assert.equal((await member.send(msg))[0].code, 'INVALID_INPUT');
    assert.equal(db.prepare('SELECT COUNT(*) FROM messages WHERE group_id=?').pluck().get(groupId), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM group_members WHERE group_id=?').pluck().get(groupId), 0);
    await outsider.send({ ...login, username: 'Tam7' }, ping);
    assert.ok(outsider.states.every(p => p.kind !== 'group'));
    const [replacement] = await owner.send(create);
    assert.ok(replacement.group.id > groupId);
    assert.equal((await owner.send(deletion))[0].code, 'INVALID_INPUT');
    const [newMessage] = await owner.send({ ...msg, groupId: replacement.group.id });
    assert.ok(newMessage.id > offline.at(-1).id);

    const countGroups = db.prepare('SELECT COUNT(*) FROM groups').pluck();
    const before = countGroups.get();
    for (const members of ['Lan7', ['Lan7', 42], ['Lan7', 'khong-tontai']]) {
      assert.equal((await owner.send({ ...create, members }))[0].code, 'INVALID_INPUT');
      assert.equal(countGroups.get(), before);
    }
    await outsider.send(logout);
    const [withMembers] = await owner.send({ ...create, members: ['An7', 'Lan7', 'Lan7', 'Tam7'] });
    assert.equal(withMembers.group.memberCount, 3);
    await member.send(ping);
    assert.deepEqual(member.states.find(p => p.group?.id === withMembers.group.id)?.group, withMembers.group);
    await outsider.send({ ...login, username: 'Tam7' }, ping);
    assert.deepEqual(outsider.states.find(p => p.group?.id === withMembers.group.id)?.group, withMembers.group);
  });

  await t.test('Sửa và thu hồi tin riêng, tin nhóm, quyền theo từng người và hàng đợi offline', async () => {
    const sender = await connect(server.address().port, sockets);
    const reader = await connect(server.address().port, sockets);
    const third = await connect(server.address().port, sockets);
    const update = (id, action, content) => ({ type: 'MSG_UPDATE', id, action, content, from: 'TacGia' });
    assert.equal((await third.send(update(1, 'hide')))[0].code, 'NOT_LOGGED_IN');
    for (const [client, username] of [[sender, 'TacGia'], [reader, 'BanDoc'], [third, 'BanNhom']]) {
      await client.send({ ...register, username }, { ...login, username });
    }
    const direct = { type: 'MSG', to: 'BanDoc', content: 'Bản đầu' };
    const [original] = await sender.send(direct);
    await reader.nextReply();
    const history = { type: 'HISTORY_REQ', peer: 'TacGia' };
    for (const action of ['edit', 'hide', 'recall']) {
      assert.equal((await third.send(update(original.id, action, 'giả')))[0].code, 'INVALID_INPUT');
    }
    for (const action of ['edit', 'recall']) {
      assert.equal((await reader.send(update(original.id, action, 'giả')))[0].code, 'INVALID_INPUT');
    }
    for (const content of ['  ', 'a'.repeat(16385)]) {
      assert.equal((await sender.send(update(original.id, 'edit', content)))[0].code, 'INVALID_INPUT');
    }
    const [edited] = await sender.send(update(original.id, 'edit', 'Bản đã sửa'));
    assert.deepEqual(await reader.nextReply(), edited);
    const [page] = await reader.send(history);
    assert.deepEqual(page.messages, [{ ...original, content: edited.content, editedAt: edited.time }]);
    await reader.send(update(original.id, 'hide'), update(original.id, 'hide'));
    await sender.send(update(original.id, 'edit', 'Chỉ tác giả còn thấy'));
    assert.equal((await reader.send(ping))[0].type, 'PING');
    assert.deepEqual((await reader.send(history))[0].messages, []);
    await reader.send(logout);
    const [offline] = await sender.send(direct);
    await sender.send(update(offline.id, 'recall'), update(offline.id, 'recall'));
    assert.equal((await sender.send(update(offline.id, 'edit', 'thử lại')))[0].code, 'INVALID_INPUT');
    await reader.send({ ...login, username: 'BanDoc' });
    const backlog = await reader.nextReply();
    assert.equal(backlog.id, offline.id);
    assert.ok(backlog.recalledAt && backlog.backlog && !('content' in backlog));
    assert.deepEqual((await reader.send(history))[0].messages.map(m => m.id), [offline.id]);

    const [group] = await sender.send({ type: 'GROUP_CREATE', name: 'Ba người', members: ['BanDoc', 'BanNhom'] });
    const groupId = group.group.id;
    const [msg] = await third.send({ type: 'MSG', groupId, content: 'Nhóm' });
    await sender.nextReply();
    await reader.nextReply();
    assert.equal((await sender.send(update(msg.id, 'recall')))[0].code, 'INVALID_INPUT');
    await sender.send(update(msg.id, 'hide'));
    const [changed] = await third.send(update(msg.id, 'edit', 'Nhóm mới'));
    assert.deepEqual(await reader.nextReply(), changed);
    const [removed] = await third.send(update(msg.id, 'recall'));
    assert.deepEqual(await reader.nextReply(), removed);
    const groupPage = { type: 'HISTORY_REQ', groupId };
    assert.deepEqual((await sender.send(groupPage))[0].messages, []);
    const [placeholder] = (await reader.send(groupPage))[0].messages;
    assert.ok(placeholder.recalledAt && !('content' in placeholder) && !('editedAt' in placeholder));
    await third.send(update(msg.id, 'hide'));
    assert.deepEqual((await third.send(groupPage))[0].messages, []);
  });

  await t.test('Trả lời và cảm xúc đồng bộ đúng hội thoại, quyền xem và lịch sử', async () => {
    const [an, binh, lan] = await Promise.all(Array.from({ length: 3 }, () => connect(server.address().port, sockets)));
    const react = (id, emoji) => ({ type: 'REACTION', id, emoji, from: 'giả' });
    assert.equal((await lan.send(react(1, '❤️')))[0].code, 'NOT_LOGGED_IN');
    for (const [client, username] of [[an, 'AnR'], [binh, 'BinhR'], [lan, 'LanR']]) {
      await client.send({ ...register, username }, { ...login, username });
    }
    const direct = { type: 'MSG', to: 'BinhR', content: 'Hẹn lúc tám giờ' };
    const [base] = await an.send(direct);
    await binh.nextReply();
    for (const [client, request] of [[lan, react(base.id, '👍')], [lan, { ...direct, replyTo: base.id }],
      [an, { ...direct, to: 'LanR', replyTo: base.id }], [an, react(base.id, 'khác')]]) {
      assert.equal((await client.send(request))[0].code, 'INVALID_INPUT');
    }
    async function reaction(actor, other, emoji) {
      const [ack] = await actor.send(react(base.id, emoji));
      assert.deepEqual(await other.nextReply(), ack);
      return ack.reactions;
    }
    await reaction(binh, an, '❤️');
    assert.deepEqual(await reaction(binh, an, '❤️'), [{ emoji: '❤️', count: 1 }]);
    assert.deepEqual(await reaction(an, binh, '❤️'), [{ emoji: '❤️', count: 2 }]);
    assert.equal((await reaction(binh, an, '👍')).length, 2);
    const page = { type: 'HISTORY_REQ', peer: 'AnR' };
    assert.equal((await binh.send(page))[0].messages[0].myReaction, '👍');
    assert.deepEqual(await reaction(an, binh, null), [{ emoji: '👍', count: 1 }]);

    const [answer] = await binh.send({ type: 'MSG', to: 'AnR', content: 'Đồng ý', replyTo: base.id });
    assert.deepEqual(answer.reply, { id: base.id, from: 'AnR', text: direct.content });
    assert.deepEqual(await an.nextReply(), answer);
    await an.send({ type: 'MSG_UPDATE', action: 'edit', id: base.id, content: 'Hẹn lúc chín giờ' });
    await binh.nextReply();
    assert.equal((await binh.send(page))[0].messages.at(-1).reply.text, 'Hẹn lúc chín giờ');
    await binh.send({ type: 'MSG_UPDATE', action: 'hide', id: base.id });
    assert.deepEqual((await binh.send(page))[0].messages[0].reply, { id: base.id });
    assert.equal((await binh.send(react(base.id, '😂')))[0].code, 'INVALID_INPUT');
    await binh.send(logout);
    const [late] = await an.send({ ...direct, content: 'Hẹn gặp lại', replyTo: base.id });
    await binh.send({ ...login, username: 'BinhR' });
    const backlog = await binh.nextReply();
    assert.ok(backlog.backlog && backlog.id === late.id);
    assert.deepEqual(backlog.reply, { id: base.id });

    const [group] = await an.send({ type: 'GROUP_CREATE', name: 'Thảo luận', members: ['BinhR', 'LanR'] });
    const groupId = group.group.id;
    const sendGroup = { type: 'MSG', groupId, content: 'Tin trong nhóm' };
    assert.equal((await an.send({ ...sendGroup, replyTo: base.id }))[0].code, 'INVALID_INPUT');
    const [topic] = await an.send(sendGroup);
    await binh.nextReply();
    await lan.nextReply();
    await binh.send({ type: 'MSG_UPDATE', action: 'hide', id: topic.id });
    const [groupReply] = await lan.send({ ...sendGroup, replyTo: topic.id });
    assert.deepEqual((await an.nextReply()).reply, groupReply.reply);
    assert.deepEqual((await binh.nextReply()).reply, { id: topic.id });
    const [groupReaction] = await binh.send(react(groupReply.id, '🎉'));
    assert.deepEqual(await an.nextReply(), groupReaction);
    assert.deepEqual(await lan.nextReply(), groupReaction);
    await an.send({ type: 'MSG_UPDATE', action: 'recall', id: topic.id });
    await lan.nextReply();
    assert.equal((await lan.send({ ...sendGroup, replyTo: topic.id }))[0].code, 'INVALID_INPUT');
    const [restored] = await lan.send({ type: 'HISTORY_REQ', groupId });
    assert.deepEqual(restored.messages.at(-1).reply, { id: topic.id });
    assert.deepEqual(restored.messages.at(-1).reactions, [{ emoji: '🎉', count: 1 }]);
    await lan.send({ type: 'MSG_UPDATE', action: 'recall', id: groupReply.id });
    await an.nextReply();
    await binh.nextReply();
    assert.equal((await an.send(react(groupReply.id, '👍')))[0].code, 'INVALID_INPUT');
    assert.equal(db.prepare('SELECT COUNT(*) FROM message_reactions WHERE message_id=?').pluck().get(groupReply.id), 0);
  });
});
