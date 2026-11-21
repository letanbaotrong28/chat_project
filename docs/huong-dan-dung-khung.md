# Dựng khung chat TCP từ đầu

Các đường dẫn tính từ chat_project. Đây là bản chép đầy đủ các tệp ở mốc PING. Nếu đã có mã nguồn, dùng README để chạy ngay.

## A. Kiểm tra môi trường

Trong PowerShell bất kỳ trên máy có NVM for Windows, chạy các lệnh sau nếu cần cài Node. Hướng dẫn cho máy đang có cả Node 22 và 24 cùng cách cài Git nằm trong README ở bước E.

~~~~powershell
nvm install 22.23.5
nvm use 22.23.5
node -v
npm.cmd -v
git --version
~~~~

## B. Tạo cây thư mục

Ở thư mục cha của dự án mới, chạy các lệnh sau. Các tệp .gitkeep dài 0 byte.

~~~~powershell
New-Item -ItemType Directory -Force chat_project
Set-Location chat_project
New-Item -ItemType Directory -Force server/handlers
New-Item -ItemType Directory -Force server/utils
New-Item -ItemType Directory -Force server/data
New-Item -ItemType Directory -Force server/uploads/files
New-Item -ItemType Directory -Force server/uploads/images
New-Item -ItemType Directory -Force server/uploads/videos
New-Item -ItemType Directory -Force server/uploads/sounds
New-Item -ItemType Directory -Force client/downloads
New-Item -ItemType Directory -Force client/renderer/js
New-Item -ItemType Directory -Force client/renderer/assets/icons
New-Item -ItemType Directory -Force client/renderer/assets/sounds
New-Item -ItemType Directory -Force common
New-Item -ItemType Directory -Force test
New-Item -ItemType Directory -Force docs
New-Item -ItemType File server/data/.gitkeep
New-Item -ItemType File server/uploads/files/.gitkeep
New-Item -ItemType File server/uploads/images/.gitkeep
New-Item -ItemType File server/uploads/videos/.gitkeep
New-Item -ItemType File server/uploads/sounds/.gitkeep
New-Item -ItemType File client/downloads/.gitkeep
New-Item -ItemType File client/renderer/assets/icons/.gitkeep
New-Item -ItemType File client/renderer/assets/sounds/.gitkeep
~~~~

### server/data/.gitkeep

Tệp rỗng (0 byte).

### server/uploads/files/.gitkeep

Tệp rỗng (0 byte).

### server/uploads/images/.gitkeep

Tệp rỗng (0 byte).

### server/uploads/videos/.gitkeep

Tệp rỗng (0 byte).

### server/uploads/sounds/.gitkeep

Tệp rỗng (0 byte).

### client/downloads/.gitkeep

Tệp rỗng (0 byte).

### client/renderer/assets/icons/.gitkeep

Tệp rỗng (0 byte).

### client/renderer/assets/sounds/.gitkeep

Tệp rỗng (0 byte).

## C. Tạo hai gói npm

Từ chat_project mới, chạy các lệnh sau. Khi tạo lại, dùng nội dung package.json bên dưới để có đúng entry point và lệnh start. Khi đã có hai lockfile, dùng npm ci như README.

~~~~powershell
Set-Location server
npm.cmd init -y
npm.cmd install --save-exact better-sqlite3@13.2.0 bcryptjs@3.0.3
Set-Location ../client
npm.cmd init -y
npm.cmd install --save-dev --save-exact electron@45.4.1
Set-Location ..
~~~~

### server/package.json

~~~~json
{
  "name": "chat-project-server",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "main": "server.js",
  "engines": {
    "node": "22.x"
  },
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "bcryptjs": "3.0.3",
    "better-sqlite3": "13.2.0"
  }
}
~~~~

### client/package.json

~~~~json
{
  "name": "chat-project-client",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "main": "main.js",
  "engines": {
    "node": "22.x"
  },
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "45.4.1"
  }
}
~~~~

### server/package-lock.json

