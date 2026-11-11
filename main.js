const { app, BrowserWindow, ipcMain, dialog, screen, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// 🛡️ CRITICAL FIX 1: Electron Application Menu එක සම්පූර්ණයෙන්ම ඉවත් කිරීම
Menu.setApplicationMenu(null);

let mainWindow = null;
let customerWindow = null;
let printWorkerWindow = null;
let localHttpServer = null;
const LOCAL_SERVER_PORT = 8085;

// 🛡️ 1. GLOBAL CRASH-PROOF EXCEPTION HANDLERS
process.on('uncaughtException', (error) => {
  console.error("CRITICAL: Unhandled System Exception caught:", error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("CRITICAL: Unhandled Promise Rejection at:", promise, "reason:", reason);
});

// 🌐 1.1 HELPER: GET LOCAL WI-FI / ETHERNET IP ADDRESS (ROUTER LOCAL IP)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const ifaceName in interfaces) {
    for (const iface of interfaces[ifaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// 🛡️ 1.2 UNIVERSAL WINDOWS FOCUS RECOVERY HELPER (UNFREEZES TEXTBOXES IN 1MS)
function restoreWindowNativeFocus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (process.platform === 'win32') {
      mainWindow.blur();
    }
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
}

// 📡 IPC LISTENER TO FIX FROZEN INPUTS
ipcMain.on('fix-focus', () => {
  restoreWindowNativeFocus();
});

// 📡 1.3 OFFLINE LOCAL LAN HTTP PRINT SERVER
function startLocalLanPrintServer() {
  if (localHttpServer) return;

  try {
    localHttpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url || '';

      if (req.method === 'GET' && (url === '/' || url === '/api/status' || url === '/api/info')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'online',
          app: 'Restaurant ERP LAN Print Server',
          localIp: getLocalIpAddress(),
          port: LOCAL_SERVER_PORT,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      if (req.method === 'POST' && (url === '/api/order' || url === '/api/kot')) {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', () => {
          try {
            const orderData = JSON.parse(body);
            if (!orderData || !orderData.items || !Array.isArray(orderData.items)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Invalid order items payload' }));
              return;
            }

            console.log(`📥 [LAN Server] Offline Order Received from Mobile for Table: ${orderData.tableNo || 'N/A'}`);

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('lan-order-received', orderData);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'Order successfully received via Local Wi-Fi and sent to printer',
              tableNo: orderData.tableNo || 'N/A',
              timestamp: new Date().toISOString()
            }));
          } catch (err) {
            console.error("Local Order Parsing Error:", err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
    });

    localHttpServer.listen(LOCAL_SERVER_PORT, '0.0.0.0', () => {
      console.log(`📡 Local LAN Offline Print Server Running: http://${getLocalIpAddress()}:${LOCAL_SERVER_PORT}`);
    });

    localHttpServer.on('error', (err) => {
      console.error("Local LAN Server Error:", err.message);
    });
  } catch (err) {
    console.error("Failed to start Local LAN Server:", err.message);
  }
}

// 🔒 2. SINGLE INSTANCE LOCK
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      restoreWindowNativeFocus();
    }
  });
  
  app.whenReady().then(() => {
    createWindow();
    initPrintWorkerWindow();
    startLocalLanPrintServer();
    setTimeout(() => {
      createOrUpdateCustomerDisplay();
    }, 1500);
  });
}

// 🖨️ 3. NON-FOCUSABLE SILENT PRINT WORKER
function initPrintWorkerWindow() {
  if (!printWorkerWindow || printWorkerWindow.isDestroyed()) {
    printWorkerWindow = new BrowserWindow({
      width: 260,
      height: 600,
      show: false,
      frame: false,
      focusable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    });
    printWorkerWindow.setMenu(null);
  }
  return printWorkerWindow;
}

