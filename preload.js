const { contextBridge, ipcRenderer } = require('electron');

// Frontend වෙබ් පිටුවට සහ Customer Display තිරයට Electron Direct APIs නිරාවරණය කිරීම
contextBridge.exposeInMainWorld('electronAPI', {
  // 🖨️ Thermal Silent Print Engine
  printSilent: (options) => ipcRenderer.invoke('print-silent', options),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  
  // 💾 Local Automatic Hard-Disk Backup API
  saveLocalAutoBackup: (backupData) => ipcRenderer.invoke('save-local-auto-backup', backupData),
  
  // 📲 Direct WhatsApp Desktop Native Protocol
  openWhatsAppDirect: ({ phone, text }) => ipcRenderer.invoke('open-whatsapp-direct', { phone, text }),
  
  // 🖥️ Dual Screen / Customer-Facing Display (CFD) Bridges
  openCustomerDisplay: () => ipcRenderer.invoke('open-customer-display'),
  closeCustomerDisplay: () => ipcRenderer.invoke('close-customer-display'),
  hasSecondaryDisplay: () => ipcRenderer.invoke('has-secondary-display'),
  
  // POS කවුන්ටරයෙන් දත්ත දෙවන තිරයට යැවීම
  syncCustomerDisplay: (data) => ipcRenderer.send('sync-customer-display', data),
  
  // දෙවන තිරය (customer-display.html) මඟින් සජීවී දත්ත ලබාගැනීම
  onCustomerDisplayUpdate: (callback) => {
    ipcRenderer.on('customer-display-update', (event, data) => callback(data));
  },
  
  // 📡 Local LAN Offline Printing Bridges (අන්තර්ජාලය නැතිව Print කිරීමට)
  getLocalServerInfo: () => ipcRenderer.invoke('get-local-server-info'),
  onLanOrderReceived: (callback) => ipcRenderer.on('lan-order-received', (event, data) => callback(data)),
  closeApp: () => ipcRenderer.invoke('close-app')
});
