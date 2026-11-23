const { MAX_PACKET_BYTES, ERROR_CODES } = require('./constants');

const names = [
  'REGISTER', 'LOGIN', 'LOGOUT', 'MSG', 'GROUP_CREATE', 'GROUP_ADD', 'FILE',
  'IMAGE', 'VIDEO', 'SOUND', 'STATE', 'ACK', 'HISTORY_REQ', 'HISTORY', 'PEER_REQ',
  'PEER_INFO', 'ERROR', 'PING'
];
const TYPES = Object.freeze(Object.fromEntries(names.map(name => [name, name])));
const utf8 = new TextDecoder('utf-8', { fatal: true });

function checkSize(size) {
  if (size === 0) throw new RangeError('Gói JSON rỗng.');
  if (size > MAX_PACKET_BYTES) {
    const error = new RangeError('Gói JSON vượt giới hạn 1 MiB.');
    error.code = ERROR_CODES.TOO_LARGE;
    throw error;
  }
}

function checkObject(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError('Gói tin phải là một đối tượng JSON.');
  }
  return obj;
}

function encode(obj) {
  const json = JSON.stringify(checkObject(obj));
  const size = Buffer.byteLength(json, 'utf8'); // Đếm byte, kể cả khi có dấu hoặc emoji.
  checkSize(size);
  const frame = Buffer.allocUnsafe(4 + size);
  frame.writeUInt32BE(size);
  frame.write(json, 4, 'utf8');
  return frame;
}

function readBody(bytes) {
  return checkObject(JSON.parse(utf8.decode(bytes)));
}

function decode(frame) {
  if (frame.length < 4) throw new RangeError('Thiếu tiền tố độ dài.');
  const size = frame.readUInt32BE();
  checkSize(size);
  if (frame.length !== 4 + size) throw new RangeError('Sai độ dài gói tin.');
  return readBody(frame.subarray(4));
}

function createPacketReader() {
  const header = Buffer.alloc(4);
  let target = header;
  let filled = 0;
  return function* read(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      // Mỗi lần chỉ lấy đủ cho phần đang đọc. Giữ phần dở sang lần nhận tiếp.
      const count = Math.min(target.length - filled, chunk.length - offset);
      chunk.copy(target, filled, offset, offset + count);
      offset += count;
      filled += count;
      if (filled < target.length) return;
      filled = 0;
      if (target === header) {
        const size = header.readUInt32BE();
        checkSize(size); // Kiểm tra trước khi cấp bộ nhớ cho thân gói.
        target = Buffer.allocUnsafe(size);
      } else {
        const body = target;
        target = header; // Các byte còn lại trong chunk có thể thuộc gói kế tiếp.
        yield readBody(body);
      }
    }
  };
}

function createDecoder(onMessage) {
  const read = createPacketReader();
  return chunk => {
    for (const packet of read(chunk)) onMessage(packet);
  };
}

module.exports = { TYPES, encode, decode, createDecoder, createPacketReader };
