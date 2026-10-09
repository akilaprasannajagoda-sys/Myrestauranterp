const { contextBridge, ipcRenderer } = require('electron');

// Frontend වෙබ් පිටුවට Electron Direct API එක නිරාවරණය කිරීම
contextBridge.exposeInMainWorld('electronAPI', {
  printSilent: (options) => ipcRenderer.invoke('print-silent', options),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
