const { TYPES } = require('../common/protocol');
const { ERROR_CODES } = require('../common/constants');
const sessions = require('./sessions');
const { authenticate, logout } = require('./handlers/auth');

const handlers = new Map([
  [TYPES.PING, () => ({ type: TYPES.PING })],
  [TYPES.REGISTER, authenticate],
  [TYPES.LOGIN, authenticate],
  [TYPES.LOGOUT, logout]
]);

async function route(socket, packet) {
  // Ghi đè danh tính và thời gian trước khi chuyển đến handler.
  const from = sessions.usernameOf(socket);
  const time = new Date().toISOString();
  const handle = handlers.get(packet.type);
  if (!handle) {
    return { type: TYPES.ERROR, code: ERROR_CODES.NOT_IMPLEMENTED, content: 'chưa cài đặt', from, time };
  }
  try {
    const reply = await handle(socket, { ...packet, from, time });
    return { ...reply, from: sessions.usernameOf(socket), time };
  } catch (error) {
    // Không ghi gói yêu cầu (có mật khẩu) hoặc trả lỗi nội bộ cho Client.
    console.error('Lỗi xử lý yêu cầu:', error.code || error.name);
    return { type: TYPES.ERROR, code: ERROR_CODES.INTERNAL_ERROR, content: 'Server không xử lý được yêu cầu.', from, time };
  }
}
module.exports = { route };
