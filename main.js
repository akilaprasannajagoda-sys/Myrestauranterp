const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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

// 🌐 BROWSER & WHATSAPP EXTERNAL URL OPENER (NO ELECTRON CRASH)
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL format' };
  } catch (err) {
    console.error('[Open External Error]:', err);
    return { success: false, error: err.message };
  }
});

// 🖨️ HIGH-SPEED 80MM DEDICATED THERMAL RECEIPT PRINT ENGINE (HIGH DENSITY CRISP BLACK)
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
            @page { 
              margin: 0 !important; 
              size: 80mm auto !important; 
            }
            * { 
              box-sizing: border-box !important; 
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body {
              margin: 0 !important;
              padding: 1mm 1mm 2mm 1mm !important;
              width: 72mm !important;
              font-family: Consolas, 'Lucida Console', 'Segoe UI', Arial, sans-serif !important;
              font-size: 12.5px !important;
              font-weight: 700 !important;
              line-height: 1.25 !important;
              color: #000000 !important;
              background: #ffffff !important;
              text-rendering: geometricPrecision !important;
              -webkit-font-smoothing: antialiased !important;
            }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .font-bold { font-weight: 900 !important; }
            .font-black { font-weight: 900 !important; }
            .uppercase { text-transform: uppercase !important; }
            .flex { display: flex !important; justify-content: space-between !important; align-items: center !important; }
            .w-1\\/2 { width: 50% !important; }
            .w-1\\/4 { width: 25% !important; }
            .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
            .border-b { border-bottom: 1px dashed #000000 !important; padding-bottom: 2px !important; margin-bottom: 2px !important; }
            .border-b-2 { border-bottom: 2px dashed #000000 !important; padding-bottom: 2px !important; margin-bottom: 2px !important; }
            /* Safe minimal cut clearance (just clears tear bar without wasting paper) */
            .cut-spacer { height: 4mm !important; display: block !important; }
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