// 🖥️ 4. DUAL SCREEN / CUSTOMER-FACING DISPLAY (CFD)
function createOrUpdateCustomerDisplay() {
  try {
    const displays = screen.getAllDisplays();
    const secondaryDisplay = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);

    if (secondaryDisplay) {
      if (!customerWindow || customerWindow.isDestroyed()) {
        customerWindow = new BrowserWindow({
          x: secondaryDisplay.bounds.x,
          y: secondaryDisplay.bounds.y,
          width: secondaryDisplay.bounds.width,
          height: secondaryDisplay.bounds.height,
          fullscreen: true,
          frame: false,
          show: false,
          focusable: false,
          autoHideMenuBar: true,
          title: "Customer Facing Display",
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            devTools: false
          }
        });

        customerWindow.setMenu(null);
        customerWindow.loadFile('customer-display.html');

        customerWindow.once('ready-to-show', () => {
          if (customerWindow && !customerWindow.isDestroyed()) {
            customerWindow.showInactive();
          }
        });

        customerWindow.on('closed', () => {
          customerWindow = null;
        });
      } else {
        customerWindow.setBounds(secondaryDisplay.bounds);
        customerWindow.setFullScreen(true);
        customerWindow.showInactive();
      }
    }
  } catch (err) {
    console.warn("Dual screen initialization pass:", err.message);
  }
}

app.whenReady().then(() => {
  screen.on('display-added', () => createOrUpdateCustomerDisplay());
  screen.on('display-removed', () => {
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.close();
      customerWindow = null;
    }
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    title: "Restaurant ERP - SME Enterprise Edition",
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: false
    }
  });
  
  mainWindow.setMenu(null);
  mainWindow.maximize();
  mainWindow.loadFile('index.html');

  mainWindow.on('restore', () => {
    restoreWindowNativeFocus();
  });
  
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });
  
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      input.key === 'F5' ||
      (input.control && input.key.toLowerCase() === 'r')
    ) {
      event.preventDefault();
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['ඔව්, ඉවත් වන්න (Exit)', 'නැත, කවුන්ටරයේ රැඳෙන්න (Cancel)'],
        defaultId: 1,
        cancelId: 1,
        title: 'Restaurant ERP තහවුරු කිරීම',
        message: 'ඔබට මෙම කවුන්ටර මෘදුකාංගයෙන් ඉවත් වීමට අවශ්‍යද?',
        detail: 'විවෘත බිල්පත් හෝ සක්‍රීය Shift එකක් ඇත්නම් කරුණාකර පළමුව පරීක්ෂා කරන්න.'
      });

      if (choice === 1) {
        e.preventDefault();
        restoreWindowNativeFocus(); // Fix focus after cancel
      } else {
        app.isQuitting = true;
      }
    }
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.close();
      customerWindow = null;
    }
    if (printWorkerWindow && !printWorkerWindow.isDestroyed()) {
      printWorkerWindow.destroy();
      printWorkerWindow = null;
    }
    if (localHttpServer) {
      try { localHttpServer.close(); } catch (e) {}
      localHttpServer = null;
    }
  });
  
  mainWindow.once('ready-to-show', () => {
    if (app.isPackaged) {
      try {
        autoUpdater.autoDownload = true;
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
          console.log("Update check info:", err.message);
        });
      } catch (e) {}
    }
  });
}

autoUpdater.on('update-downloaded', (info) => {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '🎉 Update Ready!',
    message: `පද්ධතියේ නව Version (${info.version}) එක සාර්ථකව Download විය.`,
    detail: 'නව වෙනස්කම් සහිතව App එක දැන්ම Restart කිරීමට කැමතිද?',
    buttons: ['දැන්ම Restart කරන්න', 'පසුව (Later)'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    } else {
      restoreWindowNativeFocus();
    }
  });
});

// 📄 DIRECT PDF GENERATION & SAVE IPC ENGINE (WITH AUTO FOCUS RESTORE)
ipcMain.handle('save-pdf', async (event, { htmlContent, filename = "Report.pdf", orientation = "portrait" }) => {
  let pdfWin = null;
  try {
    const isLandscape = orientation === "landscape";
    pdfWin = new BrowserWindow({
      show: false,
      frame: false,
      focusable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    const pdfBuffer = await pdfWin.webContents.printToPDF({
      landscape: isLandscape,
      pageSize: 'A4',
      printBackground: true,
      margins: {
        marginType: 'custom',
        top: 0.3,
        bottom: 0.3,
        left: 0.3,
        right: 0.3
      }
    });

    const defaultPath = path.join(app.getPath('downloads'), filename);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF Report (PDF වාර්තාව සුරකින්න)',
      defaultPath: defaultPath,
      filters: [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }]
    });

    if (!canceled && filePath) {
      fs.writeFileSync(filePath, pdfBuffer);
      return { success: true, filePath };
    }
    return { success: false, canceled: true };
  } catch (err) {
    console.error("PDF generation failed:", err);
    return { success: false, error: err.message };
  } finally {
    if (pdfWin && !pdfWin.isDestroyed()) {
      pdfWin.destroy();
    }
    // 🛡️ CRITICAL UNFREEZE: Restore focus after Windows Save Dialog closes
    restoreWindowNativeFocus();
  }
});

