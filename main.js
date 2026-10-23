const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow = null;

// 🔒 1. SINGLE INSTANCE LOCK (ඇප් එක එකවර දෙපාරක් Open වීම වළක්වයි)
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
  
  app.whenReady().then(createWindow);
}

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
  
  // 🔒 2. DEVTOOLS & ACCIDENTAL RELOAD BLOCK (F12 සහ Ctrl+R අවහිර කිරීම)
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
  });
  
  // 🔄 App එක Open වූ විට පසුබිමෙන් GitHub Updates පරීක්ෂා කිරීම
  mainWindow.once('ready-to-show', () => {
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.log("Update check error:", err);
    });
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

// 🖨️ HIGH-SPEED 80MM DEDICATED THERMAL RECEIPT PRINT ENGINE (ZERO MEMORY LEAK + AUTO-FALLBACK + NO SPLIT CUTS)
ipcMain.handle('print-silent', async (event, { printerName, htmlContent }) => {
  return new Promise(async (resolve) => {
    let printWin = null;
    try {
      if (!mainWindow) return resolve({ success: false, error: "Main window not found" });
      
      const printers = await mainWindow.webContents.getPrintersAsync();
      let targetDevice = "";
      
      // 1. පරිගණකයේ ඇති Printers අතරින් නම ගැළපෙන Printer එක සෙවීම (Exact / Partial Match)
      if (printerName && printerName.trim()) {
        const cleanReqName = printerName.trim().toLowerCase();
        const matched = printers.find(p => p.name.toLowerCase() === cleanReqName || p.name.toLowerCase().includes(cleanReqName));
        if (matched) {
          targetDevice = matched.name;
        }
      }
      
      // 2. ඔබ දුන් නමින් Printer එකක් නැතිනම්, පරිගණකයේ Default Printer එක හෝ පවතින ප්‍රධාන Printer එක තෝරාගනී
      if (!targetDevice) {
        const def = printers.find(p => p.isDefault);
        targetDevice = def ? def.name : (printers.length > 0 ? printers[0].name : "");
      }
      
      if (!targetDevice) {
        return resolve({ success: false, error: "පරිගණකයට කිසිදු Printer එකක් සම්බන්ධ කර නොමැත." });
      }
      
      // 3. පසුබිමෙන් පමණක් ධාවනය වන Print Buffer Window එකක් සෑදීම
      printWin = new BrowserWindow({
        width: 320,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false // Hidden Window එක Render වීම Freeze වීම වළක්වයි
        }
      });
      
      const fullPrintHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page { 
              margin: 0; 
              size: 80mm 297mm; 
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            html, body {
              margin: 0 !important;
              padding: 2mm 2mm 6mm 2mm !important;
              width: 72mm !important;
              font-family: 'Courier New', Courier, monospace, sans-serif !important;
              font-size: 12px !important;
              line-height: 1.3 !important;
              color: #000 !important;
              background: #fff !important;
              overflow: visible !important;
            }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .font-bold { font-weight: bold !important; }
            .font-mono { font-family: monospace, 'Courier New' !important; }
            .flex { display: flex !important; justify-content: space-between !important; align-items: center !important; }
            .border-b { border-bottom: 1px dashed #000 !important; padding-bottom: 3px !important; margin-bottom: 3px !important; }
            .border-b-2 { border-bottom: 2px dashed #000 !important; padding-bottom: 4px !important; margin-bottom: 4px !important; }
            .border-t { border-top: 1px solid #000 !important; padding-top: 2px !important; }
            .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .w-12 { width: 48px; }
            .w-32 { width: 128px; }
            .w-44 { width: 176px; }
            .w-1-2 { width: 50%; }
            .w-1-4 { width: 25%; }
            .cut-spacer { height: 10mm; display: block; }
          </style>
        </head>
        <body>
          ${htmlContent || '<div>No Content</div>'}
          <div class="cut-spacer"></div>
        </body>
        </html>
      `;
      
      printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullPrintHtml)}`);
      
      printWin.webContents.on('did-finish-load', () => {
        setTimeout(async () => {
          try {
            await printWin.webContents.print({
              silent: true,
              printBackground: true,
              deviceName: targetDevice,
              margins: { marginType: 'none' }
            });
            
            // Windows Spooler එකට Data සම්පූර්ණයෙන්ම යනතුරු තත්පර 1ක් තබා Window එක Destroy කරයි
            setTimeout(() => {
              if (printWin) {
                printWin.destroy();
                printWin = null;
              }
            }, 1000);
            
            resolve({ success: true, usedPrinter: targetDevice });
          } catch (printErr) {
            if (printWin) {
              printWin.destroy();
              printWin = null;
            }
            resolve({ success: false, error: printErr.message });
          }
        }, 400); // 400ms delay ensures DOM is completely styled and rendered
      });
    } catch (err) {
      if (printWin) {
        printWin.destroy();
        printWin = null;
      }
      resolve({ success: false, error: err.message });
    }
  });
});

// Windows පරිගණකයේ Printers ලැයිස්තුව ලබාගැනීම
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
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
