const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openInFinder: (path) => ipcRenderer.send('open-in-finder', path),
  getDiskSpace: (path) => ipcRenderer.invoke('get-disk-space', path)
});
