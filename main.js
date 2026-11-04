const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let customerWindow = null;
let printWorkerWindow = null;

// 🛡️ 1. GLOBAL CRASH-PROOF EXCEPTION HANDLERS
process.on('uncaughtException', (error) => {
  console.error("CRITICAL: Unhandled System Exception caught:", error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("CRITICAL: Unhandled Promise Rejection at:", promise, "reason:", reason);
});

// 🔒 2. SINGLE INSTANCE LOCK
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  
  app.whenReady().then(() => {
    createWindow();
    initPrintWorkerWindow();
    setTimeout(() => {
      createOrUpdateCustomerDisplay();
    }, 1500);
  });
}

// 🖨️ 3. NON-FOCUSABLE SILENT PRINT WORKER (PREVENTS TEXTBOX FOCUS FREEZE)
function initPrintWorkerWindow() {
  if (!printWorkerWindow || printWorkerWindow.isDestroyed()) {
    printWorkerWindow = new BrowserWindow({
      width: 260,
      height: 600,
      show: false,
      frame: false,
      focusable: false, // 🛡️ CRITICAL: Never steals keyboard focus from Cashier textboxes!
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    });
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
          show: true,
          focusable: false, // 🛡️ Secondary screen never steals keyboard focus
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

        customerWindow.loadFile('customer-display.html');

        customerWindow.on('closed', () => {
          customerWindow = null;
        });
      } else {
        customerWindow.setBounds(secondaryDisplay.bounds);
        customerWindow.setFullScreen(true);
        customerWindow.show();
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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: false
    }
  });
  
  mainWindow.maximize();
  mainWindow.loadFile('index.html');

  // 🛡️ RECOVER NATIVE FOCUS CLEANLY (WITHOUT BLURRING ACTIVE TEXTBOX)
  mainWindow.on('restore', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
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
    }
  });
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
  }
});

// 🖨️ 6. ROCK-SOLID DIRECT PRINT ENGINE (WITH ABSOLUTE OS FOCUS RESTORE)
let lastPrintTimestamp = 0;
let lastPrintedContentHash = "";

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
        // 🛡️ CRITICAL UNFREEZE: Restore native OS keyboard focus back to Main Window immediately
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.focus();
        }
      }
    });
  });
});

async function executeSinglePrintTask({ printerName, htmlContent }) {
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

      const nowMs = Date.now();
      const contentHash = computeStringHash(htmlContent);
      if (contentHash === lastPrintedContentHash && (nowMs - lastPrintTimestamp) < 1000) {
        clearTimeout(timeoutTimer);
        return resolve({ success: true, duplicateIgnored: true });
      }
      lastPrintTimestamp = nowMs;
      lastPrintedContentHash = contentHash;
      
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
      
      const pWin = initPrintWorkerWindow();
      
      const fullPrintHtml = `
        <!DOCTYPE html>
        <html lang="si">
        <head>
          <meta charset="UTF-8">
          <style>
            @page { 
              margin: 0 !important; 
              size: 80mm auto !important; 
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              margin: 0;
              padding: 0;
            }
            html, body {
              width: 68mm !important;
              max-width: 68mm !important;
              margin: 0 !important;
              padding: 1mm 1mm 3mm 1mm !important;
              font-family: 'Courier New', Courier, monospace, sans-serif !important;
              font-size: 11px !important;
              line-height: 1.35 !important;
              color: #000 !important;
              background: #fff !important;
              text-align: left !important;
              visibility: visible !important;
              overflow: visible !important;
              page-break-inside: avoid !important;
              page-break-after: avoid !important;
            }
            div, p, span, h2, h3, h4, table, tr, td {
              visibility: visible !important;
              color: #000 !important;
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
            .border-b { border-bottom: 1px dashed #000 !important; padding-bottom: 3px !important; margin-bottom: 3px !important; }
            .border-b-2 { border-bottom: 2px dashed #000 !important; padding-bottom: 4px !important; margin-bottom: 4px !important; }
            .border-t { border-top: 1px dashed #000 !important; padding-top: 3px !important; margin-top: 3px !important; }
            .truncate { 
              overflow: hidden !important; 
              text-overflow: ellipsis !important; 
              white-space: nowrap !important; 
              max-width: 40mm !important; 
            }
            .w-12 { width: 12mm !important; }
            .w-32 { width: 30mm !important; }
            .w-36 { width: 34mm !important; }
            .w-44 { width: 40mm !important; }
            .w-1\\/2, .w-1-2 { width: 48% !important; display: inline-block !important; }
            .w-1\\/4, .w-1-4 { width: 26% !important; display: inline-block !important; text-align: right !important; }
            .w-3\\/4, .w-3-4 { width: 72% !important; display: inline-block !important; }
          </style>
        </head>
        <body>
          <div style="width: 68mm; max-width: 68mm; margin: 0; text-align: left;">
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
