const { contextBridge, ipcRenderer } = require('electron');

// Giao diện chỉ được gọi các thao tác TCP cụ thể.
contextBridge.exposeInMainWorld('tcp', {
  connect: (host, port) => ipcRenderer.invoke('tcp:connect', host, port),
  ping: () => ipcRenderer.invoke('tcp:ping'),
  register: (name, password) => ipcRenderer.invoke('auth:register', name, password),
  login: (name, password) => ipcRenderer.invoke('auth:login', name, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  onEvent(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('tcp:event', listener);
    return () => ipcRenderer.removeListener('tcp:event', listener);
  }
});