~~~~json
{
  "name": "chat-project-server",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "chat-project-server",
      "version": "1.0.0",
      "dependencies": {
        "bcryptjs": "3.0.3",
        "better-sqlite3": "13.2.0"
      },
      "engines": {
        "node": "22.x"
      }
    },
    "node_modules/bcryptjs": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/bcryptjs/-/bcryptjs-3.0.3.tgz",
      "integrity": "sha512-GlF5wPWnSa/X5LKM1o0wz0suXIINz1iHRLvTS+sLyi7XPbe5ycmYI3DlZqVGZZtDgl4DmasFg7gOB3JYbphV5g==",
      "license": "BSD-3-Clause",
      "bin": {
        "bcrypt": "bin/bcrypt"
      }
    },
    "node_modules/better-sqlite3": {
      "version": "13.2.0",
      "resolved": "https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-13.2.0.tgz",
      "integrity": "sha512-Z8Q/9x/uNyKxA1v4FNodyItRVRw1TeKBrmj32JhxhR0ceNcBY+wMobt/Bv7M7TzwPAXjnZRtNaEsATnUZSKWZQ==",
      "license": "MIT",
      "dependencies": {
        "node-addon-api": "^8.0.0"
      },
      "engines": {
        "node": ">=22"
      }
    },
    "node_modules/node-addon-api": {
      "version": "8.9.2",
      "resolved": "https://registry.npmjs.org/node-addon-api/-/node-addon-api-8.9.2.tgz",
      "integrity": "sha512-VijLXbi3UACN69I0JVXJsX4tjACjNoQDgv2gTF6sx2wWEi8tkSg2eX8p5gSIFi8z2+DL3oHmY6OyKce38SDolg==",
      "license": "MIT",
      "engines": {
        "node": "^18 || ^20 || >= 21"
      }
    }
  }
}
~~~~

### client/package-lock.json

~~~~json
{
  "name": "chat-project-client",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "chat-project-client",
      "version": "1.0.0",
      "devDependencies": {
        "electron": "45.4.1"
      },
      "engines": {
        "node": "22.x"
      }
    },
    "node_modules/@electron-internal/extract-zip": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/@electron-internal/extract-zip/-/extract-zip-1.0.8.tgz",
      "integrity": "sha512-8iajeLFbzNwM0m3AsQZSZgYREWglAImyGvvFSWU34FgMW8sHlzdwj9QKvv9dgN7jMP591EFUF/sLOC3Jl9YIjQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=22.12.0"
      }
    },
    "node_modules/@electron/get": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/@electron/get/-/get-5.1.0.tgz",
      "integrity": "sha512-3kSBtG8ObcTVfXanm5vVJ6UnBLEVmVsRk1M+vGqCuMBV+XLCbJYuWQful+yIy0GQDsSlK0kHEriEHn7SPk4EnA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "debug": "^4.1.1",
        "env-paths": "^3.0.0",
        "graceful-fs": "^4.2.11",
        "progress": "^2.0.3",
        "semver": "^7.6.3",
        "sumchecker": "^3.0.1"
      },
      "engines": {
        "node": ">=22.12.0"
      },
      "optionalDependencies": {
        "undici": "^7.24.4"
      }
    },
    "node_modules/@types/node": {
      "version": "24.19.2",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-24.19.2.tgz",
      "integrity": "sha512-93d49wCWJkCyN87MxLpNN6KXPCwFw7bVUg79mGUV1OS40JGWwVCr8n61DXCSqz7CV6/VfPkb7xec7uP2M+QHWQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "undici-types": ">=7.24.0 <7.24.7"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/electron": {
      "version": "45.4.1",
      "resolved": "https://registry.npmjs.org/electron/-/electron-45.4.1.tgz",
      "integrity": "sha512-DjsJ/eQhovkjf1vYFFyh5GB8NMx+L5bdYaonvGOlWselg3DQ0fwIF0N/+2hrPsoS4whmmNswh21ym/8dgt1y5Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@electron-internal/extract-zip": "^1.0.1",
        "@electron/get": "^5.0.0",
        "@types/node": "^24.9.0"
      },
      "bin": {
        "electron": "cli.js",
        "install-electron": "install.js"
      },
      "engines": {
        "node": ">= 22.12.0"
      }
    },
    "node_modules/env-paths": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/env-paths/-/env-paths-3.0.0.tgz",
      "integrity": "sha512-dtJUTepzMW3Lm/NPxRf3wP4642UWhjL2sQxc+ym2YMj1m/H2zDNQOlezafzkHwn6sMstjHTwG6iQQsctDW/b1A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^12.20.0 || ^14.13.1 || >=16.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/graceful-fs": {
      "version": "4.2.12",
      "resolved": "https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.12.tgz",
      "integrity": "sha512-iuyGF2E4oafQfPsRrG2wtY2ILupMhvtdrhzrxB+0VcjsPpSPttpfYdjnGFGsTi5MaJFjI1jOKHPQ6UTbTj9TAw==",
      "dev": true,
      "license": "BlueOak-1.0.0"
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/progress": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/progress/-/progress-2.0.3.tgz",
      "integrity": "sha512-7PiHtLll5LdnKIMw100I+8xJXR5gW2QwWYkT6iJva0bXitZKa/XMrSbdmg3r2Xnaidz9Qumd0VPaMrZlF9V9sA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/semver": {
      "version": "7.8.6",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.6.tgz",
      "integrity": "sha512-9lpSSU4Mly3mrtruwLs1eLK6+gzbzqeBFwRNjIjE+9LuDpWdYctrQlQ3ej1Ilgi7gknpsTRnPoLP8DpCHqHIJw==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/sumchecker": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/sumchecker/-/sumchecker-3.0.1.tgz",
      "integrity": "sha512-MvjXzkz/BOfyVDkG0oFOtBxHX2u3gKbMHIF/dXblZsgD3BWOFLmHovIpZY7BykJdAjcqRCBi1WYBNdEC9yI7vg==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "debug": "^4.1.0"
      },
      "engines": {
        "node": ">= 8.0"
      }
    },
    "node_modules/undici": {
      "version": "7.30.2",
      "resolved": "https://registry.npmjs.org/undici/-/undici-7.30.2.tgz",
      "integrity": "sha512-mLyPQnHwUxaM/rideoK/+KL8DaAJLRl4aBCfmX444aCSLnIaomqPLtNRe2jdCYcsk5wZzXrDIQC8ZeYNRAYyIA==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=20.18.1"
      }
    },
    "node_modules/undici-types": {
      "version": "7.24.6",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-7.24.6.tgz",
      "integrity": "sha512-WRNW+sJgj5OBN4/0JpHFqtqzhpbnV0GuB+OozA9gCL7a993SmU+1JBZCzLNxYsbMfIeDL+lTsphD5jN5N+n0zg==",
      "dev": true,
      "license": "MIT"
    }
  }
}
~~~~

