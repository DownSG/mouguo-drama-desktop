const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  toggleFullscreen: () => ipcRenderer.invoke('win:toggle-fullscreen'),
  setFullscreen: (value) => ipcRenderer.invoke('win:set-fullscreen', value),
  isFullscreen: () => ipcRenderer.invoke('win:is-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  version: () => ipcRenderer.invoke('app:version'),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('win:maximized-changed', (_event, value) => callback(value));
  },
  onFullscreenChange: (callback) => {
    ipcRenderer.on('win:fullscreen-changed', (_event, value) => callback(value));
  }
});
