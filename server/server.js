const net = require('node:net');
const os = require('node:os');
const { HOST, PORT } = require('./config');
const db = require('./db');
const sessions = require('./sessions');
const { route } = require('./router');
const { encode, createDecoder } = require('../common/protocol');

const server = net.createServer(socket => {
  const peer = socket.remoteAddress + ':' + socket.remotePort;
  console.log('Kết nối:', peer);
  const receive = createDecoder(packet => socket.write(encode(route(socket, packet))));
  socket.on('data', chunk => {
    try {
      receive(chunk);
    } catch (error) {
      socket.destroy(error); // Lỗi giao thức chỉ đóng kết nối đang đọc.
    }
  });
  socket.on('error', error => console.warn(peer, error.message));
  socket.on('close', () => {
    sessions.remove(socket);
    console.log('Ngắt kết nối:', peer);
  });
});

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
