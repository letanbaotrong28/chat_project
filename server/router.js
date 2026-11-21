const { TYPES } = require('../common/protocol');
const { ERROR_CODES } = require('../common/constants');
const sessions = require('./sessions');

const handlers = new Map([
  [TYPES.PING, ({ from, time }) => ({ type: TYPES.PING, from, time })]
]);

function route(socket, packet) {
  // Ghi đè danh tính và thời gian trước khi chuyển đến handler.
  const from = sessions.usernameOf(socket);
  const time = new Date().toISOString();
  const handle = handlers.get(packet.type);
  if (handle) return handle({ ...packet, from, time });
  return { type: TYPES.ERROR, code: ERROR_CODES.NOT_IMPLEMENTED, content: 'chưa cài đặt', from, time };
}
module.exports = { route };
