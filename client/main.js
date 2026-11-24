const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const { createNetwork } = require('./network');
const { uploadFile, fileInfo, downloadFile } = require('./fileTransfer');
const { createMediaPreview } = require('./mediaPreview');
const { MAX_VOICE_BYTES } = require('../common/media');

protocol.registerSchemesAsPrivileged([{ scheme: 'chat-media', privileges: { standard: true, secure: true, stream: true } }]);

let window;
const network = createNetwork(data => {
  if (data.kind === 'state' || (data.kind === 'received' && data.packet.type === 'LOGOUT')) preview.reset();
  if (data.kind === 'received' && data.packet.type === 'LOGIN') data.previewKey = preview.reset(true);
  if (window && !window.webContents.isDestroyed()) window.webContents.send('tcp:event', data);
});
const preview = createMediaPreview(network.fileChannel);

function checkSender(event) {
  if (!window || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('Cửa sổ gửi yêu cầu không hợp lệ.');
  }
}

let transferring = false;
async function transfer(event, operation) {
  checkSender(event);
  if (transferring) return { error: 'Đang truyền một tệp khác.' };
  transferring = true;
  try {
    const channel = network.fileChannel();
    let lastPercent = -1;
    function progress(bytes, total, name) {
      channel.assertActive();
      const percent = total ? Math.floor(bytes / total * 100) : 100;
      if (percent !== lastPercent) {
        event.sender.send('file:progress', { name, percent });
        lastPercent = percent;
      }
    }
    return await operation(channel, progress);
  } catch (error) {
    return { error: error.message };
  } finally {
    transferring = false;
  }
}

ipcMain.handle('file:upload', (event, peer, replyTo) => transfer(event, async (channel, progress) => {
  const choice = await dialog.showOpenDialog(window, { title: 'Chọn tệp để gửi', properties: ['openFile'] });
  if (choice.canceled) return {};
  channel.assertActive();
  await uploadFile(channel, peer, choice.filePaths[0], progress, false, replyTo);
  return { text: 'Đã gửi ' + path.basename(choice.filePaths[0]) + ' · SHA-256 khớp.' };
}));

ipcMain.handle('file:download', (event, id) => transfer(event, async (channel, progress) => {
  const file = await fileInfo(channel, id);
  let name = file.name.replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/, '') || 'tep';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) name = '_' + name;
  const choice = await dialog.showSaveDialog(window, {
    title: 'Lưu tệp về máy', defaultPath: path.join(__dirname, 'downloads', name)
  });
  if (choice.canceled || !choice.filePath) return {};
  await downloadFile(channel, id, file, choice.filePath, progress);
  return { text: 'Đã lưu ' + choice.filePath + ' · SHA-256 khớp.' };
}));

ipcMain.handle('voice:send', (event, peer, bytes, replyTo) => transfer(event, async (channel, progress) => {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_VOICE_BYTES) {
    throw new Error('Bản ghi trống hoặc vượt quá 16 MiB.');
  }
  const dir = await fs.mkdtemp(path.join(app.getPath('temp'), 'chat-voice-'));
  const filename = path.join(dir, 'Ghi-am-' + Date.now() + '.weba');
  try {
    await fs.writeFile(filename, bytes, { flag: 'wx' });
    await uploadFile(channel, peer, filename, progress, true, replyTo);
    return { text: 'Đã gửi tin nhắn thoại.' };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}));
ipcMain.handle('tcp:connect', (event, host, port) => {
  checkSender(event);
  network.connect(host, port);
});
ipcMain.handle('tcp:ping', event => {
  checkSender(event);
  network.ping();
});
ipcMain.handle('chat:message', (event, to, content, replyTo) => {
  checkSender(event);
  network.message(to, content, replyTo);
});
ipcMain.handle('chat:react', (event, id, emoji) => {
  checkSender(event);
  network.react(id, emoji);
});
ipcMain.handle('chat:update', (event, id, action, content) => {
  checkSender(event);
  network.updateMessage(id, action, content);
});
ipcMain.handle('group:create', (event, name, members) => {
  checkSender(event);
  network.createGroup(name, members);
});
ipcMain.handle('group:add', (event, groupId, username) => {
  checkSender(event);
  network.addMember(groupId, username);
});
ipcMain.handle('group:delete', (event, groupId) => {
  checkSender(event);
  network.deleteGroup(groupId);
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
    title: 'Chat LAN', width: 1080, height: 790, minWidth: 420, minHeight: 440,
    backgroundColor: '#f4f5fa', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const page = path.join(__dirname, 'renderer', 'index.html');
  const pageUrl = pathToFileURL(page).href;
  const localChat = contents => contents && contents === window?.webContents && contents.getURL() === pageUrl;
  window.webContents.session.setPermissionCheckHandler((contents, permission, _origin, details) =>
    Boolean(localChat(contents) && (permission === 'fullscreen' ||
      (permission === 'media' && details.mediaType === 'audio'))));
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const microphone = permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio';
    callback(Boolean(localChat(contents) && details.isMainFrame && details.requestingUrl === pageUrl &&
      (microphone || permission === 'fullscreen')));
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('did-start-loading', () => { preview.reset(); network.close(); });
  window.on('closed', () => {
    window = null;
    preview.reset();
    network.close();
  });
  window.loadFile(page);
}

app.whenReady().then(() => {
  protocol.handle('chat-media', preview.respond);
  openWindow();
});
app.on('activate', () => { if (!window) openWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let cleanedUp = false;
app.on('will-quit', event => {
  if (cleanedUp) return;
  event.preventDefault();
  preview.close().then(() => { cleanedUp = true; app.quit(); });
});
