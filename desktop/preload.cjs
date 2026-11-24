const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prontoPrecoDesktop', {
  isDesktop: true,
  platform: process.platform,
  getEnv: () => ipcRenderer.invoke('prontopreco:get-env'),
  installUpdate: (url, fileName) =>
    ipcRenderer.invoke('prontopreco:install-update', { url, fileName }),
  onUpdateProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('prontopreco:update-progress', handler);
    return () => ipcRenderer.removeListener('prontopreco:update-progress', handler);
  },
});
