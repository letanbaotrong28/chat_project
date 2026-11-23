const { encode } = require('../common/protocol');
const sockets = new Map();
const names = new WeakMap();

function remove(socket) {
  const name = names.get(socket);
  if (name !== undefined) {
    sockets.delete(name);
    names.delete(socket);
  }
}

function add(username, socket) {
  remove(socket);
  const previous = sockets.get(username);
  if (previous) names.delete(previous); // Socket cũ đóng muộn cũng không xoá phiên mới.
  sockets.set(username, socket);
  names.set(socket, username);
}

function broadcast(packet, exceptSocket) {
  const frame = encode(packet);
  for (const socket of sockets.values()) {
    if (socket !== exceptSocket && socket.writable && !socket.destroyed) socket.write(frame);
  }
}

module.exports = {
  add, remove, broadcast,
  get: username => sockets.get(username),
  usernameOf: socket => names.get(socket) ?? null
};
