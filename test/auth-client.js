const net = require('node:net');
const readline = require('node:readline');
const { DEFAULT_PORT } = require('../common/constants');
const { encode, createDecoder } = require('../common/protocol');

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const socket = net.createConnection({ host: '127.0.0.1', port });
const receive = createDecoder(packet => console.log(JSON.stringify(packet)));
let input;

socket.on('connect', () => {
  console.log('Đã kết nối cổng ' + port + '. Nhập một gói JSON mỗi dòng. Ctrl+C để thoát.');
  input = readline.createInterface({ input: process.stdin, output: process.stdout, historySize: 0 });
  input.on('line', line => {
    if (!line.trim()) return;
    try {
      socket.write(encode(JSON.parse(line)));
    } catch (error) {
      console.error('Kiểm tra lại cú pháp JSON và kích thước gói.');
    }
  });
  input.on('close', () => socket.end());
});
socket.on('data', chunk => {
  try {
    receive(chunk);
  } catch (error) {
    socket.destroy(error);
  }
});
socket.on('error', error => {
  console.error('Lỗi kết nối:', error.code || error.name);
  process.exitCode = 1;
});
socket.on('close', () => input?.close());