## D. Viết mã nguồn

Mở thư mục gốc trong VS Code và lưu từng tệp theo đường dẫn ghi trên tiêu đề.

~~~~powershell
code .
~~~~

### common/constants.js

~~~~javascript
module.exports = Object.freeze({
  DEFAULT_PORT: 5000,
  MAX_PACKET_BYTES: 1024 * 1024,
  FILE_CHUNK_BYTES: 64 * 1024,
  ERROR_CODES: Object.freeze({ NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', TOO_LARGE: 'PACKET_TOO_LARGE' })
});
~~~~

### common/protocol.js

~~~~javascript
const { MAX_PACKET_BYTES, ERROR_CODES } = require('./constants');

const names = [
  'REGISTER', 'LOGIN', 'LOGOUT', 'MSG', 'GROUP_CREATE', 'GROUP_ADD', 'FILE',
  'IMAGE', 'VIDEO', 'SOUND', 'STATE', 'ACK', 'HISTORY_REQ', 'PEER_REQ',
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

function createDecoder(onMessage) {
  const header = Buffer.alloc(4);
  let target = header;
  let filled = 0;
  return function push(chunk) {
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
        onMessage(readBody(body));
      }
    }
  };
}

module.exports = { TYPES, encode, decode, createDecoder };
~~~~

### server/config.js

~~~~javascript
const path = require('node:path');
const { DEFAULT_PORT, MAX_PACKET_BYTES, FILE_CHUNK_BYTES } = require('../common/constants');

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new RangeError('PORT phải là số nguyên từ 1 đến 65535.');
}
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const UPLOAD_DIRS = Object.fromEntries(
  ['files', 'images', 'videos', 'sounds'].map(name => [name, path.join(UPLOAD_DIR, name)])
);
module.exports = { HOST: '0.0.0.0', PORT, DATA_DIR, UPLOAD_DIRS, MAX_PACKET_BYTES, FILE_CHUNK_BYTES };
~~~~

### server/db.js

~~~~javascript
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'chat.db'));
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),
    group_id INTEGER REFERENCES groups(id),
    type TEXT NOT NULL,
    content TEXT,
    file_path TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    time TEXT NOT NULL
  );
