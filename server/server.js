const net = require('node:net');
const os = require('node:os');
const { HOST, PORT } = require('./config');
const db = require('./db');
const { contactPages, endSession } = require('./handlers/state');
const { openInbox, closeInbox } = require('./handlers/message');
const { route } = require('./router');
const { TYPES, encode, createPacketReader } = require('../common/protocol');

function sendPacket(socket, packet) {
  return new Promise((resolve, reject) => {
    socket.write(encode(packet), error => error ? reject(error) : resolve());
  });
}

async function serve(socket) {
  const peer = socket.remoteAddress + ':' + socket.remotePort;
  console.log('Kết nối:', peer);
  socket.on('error', error => console.warn(peer, error.code || error.name));
  socket.on('close', () => {
    closeInbox(socket);
    endSession(socket);
    console.log('Ngắt kết nối:', peer);
  });
  const read = createPacketReader();
  try {
    // Chờ từng lệnh trên cùng socket: PING sau LOGIN phải thấy phiên mới.
    // Các socket khác vẫn có thể gửi và nhận trong khi bcrypt đang chạy.
    for await (const chunk of socket.iterator({ destroyOnReturn: false })) {
      for (const packet of read(chunk)) {
        if (socket.destroyed) return;
        const reply = await route(socket, packet);
        if (socket.destroyed) return;
        if (reply.type === TYPES.LOGOUT) closeInbox(socket);
        await sendPacket(socket, reply);
        if (reply.type === TYPES.LOGIN) {
          for (const page of contactPages(reply.from)) {
            if (socket.destroyed) return;
            await sendPacket(socket, page);
          }
          openInbox(socket, reply.from);
        }
      }
    }
    socket.end();
  } catch (error) {
    socket.destroy(error);
  }
}

function createChatServer() {
  return net.createServer({ allowHalfOpen: true }, serve);
}

if (require.main === module) {
  const server = createChatServer();
  server.on('error', error => {
    console.error('Lỗi Server:', error.message);
    process.exitCode = 1;
  });
  server.on('close', () => db.close());
  server.listen(PORT, HOST, () => {
    console.log('listening on ' + HOST + ':' + PORT);
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal) {
          console.log('IP LAN (' + name + '): ' + address.address + ':' + PORT);
        }
      }
    }
  });
}

module.exports = { createChatServer };
