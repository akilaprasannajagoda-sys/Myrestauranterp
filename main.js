const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let customerWindow = null;
let printWorkerWindow = null;

// 🛡️ 1. GLOBAL CRASH-PROOF EXCEPTION HANDLERS (ඇප් එක කිසිවිටෙකත් Crash වී වැසෙන්නේ නැත)
process.on('uncaughtException', (error) => {
  console.error("CRITICAL: Unhandled System Exception caught:", error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("CRITICAL: Unhandled Promise Rejection at:", promise, "reason:", reason);
});

// 🔒 2. SINGLE INSTANCE LOCK (ඇප් එක එකවර දෙපාරක් Open වීම වළක්වයි)
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
    // දෙවන තිරයක් තිබේ නම් Customer Display එක ස්වයංක්‍රීයව ආරම්භ කිරීම
    setTimeout(() => {
      createOrUpdateCustomerDisplay();
    }, 1500);
  });
}

// 🖨️ 3. REUSABLE HIGH-PERFORMANCE PRINT WORKER WINDOW (ELIMINATES MEMORY LEAKS)
function initPrintWorkerWindow() {
  if (!printWorkerWindow || printWorkerWindow.isDestroyed()) {
    printWorkerWindow = new BrowserWindow({
      width: 260,
      height: 600,
      show: false,
      frame: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    });
  }
  return printWorkerWindow;
}

// 🖥️ 4. DUAL SCREEN / CUSTOMER-FACING DISPLAY (CFD) CONTROLLER
function createOrUpdateCustomerDisplay() {
  try {
    const displays = screen.getAllDisplays();
    // ප්‍රධාන Display (x:0, y:0) නොවන දෙවන Screen එක හඳුනාගැනීම
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

// තිරයක් අලුතින් සම්බන්ධ කළ විට හෝ ඉවත් කළ විට ස්වයංක්‍රීයව හඳුනාගැනීම
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
    autoHideMenuBar: true, // Clean POS Screen (Menu bar සැඟවීම)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: false // Production එකේදී DevTools අවහිර කිරීම
    }
  });
  
  mainWindow.maximize(); // ඇප් එක Open වන විටම Fullscreen මැක්සිමයිස් වේ
  mainWindow.loadFile('index.html');
  
  // 🔒 DEVTOOLS & ACCIDENTAL RELOAD BLOCK (F12 සහ Ctrl+R අවහිර කිරීම)
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });
  
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F12, Ctrl+Shift+I (Inspect) සහ F5, Ctrl+R (Accidental Reload) අවහිර කිරීම
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
  
  // 🔄 App එක Open වූ විට පසුබිමෙන් Updates පරීක්ෂා කිරීම (Safe Packaged Check)
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

// 🔔 Auto-Updater Download Event (Cashier ගෙන් විමසීම)
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

// 💾 5. LOCAL AUTOMATIC HARD-DISK BACKUP ENGINE (Documents/RestaurantERP_Backups)
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

// 🖨️ 6. XPRINTER & 80MM DIRECT HARDWARE PRINT ENGINE (WITH REUSABLE WORKER & TIMEOUT GUARD)
let lastPrintTimestamp = 0;
let lastPrintedContentHash = "";

ipcMain.handle('print-silent', async (event, { printerName, htmlContent }) => {
  return new Promise(async (resolve) => {
    let isFinished = false;

    // තත්පර 6ක ආරක්ෂිත Timeout එක (Printer කේබල් ගැලවුණහොත් හෝ Spooler හිර වුවහොත් UI Release කරයි)
    const timeoutTimer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        resolve({ success: false, error: "Printer Connection Timed Out (කරුණාකර Printer කේබලය හෝ Power පරීක්ෂා කරන්න)." });
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

      // තත්පර 1.2ක් ඇතුළත එකම Print Job එක දෙපාරක් වැටීමෙන් හිස් කඩදාසි කැපීම වළක්වයි (Anti-Duplicate Guard)
      const nowMs = Date.now();
      const simpleHash = htmlContent.substring(0, 80);
      if (simpleHash === lastPrintedContentHash && (nowMs - lastPrintTimestamp) < 1200) {
        clearTimeout(timeoutTimer);
        return resolve({ success: true, duplicateIgnored: true });
      }
      lastPrintTimestamp = nowMs;
      lastPrintedContentHash = simpleHash;
      
      const printers = await mainWindow.webContents.getPrintersAsync();
      let targetDevice = "";
      
      // 1. පරිගණකයේ ඇති Printers අතරින් නම ගැළපෙන Printer එක සෙවීම
      if (printerName && printerName.trim()) {
        const cleanReqName = printerName.trim().toLowerCase();
        const matched = printers.find(p => p.name.toLowerCase() === cleanReqName || p.name.toLowerCase().includes(cleanReqName));
        if (matched) {
          targetDevice = matched.name;
        }
      }
      
      // 2. Default Printer එක තෝරාගැනීම
      if (!targetDevice) {
        const def = printers.find(p => p.isDefault);
        targetDevice = def ? def.name : (printers.length > 0 ? printers[0].name : "");
      }
      
      if (!targetDevice) {
        clearTimeout(timeoutTimer);
        return resolve({ success: false, error: "පරිගණකයට කිසිදු Printer එකක් සම්බන්ධ කර නොමැත." });
      }
      
      // 3. Reusable Print Window එක භාවිත කිරීම (Continuous Memory Leak Protection)
      const pWin = initPrintWorkerWindow();
      
      // දකුණු පසින් අකුරු කැපීම 100% වළක්වා (Safe 68mm Zone) තනි පිටුවක් ලෙස මුද්‍රණය කරන HTML සැකිල්ල
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
      
      pWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullPrintHtml)}`);
      
      pWin.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            await pWin.webContents.print({
              silent: true,
              printBackground: true,
              deviceName: targetDevice,
              margins: { marginType: 'none' }
            });
            
            if (!isFinished) {
              isFinished = true;
              clearTimeout(timeoutTimer);
              resolve({ success: true, usedPrinter: targetDevice });
            }
          } catch (printErr) {
            if (!isFinished) {
              isFinished = true;
              clearTimeout(timeoutTimer);
              resolve({ success: false, error: printErr.message });
            }
          }
        }, 150);
      });
    } catch (err) {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutTimer);
        resolve({ success: false, error: err.message });
      }
    }
  });
});

// Windows පරිගණකයේ Printers ලැයිස්තුව ලබාගැනීම
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

// 📲 7. DIRECT WHATSAPP DESKTOP NATIVE PROTOCOL ENGINE
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

// 🖥️ 8. CUSTOMER-FACING DISPLAY (CFD) IPC HANDLERS
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

// POS Cart සහ Total දත්ත දෙවන තිරයට සජීවීව යැවීම
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
