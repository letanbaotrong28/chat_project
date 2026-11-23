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
ipcMain.handle('chat:message', (event, to, content) => {
  checkSender(event);
  network.message(to, content);
});
ipcMain.handle('group:create', (event, name) => {
  checkSender(event);
  network.createGroup(name);
});
ipcMain.handle('group:add', (event, groupId, username) => {
  checkSender(event);
  network.addMember(groupId, username);
});
ipcMain.handle('chat:history', (event, peer, beforeId, requestId) => {
  checkSender(event);
  network.history(peer, beforeId, requestId);
});
ipcMain.handle('chat:ack', (event, id, status) => {
  checkSender(event);
  if (!Number.isSafeInteger(id) || id <= 0 || !['received', 'seen'].includes(status)) {
    throw new Error('Xác nhận tin nhắn không hợp lệ.');
  }
  network.acknowledge(id, status);
});
for (const action of ['register', 'login', 'logout']) {
  ipcMain.handle('auth:' + action, (event, username, password) => {
    checkSender(event);
    network[action](username, password);
  });
}

function openWindow() {
  window = new BrowserWindow({
    title: 'Chat LAN', width: 820, height: 740, minWidth: 420, minHeight: 440,
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
