const { contextBridge, ipcRenderer } = require('electron');

// Giao diện chỉ được gọi các thao tác TCP cụ thể.
contextBridge.exposeInMainWorld('tcp', {
  connect: (host, port) => ipcRenderer.invoke('tcp:connect', host, port),
  ping: () => ipcRenderer.invoke('tcp:ping'),
  createGroup: (name, members) => ipcRenderer.invoke('group:create', name, members),
  addMember: (groupId, username) => ipcRenderer.invoke('group:add', groupId, username),
  deleteGroup: groupId => ipcRenderer.invoke('group:delete', groupId),
  message: (to, content, replyTo) => ipcRenderer.invoke('chat:message', to, content, replyTo),
  react: (id, emoji) => ipcRenderer.invoke('chat:react', id, emoji),
  updateMessage: (id, action, content) => ipcRenderer.invoke('chat:update', id, action, content),
  upload: (peer, replyTo) => ipcRenderer.invoke('file:upload', peer, replyTo),
  sendVoice: (peer, bytes, replyTo) => ipcRenderer.invoke('voice:send', peer, bytes, replyTo),
  download: id => ipcRenderer.invoke('file:download', id),
  onFileProgress(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('file:progress', listener);
    return () => ipcRenderer.removeListener('file:progress', listener);
  },
  acknowledge: (id, status) => ipcRenderer.invoke('chat:ack', id, status),
  history: (peer, beforeId, requestId) => ipcRenderer.invoke('chat:history', peer, beforeId, requestId),
  register: (name, password) => ipcRenderer.invoke('auth:register', name, password),
  login: (name, password) => ipcRenderer.invoke('auth:login', name, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  onEvent(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('tcp:event', listener);
    return () => ipcRenderer.removeListener('tcp:event', listener);
  }
});