`);
module.exports = db;
~~~~

### server/router.js

~~~~javascript
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
~~~~

### server/server.js

~~~~javascript
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
~~~~

### server/sessions.js

~~~~javascript
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

function broadcast(packet) {
  const frame = encode(packet);
  for (const socket of sockets.values()) {
    if (socket.writable && !socket.destroyed) socket.write(frame);
  }
}

module.exports = {
  add, remove, broadcast,
  get: username => sockets.get(username),
  usernameOf: socket => names.get(socket) ?? null
};
~~~~

### server/handlers/auth.js

~~~~javascript
// TODO: Đăng ký, băm mật khẩu bằng bcryptjs, đăng nhập và đăng xuất.
~~~~

### server/handlers/file.js

~~~~javascript
// TODO: Nhận từng khối FILE, IMAGE, VIDEO và SOUND, ghép tệp vào uploads.
~~~~

### server/handlers/group.js

~~~~javascript
// TODO: Xử lý GROUP_CREATE, GROUP_ADD và chuyển tin đến thành viên.
~~~~

### server/handlers/history.js

~~~~javascript
// TODO: Trả lịch sử hội thoại có phân trang cho HISTORY_REQ.
~~~~

### server/handlers/message.js

~~~~javascript
// TODO: Lưu và chuyển tiếp MSG giữa hai tài khoản.
~~~~

### server/handlers/p2p.js

~~~~javascript
// TODO: Trao đổi IP và cổng qua PEER_REQ và PEER_INFO.
~~~~

### server/handlers/state.js

~~~~javascript
// TODO: Phát STATE online/offline và xử lý ACK đã nhận hoặc đã xem.
~~~~

### server/utils/checksum.js

~~~~javascript
// TODO: Tính MD5 hoặc SHA-256 theo luồng bằng node:crypto.
~~~~

### server/utils/logger.js

~~~~javascript
// TODO: Chuẩn hóa nhật ký sự kiện và lỗi của Server.
~~~~

### client/fileTransfer.js

~~~~javascript
// TODO: Chia, ghép khối tệp, kiểm tra checksum và báo tiến trình.
~~~~

### client/main.js

~~~~javascript
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { createNetwork } = require('./network');

let window;
const network = createNetwork(data => {
  if (window && !window.webContents.isDestroyed()) window.webContents.send('tcp:event', data);
});

function checkSender(event) {
  if (!window || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('Cửa sổ gửi yêu cầu không hợp lệ.');
  }
}
ipcMain.handle('tcp:connect', (event, host, port) => {
  checkSender(event);
  network.connect(host, port);
});
ipcMain.handle('tcp:ping', event => {
  checkSender(event);
  network.ping();
});

function openWindow() {
  window = new BrowserWindow({
    title: 'Kiểm tra kết nối TCP', width: 820, height: 620, minWidth: 420, minHeight: 440,
    backgroundColor: '#f4f7f6', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('did-start-loading', network.close);
  window.on('closed', () => {
    window = null;
    network.close();
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(openWindow);
app.on('activate', () => { if (!window) openWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
~~~~

### client/network.js

~~~~javascript
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
~~~~

### client/p2p.js

~~~~javascript
// TODO: Mở cổng lắng nghe và kết nối TCP trực tiếp tới Client khác.
~~~~

### client/preload.js

~~~~javascript
const { contextBridge, ipcRenderer } = require('electron');

// Giao diện chỉ được gọi các thao tác TCP cụ thể.
contextBridge.exposeInMainWorld('tcp', {
  connect: (host, port) => ipcRenderer.invoke('tcp:connect', host, port),
  ping: () => ipcRenderer.invoke('tcp:ping'),
  onEvent(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('tcp:event', listener);
    return () => ipcRenderer.removeListener('tcp:event', listener);
  }
});
~~~~

### client/renderer/app.js

~~~~javascript
const form = document.querySelector('#connection');
const statusLabel = document.querySelector('#status');
const log = document.querySelector('#log');
const pingButton = document.querySelector('#ping');
const connectButton = document.querySelector('#connect');
const labels = { connecting: 'Đang kết nối', connected: 'Đã kết nối', disconnected: 'Đã ngắt kết nối' };

function logLine(label, message, kind) {
  document.querySelector('#empty')?.remove();
  const line = document.createElement('p');
  const prefix = document.createElement('strong');
  prefix.textContent = new Date().toLocaleTimeString('vi-VN') + '  ' + label + '  ';
  line.dataset.kind = kind;
  line.append(prefix, document.createTextNode(message));
  log.append(line);
  if (log.childElementCount > 200) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}

window.tcp.onEvent(event => {
  if (event.kind === 'state') {
    statusLabel.textContent = labels[event.state];
    statusLabel.dataset.state = event.state;
    connectButton.disabled = event.state === 'connecting';
    pingButton.disabled = event.state !== 'connected';
    logLine('TCP', labels[event.state] + ' · ' + event.host + ':' + event.port, event.kind);
  } else if (event.kind === 'error') {
    logLine('LỖI', event.message, event.kind);
  } else {
    logLine(event.kind === 'sent' ? 'GỬI' : 'NHẬN', JSON.stringify(event.packet), event.kind);
  }
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const host = document.querySelector('#host').value.trim();
  const port = document.querySelector('#port').valueAsNumber;
  window.tcp.connect(host, port).catch(error => logLine('LỖI', error.message, 'error'));
});
pingButton.addEventListener('click', () => {
  window.tcp.ping().catch(error => logLine('LỖI', error.message, 'error'));
});
~~~~

### client/renderer/index.html

~~~~html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; form-action 'none'; base-uri 'none'">
  <title>Kiểm tra kết nối TCP</title>
  <link rel="stylesheet" href="style.css">
  <script defer src="js/auth.js"></script>
  <script defer src="js/contacts.js"></script>
  <script defer src="js/chat.js"></script>
  <script defer src="js/group.js"></script>
  <script defer src="js/media.js"></script>
  <script defer src="js/recorder.js"></script>
  <script defer src="js/emoji.js"></script>
  <script defer src="js/history.js"></script>
  <script defer src="js/state.js"></script>
  <script defer src="app.js"></script>
</head>
<body>
  <main>
    <header><h1>Kết nối TCP</h1><span id="status" role="status">Chưa kết nối</span></header>
    <form id="connection">
      <label>Địa chỉ IP của Server<input id="host" value="127.0.0.1" required spellcheck="false"></label>
      <label>Cổng<input id="port" type="number" min="1" max="65535" value="5000" required></label>
      <button id="connect">Kết nối</button>
    </form>
    <section aria-labelledby="log-title">
      <div class="toolbar"><h2 id="log-title">Nhật ký kết nối</h2><button id="ping" disabled>Gửi PING</button></div>
      <div id="log" role="log" aria-live="polite" tabindex="0">
        <p id="empty">Gói PING đầu tiên sẽ được gửi khi kết nối thành công.</p>
      </div>
    </section>
  </main>
</body>
</html>
~~~~

### client/renderer/style.css

~~~~css
:root {
  font: 16px "Inter", "Segoe UI", sans-serif;
  color: #183532;
  background: #f4f7f6;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; }
main { max-width: 880px; margin: auto; padding: clamp(20px, 5vw, 44px); }
header, .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h1 { margin: 0; font-size: clamp(26px, 4vw, 36px); letter-spacing: -0.04em; }
h2 { margin: 0; font-size: 19px; }
#status { font-size: 14px; color: #54645f; }
#status::before {
  content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 7px;
  border-radius: 50%; background: #84938d;
}
#status[data-state="connected"]::before { background: #00836c; }
#status[data-state="connecting"]::before { background: #c77911; }
form {
  display: grid; grid-template-columns: minmax(0, 1fr) 100px auto; align-items: end;
  gap: 16px; padding: 22px; margin: 24px 0 30px;
  background: white; border: 1px solid #d3dfda; border-radius: 12px;
}
label { display: grid; gap: 7px; font-size: 14px; font-weight: 600; }
input, button { font: inherit; border-radius: 7px; min-height: 40px; }
input { width: 100%; padding: 8px 12px; border: 1px solid #a4b5ad; }
button { cursor: pointer; padding: 8px 18px; border: 1px solid #126451; background: #146853; color: white; font-weight: 600; }
button:hover:enabled { background: #0d5442; }
button:disabled { opacity: .5; cursor: default; }
:focus-visible { outline: 3px solid #299a89; outline-offset: 2px; }
#ping { min-height: 34px; padding: 5px 12px; font-size: 14px; }
#log {
  height: clamp(180px, 40vh, 380px); overflow: auto; padding: 15px 18px; margin-top: 12px;
  background: #152a29; border-radius: 10px; color: #e2eeea;
  font: 14px/1.65 "IBM Plex Mono", Consolas, monospace;
}
#log p { margin: 0 0 6px; overflow-wrap: anywhere; }
#empty { color: #a7beb9; }
#log strong { color: #8fddc8; }
#log [data-kind="error"] strong { color: #ffb6a6; }
@media (max-width: 560px) {
  form { grid-template-columns: minmax(0, 1fr) 85px; }
  #connect { grid-column: 1 / -1; }
}
~~~~

### client/renderer/js/auth.js

~~~~javascript
// TODO: Hiển thị màn hình đăng ký và đăng nhập.
~~~~

### client/renderer/js/chat.js

~~~~javascript
// TODO: Hiển thị bong bóng tin nhắn, người gửi và giờ gửi.
~~~~

### client/renderer/js/contacts.js

~~~~javascript
// TODO: Liệt kê người dùng và nhóm, hiển thị chấm online/offline.
~~~~

### client/renderer/js/emoji.js

~~~~javascript
// TODO: Tạo bảng chọn emoji bằng JavaScript thuần.
~~~~

### client/renderer/js/group.js

~~~~javascript
// TODO: Tạo nhóm và thêm thành viên từ giao diện.
~~~~

### client/renderer/js/history.js

~~~~javascript
// TODO: Tải trang lịch sử trước đó khi cuộn lên.
~~~~

### client/renderer/js/media.js

~~~~javascript
// TODO: Hiển thị ảnh, phát video và âm thanh, cung cấp nút tải tệp.
~~~~

### client/renderer/js/recorder.js

~~~~javascript
// TODO: Ghi âm tin nhắn thoại bằng MediaRecorder.
~~~~

### client/renderer/js/state.js

~~~~javascript
// TODO: Hiển thị trạng thái đã gửi, đã nhận và đã xem.
~~~~

## E. Cấu hình và hướng dẫn chạy

Từ chat_project, mở hai tệp sau để điền nội dung.

~~~~powershell
code .gitignore README.md
~~~~

### .gitignore

~~~~text
node_modules/
server/data/*.db
server/data/*.db-*
server/uploads/**
!server/uploads/*/
!server/uploads/*/.gitkeep
client/downloads/*
!client/downloads/.gitkeep
.DS_Store
*.log
~~~~

### README.md

~~~~markdown
# Khung ứng dụng chat TCP

Client Electron gửi PING qua socket TCP đến Server Node.js. Nhật ký hiển thị cả gói gửi lẫn phản hồi, nên có thể kiểm tra một vòng truyền trước khi viết chức năng chat. Các bước dưới dùng PowerShell. [Hướng dẫn dựng lại và toàn văn từng tệp](docs/huong-dan-dung-khung.md)

## A. Chuẩn bị môi trường

Dự án dùng Node.js **22.23.5**, npm đi kèm và Git. Trên Windows x64 mới, cài bản `.msi` của Node.js 22, mở PowerShell mới và kiểm tra phiên bản. Nếu dùng NVM for Windows, có thể chạy `nvm install 22.23.5` và `nvm use 22.23.5`. [Bản cài Node.js 22](https://nodejs.org/download/release/latest-v22.x/)

Trên **máy đã dựng đồ án này**, Node 22 và 24 cùng tồn tại. Để chọn đúng Node cho riêng cửa sổ PowerShell hiện tại, chạy ở thư mục bất kỳ. Lặp lại trong cửa sổ thứ hai khi mở Client.

```powershell
$env:Path = "$env:LOCALAPPDATA\Author Software\nvm\installs\v22.23.5;$env:Path"
node -v
npm.cmd -v
git --version
```

Nếu máy chưa có Git, chạy `winget install --id Git.Git -e --source winget`, rồi mở lại PowerShell. Khi muốn bắt đầu quản lý phiên bản, chạy các lệnh sau tại `chat_project`. Thay tên và email ví dụ bằng danh tính dùng để commit. [Git cho Windows](https://git-scm.com/install/windows) · [Cấu hình danh tính Git](https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup)

```powershell
git init
git config user.name "Tên của bạn"
git config user.email "ban@example.com"
git config --get user.name
git config --get user.email
```

## B. Cấu trúc dự án

```text
chat_project/
├── server/
│   ├── server.js
│   ├── config.js
│   ├── db.js
│   ├── sessions.js
│   ├── router.js
│   ├── handlers/
│   │   ├── auth.js
│   │   ├── message.js
│   │   ├── group.js
│   │   ├── file.js
│   │   ├── history.js
│   │   ├── state.js
│   │   └── p2p.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── checksum.js
│   ├── uploads/
│   │   ├── files/
│   │   │   └── .gitkeep
│   │   ├── images/
│   │   │   └── .gitkeep
│   │   ├── videos/
│   │   │   └── .gitkeep
│   │   └── sounds/
│   │       └── .gitkeep
│   ├── data/
│   │   ├── .gitkeep
│   │   └── chat.db
│   └── package.json
├── client/
│   ├── main.js
│   ├── preload.js
│   ├── network.js
│   ├── p2p.js
│   ├── fileTransfer.js
│   ├── renderer/
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js
│   │   ├── js/
│   │   │   ├── auth.js
│   │   │   ├── contacts.js
│   │   │   ├── chat.js
│   │   │   ├── group.js
│   │   │   ├── media.js
│   │   │   ├── recorder.js
│   │   │   ├── emoji.js
│   │   │   ├── history.js
│   │   │   └── state.js
│   │   └── assets/
│   │       ├── icons/
│   │       └── sounds/
│   ├── downloads/
│   │   └── .gitkeep
│   └── package.json
├── common/
│   ├── protocol.js
│   └── constants.js
├── test/
│   └── protocol.test.js
├── docs/
├── .gitignore
└── README.md
```

Cây trên theo thứ tự trong đề. Sau khi cài, npm tạo thêm `node_modules/` và `package-lock.json` trong cả `server/` và `client/`. Hai thư mục `assets/icons/` và `assets/sounds/` có `.gitkeep` để Git giữ thư mục rỗng. Bản hướng dẫn dựng lại nằm trong `docs/huong-dan-dung-khung.md`.

## C. Cài thư viện trên máy mới

Mở PowerShell tại `chat_project`. Hai lệnh dùng đúng phiên bản trong lockfile. Trên máy chỉ chạy Client, chỉ cần lệnh thứ hai. Giữ thư mục `common/` bên cạnh `client/` và `server/` khi sao chép mã nguồn.

```powershell
npm.cmd --prefix server ci
npm.cmd --prefix client ci
```

Server dùng `better-sqlite3` và `bcryptjs`. Client dùng `electron` làm devDependency. Lần mở Client đầu tiên trên máy mới cần Internet để tải bản chạy Electron.

## D. Chạy thử trên cùng máy

**PowerShell 1**, tại `chat_project`:

```powershell
npm.cmd --prefix server start
```

Server in `listening on 0.0.0.0:5000` và các địa chỉ IPv4. Khi cần đổi cổng, đặt `$env:PORT = '5001'` trước lệnh chạy, rồi nhập cùng số cổng trên Client. Nhấn Ctrl+C để dừng Server.

**PowerShell 2**, tại `chat_project`:

```powershell
npm.cmd --prefix client start
```

Nhập `127.0.0.1`, cổng `5000`, bấm **Kết nối**. Client tự gửi PING đầu tiên. Bấm **Gửi PING** để gửi thêm trên cùng socket. Mỗi lần thành công có một dòng **GỬI** và một dòng **NHẬN**.

```json
{"type":"PING","from":null,"time":"2026-11-21T15:22:08.020Z"}
```

`time` là giờ UTC do Server gán. `from` là tài khoản gắn với socket và hiện bằng `null` khi chưa đăng nhập. Các lệnh khác trả `ERROR` với `content` bằng `"chưa cài đặt"`. PING chỉ kiểm tra kết nối nên bảng tin nhắn vẫn trống.

**Đường đi của gói.** Giao diện gọi preload qua `contextBridge`. Tiến trình chính nhận IPC và dùng `net` mở TCP. Mỗi gói gồm 4 byte UInt32BE ghi số byte của phần JSON UTF-8, kế tiếp là JSON. Mỗi socket có bộ giải mã riêng, tiếp tục đọc khi thiếu byte và đọc tiếp gói sau nếu còn dữ liệu. Hai đầu đóng socket khi thấy độ dài vượt 1 MiB. Khối tệp dành cho bước sau có kích thước 64 KiB.

## E. Demo trên hai máy

1. Nối cả hai máy vào cùng Wi-Fi, hoặc cho cả hai cùng kết nối điểm phát sóng của điện thoại.
2. Chạy Server trên máy A. Ghi địa chỉ ở dòng **IP LAN (Wi-Fi)**. Có thể đối chiếu bằng `ipconfig` và tìm IPv4 của bộ điều hợp Wi-Fi đang kết nối.
3. Chạy Client trên máy B, nhập IPv4 của A và cổng Server in ra. Bấm **Kết nối**, rồi **Gửi PING**. So sánh dòng **NHẬN** có trường `time` trên B với địa chỉ Client mà A vừa ghi nhận.

| Hiện tượng | Cách xử lý |
| --- | --- |
| Máy A chạy được, máy B không kết nối | `127.0.0.1` và `localhost` luôn chỉ chính máy đang chạy Client. Trên B, nhập IPv4 Wi-Fi của A. |
| Hết thời gian chờ | Trên B chạy `Test-NetConnection <IP-của-A> -Port 5000`, thay phần trong dấu ngoặc bằng IP thật. Nếu thất bại, kiểm tra cổng và cho phép Node.js hoặc TCP 5000 chiều vào trên cấu hình mạng riêng của A. |
| Cùng Wi-Fi nhưng hai máy không thấy nhau | Wi-Fi khách hoặc hotspot có thể bật AP/client isolation. Chuyển sang mạng cho phép các thiết bị liên lạc trực tiếp. |
| `ECONNREFUSED` hoặc `EADDRINUSE` | Kiểm tra Server đang chạy và hai đầu dùng cùng cổng. Nếu cổng đang bận, chọn `PORT` khác. |
| Client thoát ngay, không mở cửa sổ | Nếu `$env:ELECTRON_RUN_AS_NODE` bằng `1`, chạy `Remove-Item Env:ELECTRON_RUN_AS_NODE` trong terminal Client rồi chạy lại. |
| Lỗi cài hoặc nạp better-sqlite3 | Chọn Node 22 x64, kiểm tra `node -p "process.version + ' ' + process.arch"` và chạy lại `npm.cmd --prefix server ci` trên máy đích để có bản nhị phân đúng nền tảng. |

Nếu phải biên dịch mô-đun SQLite từ nguồn trên Windows, cài Python 3 và Visual Studio Build Tools với workload **Desktop development with C++** cùng Windows SDK. Mở Developer PowerShell mới rồi làm theo hướng dẫn build của phiên bản thư viện. Phương án dự phòng là đổi sang `sqlite3` sau khi thống nhất, vì API bất đồng bộ của gói đó đòi hỏi sửa `server/db.js` và các lệnh truy vấn. [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · [Môi trường biên dịch node-gyp trên Windows](https://github.com/nodejs/node-gyp#on-windows)

## F. Checklist kiểm tra

Tại thư mục gốc `chat_project`, chạy:

```powershell
node test/protocol.test.js
```

- [ ] Server in `listening on 0.0.0.0:5000` và IP LAN.
- [ ] Client cùng máy kết nối `127.0.0.1:5000`, bấm **Gửi PING**, nhận `PING` có `time`.
- [ ] Client máy thứ hai cùng Wi-Fi hoặc hotspot nhận phản hồi khi nhập IP LAN của Server.
- [ ] Đóng đột ngột Client. Server vẫn chạy và trả PING khi mở Client kết nối lại.
- [ ] Kiểm thử giao thức in ba dòng **Đạt** cho gói dính, gói bị cắt và gói vượt giới hạn.

Bước kế tiếp là viết REGISTER và LOGIN bằng bcryptjs, gắn tài khoản vào socket qua `sessions.add`, rồi phát STATE khi đăng nhập, đăng xuất hoặc mất kết nối.
~~~~

## F. Kiểm thử

Lưu tệp kiểm thử dưới đây. Chạy từ chat_project. Mở hai PowerShell riêng cho hai lệnh start và thực hiện checklist trong README.

~~~~powershell
node test/protocol.test.js
# PowerShell 1
npm.cmd --prefix server start
# PowerShell 2
npm.cmd --prefix client start
~~~~

### test/protocol.test.js

~~~~javascript
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
~~~~
