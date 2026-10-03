/**
 * SIMULORAN Desktop — Main Application Container (main.cjs)
 *
 * Provides native desktop window management, standard tactical menu systems,
 * secure context-isolated IPC dialogs, and Web Serial hardware pass-through
 * for air-gapped field trial laptops.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SIMULORAN — High-Fidelity Radionavigation Simulation Suite',
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for Web Serial and preload module resolution
    },
  });

  // Handle Web Serial device selection automatically in field environments
  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });

  // Handle external link clicks securely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load URL
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Setup Application Menu
  setupMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Mission Pack (.simuloran.json)...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:open-mission-pack');
          },
        },
        {
          label: 'Export Current Scenario...',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:export-mission-pack');
          },
        },
        {
          label: 'Load SDR Baseband Capture...',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:open-sdr');
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Loran-C Hyperbolic Simulator',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('window.location.hash = "#/loran-c"');
          },
        },
        {
          label: 'eLoran Modernized Architecture',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('window.location.hash = "#/eloran"');
          },
        },
        {
          label: '100 kHz Oscilloscope & SDR Lab',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('window.location.hash = "#/waveforms"');
          },
        },
        {
          label: 'Radionavigation Theory & Academy',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('window.location.hash = "#/learn"');
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Systems Engineering Whitepaper',
          click: () => {
            const whitepaperPath = path.join(__dirname, '../docs/WHITEPAPER.md');
            shell.openPath(whitepaperPath);
          },
        },
        {
          label: 'Academic Provenance Register (33/33 Sourced)',
          click: () => {
            const provPath = path.join(__dirname, '../docs/PROVENANCE.md');
            shell.openPath(provPath);
          },
        },
        { type: 'separator' },
        {
          label: 'About SIMULORAN',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SIMULORAN',
              message: 'SIMULORAN v1.6.0',
              detail: 'Autonomous Loran-C and Modernized eLoran Radionavigation Simulation Suite.\n\nZero-heuristic groundwave propagation, 100% academic provenance, SDR baseband ingestion, and field-trial mission packaging.\n\nLicense: MIT',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// IPC Dialog Handlers
// ---------------------------------------------------------------------------

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('dialog:openFile', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Open File',
    filters: options.filters || [
      { name: 'All Supported Files', extensions: ['json', 'simuloran.json', 'iq', 'bin', 'dat', 'raw', 'wav'] },
      { name: 'Mission Packs', extensions: ['simuloran.json', 'json'] },
      { name: 'SDR Captures', extensions: ['iq', 'bin', 'dat', 'raw', 'wav'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    buffer: content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
    text: filePath.endsWith('.json') ? content.toString('utf8') : null,
  };
});

ipcMain.handle('dialog:saveFile', async (_event, options = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || 'Save File',
    defaultPath: options.defaultPath || 'scenario.simuloran.json',
    filters: options.filters || [{ name: 'SIMULORAN Scenario', extensions: ['simuloran.json', 'json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  if (options.data) {
    fs.writeFileSync(result.filePath, options.data);
  }
  return result.filePath;
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
});

ipcMain.handle('fs:writeFile', async (_event, filePath, data) => {
  fs.writeFileSync(filePath, data);
  return true;
});

// App Lifecycle
app.whenReady().then(() => {
  // Configure Web Serial permissions
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'serial') return true;
    return true;
  });
  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') return true;
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
