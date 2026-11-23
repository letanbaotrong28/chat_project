const bcrypt = require('bcryptjs');
const db = require('../db');
const sessions = require('../sessions');
const { TYPES } = require('../../common/protocol');
const { ERROR_CODES } = require('../../common/constants');
const { publishPresence, endSession } = require('./state');

const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash) VALUES (?, ?)
  ON CONFLICT(username) DO NOTHING
`);
const findUser = db.prepare('SELECT password_hash FROM users WHERE username = ?');

function failure(code, content) {
  return { type: TYPES.ERROR, code, content };
}

async function register(username, password) {
  if ([...password].length < 8) {
    return failure(ERROR_CODES.INVALID_INPUT, 'Mật khẩu cần ít nhất 8 ký tự.');
  }
  const hash = await bcrypt.hash(password, 10);
  // Ràng buộc UNIQUE trong SQLite quyết định cả khi hai Client đăng ký đồng thời.
  if (insertUser.run(username, hash).changes === 0) {
    return failure(ERROR_CODES.USERNAME_TAKEN, 'Tên tài khoản đã tồn tại.');
  }
  publishPresence(username, 'offline');
  return { type: TYPES.REGISTER, username };
}

async function login(socket, username, password) {
  const user = findUser.get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return failure(ERROR_CODES.INVALID_CREDENTIALS, 'Sai tên tài khoản hoặc mật khẩu.');
  }
  // Sau khi chờ bcrypt, kiểm tra lại socket và phiên trước khi gắn tài khoản.
  const current = sessions.get(username);
  if (current && !current.destroyed) {
    return failure(ERROR_CODES.ACCOUNT_IN_USE, 'Tài khoản đang đăng nhập ở kết nối khác.');
  }
  if (!socket.destroyed) {
    sessions.add(username, socket);
    publishPresence(username, 'online');
  }
  return { type: TYPES.LOGIN, username };
}

function authenticate(socket, packet) {
  if (sessions.usernameOf(socket) !== null) {
    return failure(ERROR_CODES.ALREADY_LOGGED_IN, 'Hãy đăng xuất tài khoản hiện tại trước.');
  }
  const username = typeof packet.username === 'string' ? packet.username.trim().normalize('NFC') : '';
  if (!/^[\p{L}\p{M}\p{N}_.-]{1,32}$/u.test(username)) {
    return failure(ERROR_CODES.INVALID_INPUT, 'Tên tài khoản dài 1–32 ký tự, gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  }
  const { password } = packet;
  // bcrypt chỉ dùng 72 byte đầu. Từ chối chuỗi dài hơn thay vì âm thầm cắt mật khẩu.
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return failure(ERROR_CODES.INVALID_INPUT, 'Cần nhập mật khẩu, tối đa 72 byte UTF-8.');
  }
  if (packet.type === TYPES.REGISTER) return register(username, password);
  return login(socket, username, password);
}

function logout(socket) {
  if (sessions.usernameOf(socket) === null) {
    return failure(ERROR_CODES.NOT_LOGGED_IN, 'Kết nối này chưa đăng nhập.');
  }
  endSession(socket);
  return { type: TYPES.LOGOUT };
}

module.exports = { authenticate, logout };
