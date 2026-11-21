const assert = require('node:assert/strict');
const { encode, decode, createDecoder, TYPES } = require('../common/protocol');
const { MAX_PACKET_BYTES, ERROR_CODES } = require('../common/constants');

const first = { type: TYPES.PING };
const second = { type: TYPES.MSG, content: 'Chào bạn 👋' };
const a = encode(first);
const b = encode(second);
assert.equal(b.readUInt32BE(), Buffer.byteLength(JSON.stringify(second)));
assert.deepEqual(decode(b), second);

function collect(chunks) {
  const packets = [];
  const receive = createDecoder(packet => packets.push(packet));
  for (const chunk of chunks) receive(chunk);
  return packets;
}

assert.deepEqual(collect([Buffer.concat([a, b])]), [first, second]);
console.log('Đạt: hai gói dính liền.');

const cut = Math.floor(b.length / 2);
assert.deepEqual(collect([b.subarray(0, cut)]), []);
assert.deepEqual(collect([b.subarray(0, cut), b.subarray(cut)]), [second]);
assert.deepEqual(collect([...b].map(byte => Buffer.from([byte]))), [second]);
console.log('Đạt: cắt đôi hoặc nhận từng byte, giữ nguyên tiếng Việt và emoji.');

const prefix = Buffer.alloc(4);
prefix.writeUInt32BE(MAX_PACKET_BYTES + 1);
const tooLarge = { code: ERROR_CODES.TOO_LARGE };
assert.throws(() => collect([prefix]), tooLarge);
assert.throws(() => encode({ content: 'x'.repeat(MAX_PACKET_BYTES) }), tooLarge);
console.log('Đạt: từ chối gói vượt giới hạn ngay khi nhận tiền tố.');
