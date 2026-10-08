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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  
  mainWindow.maximize();
  mainWindow.loadFile('index.html');
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 🔄 App එක Open වූ විට පසුබිමෙන් GitHub Updates පරීක්ෂා කිරීම
  mainWindow.once('ready-to-show', () => {
    autoUpdater.autoDownload = true; // Background එකේ තනියම Download වීම
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.log("Update check error:", err);
    });
  });
}

// 🔔 Update එකක් Download වී අවසන් වූ විට Cashier ගෙන් විමසීම
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

// 🖨️ DIRECT SILENT PRINTING IPC HANDLER (ELECTRON .EXE MODE)
ipcMain.handle('print-silent', async (event, { printerName, htmlId, rawText }) => {
  try {
    if (!mainWindow) return { success: false, error: "Main window not found" };
    
    const printers = await mainWindow.webContents.getPrintersAsync();
    let targetDevice = printerName;
    
    if (!targetDevice) {
      const def = printers.find(p => p.isDefault);
      targetDevice = def ? def.name : (printers.length > 0 ? printers[0].name : "");
    }
    
    const printOptions = {
      silent: true,
      printBackground: true,
      deviceName: targetDevice,
      margins: {
        marginType: 'none'
      }
    };
    
    await mainWindow.webContents.print(printOptions);
    return { success: true };
  } catch (err) {
    console.error("Direct Silent Print Error:", err);
    return { success: false, error: err.message };
  }
});

// Windows පරිගණකයේ Printers ලබා ගැනීම
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
