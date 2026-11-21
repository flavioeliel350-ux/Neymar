const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('prontoPrecoDesktop', {
  isDesktop: true,
  platform: process.platform,
});
