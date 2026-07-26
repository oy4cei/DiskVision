const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');

function getDiskSpace(volumePath) {
  return new Promise((resolve) => {
    // Avoid shell injection: filter out dangerous characters
    const safePath = volumePath ? volumePath.replace(/(["\s'$`\\])/g, '\\$1') : '/';
    exec(`df -k "${safePath}"`, (err, stdout) => {
      if (err) {
        exec('df -k /', (errRoot, stdoutRoot) => {
          if (errRoot) return resolve({ total: 500 * 1e9, free: 250 * 1e9, used: 250 * 1e9 });
          resolve(parseDfOutput(stdoutRoot));
        });
      } else {
        resolve(parseDfOutput(stdout));
      }
    });
  });
}

function parseDfOutput(stdout) {
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) {
    return { total: 500 * 1e9, free: 250 * 1e9, used: 250 * 1e9 };
  }
  const parts = lines[1].split(/\s+/);
  if (parts.length < 4) {
    return { total: 500 * 1e9, free: 250 * 1e9, used: 250 * 1e9 };
  }
  const totalKiB = parseInt(parts[1], 10);
  const usedKiB = parseInt(parts[2], 10);
  const freeKiB = parseInt(parts[3], 10);
  return {
    total: totalKiB * 1024,
    used: usedKiB * 1024,
    free: freeKiB * 1024
  };
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

// IPC Handlers
ipcMain.on('open-in-finder', (event, itemPath) => {
  if (itemPath) {
    // If the path contains skipped files text or similar, ignore
    if (itemPath.includes('_skipped_files')) return;
    
    // electron shell API to reveal item in Finder
    shell.showItemInFolder(itemPath);
  }
});

ipcMain.handle('get-disk-space', async (event, volumePath) => {
  return await getDiskSpace(volumePath);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
