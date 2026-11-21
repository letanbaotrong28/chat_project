const net = require('node:net');
const { TYPES, encode, createDecoder } = require('../common/protocol');

function createNetwork(notify) {
  let active = null;

  function close() {
    const old = active;
    active = null;
    old?.destroy();
  }

  function ping() {
    if (!active || active.connecting || !active.writable) throw new Error('Chưa kết nối đến Server.');
    const packet = { type: TYPES.PING };
    active.write(encode(packet));
    notify({ kind: 'sent', packet });
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
  return { connect, ping, close };
}
module.exports = { createNetwork };