// 💾 5. LOCAL AUTOMATIC HARD-DISK BACKUP ENGINE
ipcMain.handle('save-local-auto-backup', async (event, backupData) => {
  try {
    const backupDir = path.join(app.getPath('documents'), 'RestaurantERP_Backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    const filePath = path.join(backupDir, `Backup_${dateStr}_${timeStr}.json`);
    
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');
    return { success: true, path: filePath };
  } catch (err) {
    console.error("Local backup write failed:", err);
    return { success: false, error: err.message };
  } finally {
    restoreWindowNativeFocus();
  }
});

// 🖨️ 6. ROCK-SOLID DIRECT PRINT ENGINE
let lastPrintTimestamp = 0;
let lastPrintedSignature = "";

function computeStringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

let printExecutionLock = Promise.resolve();

ipcMain.handle('print-silent', async (event, printArgs) => {
  return new Promise((resolve) => {
    printExecutionLock = printExecutionLock.then(async () => {
      try {
        const result = await executeSinglePrintTask(printArgs);
        resolve(result);
      } catch (err) {
        resolve({ success: false, error: err.message || "Print execution failed" });
      } finally {
        restoreWindowNativeFocus();
      }
    });
  });
});

async function executeSinglePrintTask({ printerName, htmlContent, paperWidth = "80mm" }) {
  return new Promise(async (resolve) => {
    let isFinished = false;

    const timeoutTimer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        resolve({ success: false, error: "Printer Connection Timed Out" });
      }
    }, 6000);

    try {
      if (!mainWindow) {
        clearTimeout(timeoutTimer);
        return resolve({ success: false, error: "Main window not found" });
      }
      if (!htmlContent || !htmlContent.trim()) {
        clearTimeout(timeoutTimer);
        return resolve({ success: false, error: "Print content is empty" });
      }

      const printers = await mainWindow.webContents.getPrintersAsync();
      let targetDevice = "";
      
      if (printerName && printerName.trim()) {
        const cleanReq = printerName.trim().toLowerCase();
        const matched = printers.find(p => {
          const pName = p.name.toLowerCase();
          return pName === cleanReq || pName.includes(cleanReq) || cleanReq.includes(pName);
        });
        if (matched) {
          targetDevice = matched.name;
        }
      }
      
      if (!targetDevice) {
        const def = printers.find(p => p.isDefault);
        targetDevice = def ? def.name : (printers.length > 0 ? printers[0].name : "");
      }
      
      if (!targetDevice) {
        clearTimeout(timeoutTimer);
        return resolve({ success: false, error: "පරිගණකයට කිසිදු Printer එකක් සම්බන්ධ කර නොමැත." });
      }

      const nowMs = Date.now();
      const contentHash = computeStringHash(htmlContent);
      const printSignature = `${targetDevice}_${contentHash}`;

      if (printSignature === lastPrintedSignature && (nowMs - lastPrintTimestamp) < 300) {
        clearTimeout(timeoutTimer);
        return resolve({ success: true, duplicateIgnored: true });
      }
      lastPrintTimestamp = nowMs;
      lastPrintedSignature = printSignature;
      
      const pWin = initPrintWorkerWindow();
      
      const is58mm = (paperWidth === "58mm");
      const pageSize = is58mm ? "58mm auto" : "80mm auto";
      const bodyWidth = is58mm ? "48mm" : "68mm";
      const baseFontSize = is58mm ? "9.5px" : "11px";
      const lineHeight = is58mm ? "1.25" : "1.35";
      const truncateMax = is58mm ? "24mm" : "40mm";

      const fullPrintHtml = `
        <!DOCTYPE html>
        <html lang="si">
        <head>
          <meta charset="UTF-8">
          <style>
            @page { 
              margin: 0 !important; 
              size: ${pageSize} !important; 
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              margin: 0;
              padding: 0;
            }
            html, body {
              width: ${bodyWidth} !important;
              max-width: ${bodyWidth} !important;
              margin: 0 !important;
              padding: 0.5mm 1mm 2mm 1mm !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace, sans-serif !important;
              font-size: ${baseFontSize} !important;
              line-height: ${lineHeight} !important;
              color: #000000 !important;
              background: #ffffff !important;
              text-align: left !important;
              visibility: visible !important;
              overflow: visible !important;
              page-break-inside: avoid !important;
              page-break-after: avoid !important;
            }
            div, p, span, h2, h3, h4, table, tr, td {
              visibility: visible !important;
              color: #000000 !important;
            }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .text-left { text-align: left !important; }
            .font-bold { font-weight: 700 !important; }
            .font-black { font-weight: 900 !important; }
            .font-mono { font-family: 'Courier New', Courier, monospace !important; }
            .uppercase { text-transform: uppercase !important; }
            .flex { 
              display: flex !important; 
              justify-content: space-between !important; 
              align-items: flex-start !important; 
              width: 100% !important; 
            }
            .space-y-0\\.5 > * + * { margin-top: 2px !important; }
            .space-y-1 > * + * { margin-top: 3px !important; }
            .space-y-1\\.5 > * + * { margin-top: 4px !important; }
            .border-b { border-bottom: 1px dashed #000000 !important; padding-bottom: 2px !important; margin-bottom: 2px !important; }
            .border-b-2 { border-bottom: 2px solid #000000 !important; padding-bottom: 3px !important; margin-bottom: 3px !important; }
            .border-t { border-top: 1px dashed #000000 !important; padding-top: 2px !important; margin-top: 2px !important; }
            .border-t-2 { border-top: 2px solid #000000 !important; padding-top: 3px !important; margin-top: 3px !important; }
            .truncate { 
              overflow: hidden !important; 
              text-overflow: ellipsis !important; 
              white-space: nowrap !important; 
              max-width: ${truncateMax} !important; 
            }
            .w-12 { width: ${is58mm ? '8mm' : '12mm'} !important; }
            .w-32 { width: ${is58mm ? '20mm' : '30mm'} !important; }
            .w-36 { width: ${is58mm ? '24mm' : '34mm'} !important; }
            .w-44 { width: ${is58mm ? '28mm' : '40mm'} !important; }
            .w-1\\/2, .w-1-2 { width: 48% !important; display: inline-block !important; }
            .w-1\\/4, .w-1-4 { width: 26% !important; display: inline-block !important; text-align: right !important; }
            .w-3\\/4, .w-3-4 { width: 72% !important; display: inline-block !important; }
          </style>
        </head>
        <body>
          <div style="width: ${bodyWidth}; max-width: ${bodyWidth}; margin: 0; text-align: left;">
            ${htmlContent}
          </div>
        </body>
        </html>
      `;
      
      await pWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullPrintHtml)}`);
      
      pWin.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: targetDevice,
        margins: { marginType: 'none' }
      }, (success, failureReason) => {
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timeoutTimer);
          if (success) {
            resolve({ success: true, usedPrinter: targetDevice });
          } else {
            resolve({ success: false, error: failureReason || "Printer spooler rejected job" });
          }
        }
      });

    } catch (err) {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutTimer);
        resolve({ success: false, error: err.message });
      }
    }
  });
}

ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

// 🌐 7. LOCAL SERVER INFO IPC FOR FRONTEND SETTINGS
ipcMain.handle('get-local-server-info', async () => {
  return {
    localIp: getLocalIpAddress(),
    port: LOCAL_SERVER_PORT,
    serverUrl: `http://${getLocalIpAddress()}:${LOCAL_SERVER_PORT}`
  };
});

ipcMain.handle('open-whatsapp-direct', async (event, { phone, text }) => {
  try {
    let cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '94' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('94') && cleanPhone.length === 9) {
      cleanPhone = '94' + cleanPhone;
    }

    const desktopUri = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    try {
      await shell.openExternal(desktopUri);
      return { success: true, method: 'desktop' };
    } catch (desktopErr) {
      const webUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
      await shell.openExternal(webUrl);
      return { success: true, method: 'web' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-customer-display', async () => {
  createOrUpdateCustomerDisplay();
  return { success: !!customerWindow };
});

ipcMain.handle('close-customer-display', async () => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.close();
    customerWindow = null;
  }
  return { success: true };
});

ipcMain.handle('has-secondary-display', async () => {
  const displays = screen.getAllDisplays();
  return displays.length > 1;
});

ipcMain.on('sync-customer-display', (event, displayData) => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('customer-display-update', displayData);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('close-app', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});
