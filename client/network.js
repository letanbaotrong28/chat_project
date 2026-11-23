const net = require('node:net');
const { TYPES, encode, createDecoder } = require('../common/protocol');

function createNetwork(notify) {
  let active = null;

  function close() {
    const old = active;
    active = null;
    old?.destroy();
  }

  function send(packet) {
    if (!active || active.connecting || !active.writable) throw new Error('Chưa kết nối đến Server.');
    active.write(encode(packet));
    // Nhật ký chỉ cần biết loại lệnh, không gửi lại mật khẩu qua IPC.
    notify({ kind: 'sent', packet: { type: packet.type } });
  }

  function authenticate(type, username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') throw new Error('Dữ liệu tài khoản không hợp lệ.');
    send({ type, username, password });
  }

  function ping() {
    send({ type: TYPES.PING });
  }

  function connect(host, port) {
    if (!net.isIP(host)) throw new Error('Địa chỉ IP không hợp lệ.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Cổng không hợp lệ.');
    close();
    const socket = net.createConnection({ host, port });
    active = socket;
    const receive = createDecoder(packet => notify({ kind: 'received', packet }));
    notify({ kind: 'state', state: 'connecting', host, port });
    socket.setTimeout(8000, () => socket.destroy(new Error('Hết thời gian chờ kết nối.')));
    socket.on('connect', () => {
      if (socket !== active) return;
      socket.setTimeout(0);
      notify({ kind: 'state', state: 'connected', host, port });
      ping();
    });
    socket.on('data', chunk => {
      if (socket !== active) return;
      try {
        receive(chunk);
      } catch (error) {
        socket.destroy(error);
      }
    });
    socket.on('error', error => {
      if (socket === active) notify({ kind: 'error', message: error.message });
    });
    socket.on('close', () => {
      if (socket !== active) return;
      active = null;
      notify({ kind: 'state', state: 'disconnected', host, port });
    });
  }
  return {
    connect, ping, close,
    register: (name, password) => authenticate(TYPES.REGISTER, name, password),
    login: (name, password) => authenticate(TYPES.LOGIN, name, password),
    logout: () => send({ type: TYPES.LOGOUT }),
    message: (to, content) => send({ type: TYPES.MSG, to, content }),
    acknowledge: (id, status) => send({ type: TYPES.ACK, id, status }),
    history: (peer, beforeId, requestId) => send({ type: TYPES.HISTORY_REQ, peer, beforeId, requestId })
  };
}
module.exports = { createNetwork };
