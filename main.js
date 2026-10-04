const { app, BrowserWindow, ipcMain } = require('electron');
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
      webSecurity: false // Local ES Modules සහ Offline DB සඳහා සහය
    }
  });
  
  mainWindow.maximize(); // ඇප් එක Open වන විටම Fullscreen මැක්සිමයිස් වේ
  mainWindow.loadFile('index.html');
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 🖨️ DIRECT SILENT PRINTING IPC HANDLER (ELECTRON .EXE MODE)
ipcMain.handle('print-silent', async (event, { printerName, htmlId, rawText }) => {
  try {
    if (!mainWindow) return { success: false, error: "Main window not found" };
    
    // Printers ලැයිස්තුව ලබාගැනීම
    const printers = await mainWindow.webContents.getPrintersAsync();
    let targetDevice = printerName;
    
    // Default printer එකක් නොදුන් විට පද්ධතියේ default printer එක තෝරාගනී
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
    
    // Print ක්‍රියාවලිය Direct සිදු කිරීම
    await mainWindow.webContents.print(printOptions);
    return { success: true };
  } catch (err) {
    console.error("Direct Silent Print Error:", err);
    return { success: false, error: err.message };
  }
});

// වින්ඩෝස් පරිගණකයට සම්බන්ධ සියලුම Printers ලබාගැනීම
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