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

// 🖨️ HIGH-SPEED 80MM DEDICATED THERMAL RECEIPT PRINT ENGINE
ipcMain.handle('print-silent', async (event, { printerName, htmlContent }) => {
  return new Promise(async (resolve) => {
    try {
      if (!mainWindow) return resolve({ success: false, error: "Main window not found" });

      const printers = await mainWindow.webContents.getPrintersAsync();
      let targetDevice = printerName;
      
      // Default printer එකක් නොදුන් විට පද්ධතියේ default printer එක තෝරාගනී
      if (!targetDevice) {
        const def = printers.find(p => p.isDefault);
        targetDevice = def ? def.name : (printers.length > 0 ? printers[0].name : "");
      }

      // පසුබිමෙන් පමණක් ධාවනය වන කුඩා 80mm Print Buffer Window එකක් සෑදීම
      const printWin = new BrowserWindow({
        width: 320,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const fullPrintHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page { margin: 0; size: 80mm auto; }
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
            .flex { display: flex; justify-content: space-between; }
            .border-b { border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; }
            .cut-spacer { height: 20mm; display: block; }
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
            printWin.close();
            resolve({ success: true });
          } catch (printErr) {
            printWin.close();
            resolve({ success: false, error: printErr.message });
          }
        }, 200);
      });
    } catch (err) {
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
