// Bridge between the setup page and the main process. The page gets only these four
// functions (no Node.js, no Electron APIs): contextIsolation + sandbox keep it that way.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('acaia', {
  getSetup: () => ipcRenderer.invoke('setup:get'),
  saveKey: (apiKey, model) => ipcRenderer.invoke('setup:save', { apiKey, model }),
  useDemo: () => ipcRenderer.invoke('setup:demo'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
