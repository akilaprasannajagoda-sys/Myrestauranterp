const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    title: "Restaurant ERP - SME Enterprise Edition",
    autoHideMenuBar: true, // වින්ඩෝස් Menu bar එක සඟවයි (Clean POS Screen)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  
  mainWindow.maximize(); // ඇප් එක Open වන විටම Fullscreen මැක්සිමයිස් වේ
  mainWindow.loadFile('index.html');
  
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

// 🖨️ HIGH-SPEED 80MM DEDICATED THERMAL RECEIPT PRINT ENGINE (BULLETPROOF HARDWARE SPOOLER)
ipcMain.handle('print-silent', async (event, { printerName, htmlContent }) => {
  return new Promise(async (resolve) => {
    let printWin = null;
    try {
      if (!mainWindow) return resolve({ success: false, error: "Main window not found" });
      
      const osPrinters = await mainWindow.webContents.getPrintersAsync();
      let targetDevice = "";
      
      // 🔍 1. SMART PRINTER NAME MATCHER (Exact / Case-Insensitive / Space-Hyphen Neutral)
      if (printerName && printerName.trim()) {
        const cleanSearch = printerName.toLowerCase().replace(/[\s\-_]/g, '');
        const matched = osPrinters.find(p => p.name.toLowerCase().replace(/[\s\-_]/g, '') === cleanSearch);
        if (matched) {
          targetDevice = matched.name;
        } else {
          // Partial search fallback (e.g. searching 'pos 80' inside 'POS-80 Series')
          const partialMatch = osPrinters.find(p => p.name.toLowerCase().includes("pos") || p.name.toLowerCase().includes("80"));
          if (partialMatch) {
            targetDevice = partialMatch.name;
          }
        }
      }
      
      // If still no exact device found, fallback safely to default Windows printer
      if (!targetDevice) {
        const def = osPrinters.find(p => p.isDefault);
        targetDevice = def ? def.name : (osPrinters.length > 0 ? osPrinters[0].name : "");
      }
      
      if (!targetDevice) {
        return resolve({ success: false, error: "Windows OS තුළ කිසිදු Printer එකක් හමු නොවීය." });
      }
      
      console.log(`[Silent Print Engine] Target Printer: "${targetDevice}"`);
      
      // 🖥️ 2. BACKGROUND PRINT WINDOW WITH NO THROTTLING
      printWin = new BrowserWindow({
        width: 320,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false // Prevents Chromium from freezing print rendering
        }
      });
      
      const fullPrintHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page { margin: 0; size: 80mm auto; }
            * { box-sizing: border-box; }
            body {
              margin: 0 !important;
              padding: 2mm 2mm 15mm 2mm !important;
              width: 72mm !important;
              font-family: 'Courier New', Courier, monospace, sans-serif !important;
              font-size: 12px !important;
              line-height: 1.3 !important;
              color: #000 !important;
              background: #fff !important;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .flex { display: flex; justify-content: space-between; align-items: center; }
            .w-1\\/2 { width: 50%; }
            .w-1\\/4 { width: 25%; }
            .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .border-b { border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; }
            .cut-spacer { height: 18mm; display: block; }
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
        // Wait slightly for DOM layout to compute fully
        setTimeout(async () => {
          try {
            printWin.webContents.print({
              silent: true,
              printBackground: true,
              deviceName: targetDevice,
              margins: { marginType: 'none' }
            }, (success, failureReason) => {
              // 🔒 Safe Spool Delay: Do NOT close immediately! Allow Windows spooler 1.5 seconds to pipe to USB
              setTimeout(() => {
                if (printWin && !printWin.isDestroyed()) {
                  printWin.close();
                  printWin = null;
                }
              }, 1500);
              
              if (success) {
                resolve({ success: true, deviceName: targetDevice });
              } else {
                console.error("[Silent Print Failed]:", failureReason);
                resolve({ success: false, error: failureReason || "Print job failed by OS driver." });
              }
            });
          } catch (printErr) {
            if (printWin && !printWin.isDestroyed()) printWin.close();
            resolve({ success: false, error: printErr.message });
          }
        }, 300);
      });
      
    } catch (err) {
      if (printWin && !printWin.isDestroyed()) printWin.close();
      resolve({ success: false, error: err.message });
    }
  });
});

// Windows පරිගණකයේ Printers ලැයිස්තුව ලබාගැනීම
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

app.whenReady().then(createWindow);

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
