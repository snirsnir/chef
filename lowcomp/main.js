const { app, BrowserWindow, ipcMain } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

let win;

function createWindow() {
  win = new BrowserWindow({
    frame: false,
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.show();
  win.setFullScreen(true);
  win.loadFile('index.html');

  // DevTools stays closed on launch. The window is frameless so there is no
  // menu bar to reach it from — bind F12 directly instead.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.on('enter-full-screen', () => win.webContents.send('win-state', true));
  win.on('leave-full-screen',  () => win.webContents.send('win-state', false));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('navigate', (event, file, queryObj) => {
  if (queryObj && Object.keys(queryObj).length) {
    win.loadFile(file, { query: queryObj });
  } else {
    win.loadFile(file);
  }
});

ipcMain.on('window-minimize', () => win.minimize());
ipcMain.on('window-maximize', () => {
  win.setFullScreen(!win.isFullScreen());
});
ipcMain.on('window-close', () => win.close());

// ── Updater ────────────────────────────────────────────────────────────────

ipcMain.handle('read-version', async () => {
  try {
    const data = await fs.promises.readFile(path.join(__dirname, 'version.json'), 'utf8');
    return JSON.parse(data);
  } catch { return null; }
});

function fetchBuf(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Chef-Updater/1.0' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode))
        return fetchBuf(res.headers.location, hops + 1).then(resolve).catch(reject);
      if (res.statusCode !== 200)
        return reject(new Error(`HTTP ${res.statusCode} — ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

ipcMain.on('start-update', async (event, files, latestSha) => {
  let done = 0;
  try {
    for (const file of files) {
      const url  = `https://raw.githubusercontent.com/snirsnir/chef/main/${file.path}`;
      const dest = path.join(__dirname, ...file.path.split('/'));
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      const buf = await fetchBuf(url);
      await fs.promises.writeFile(dest, buf);
      done++;
      win.webContents.send('update-progress', (done / files.length) * 100, file.path);
    }
    await fs.promises.writeFile(
      path.join(__dirname, 'version.json'),
      JSON.stringify({ commit: latestSha, lastUpdate: new Date().toISOString() }, null, 2)
    );
    win.webContents.send('update-done', true);
  } catch (e) {
    win.webContents.send('update-done', false, e.message);
  }
});

ipcMain.on('restart-app', () => { app.relaunch(); app.exit(); });
