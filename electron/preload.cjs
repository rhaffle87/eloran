/**
 * SIMULORAN Desktop — Secure Context-Isolated Preload Bridge (preload.cjs)
 *
 * Exposes safe, validated IPC APIs to the renderer process without granting
 * arbitrary Node.js filesystem access or compromising web security.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('simuloranDesktop', {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  readFileContent: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFileContent: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  onMenuTrigger: (channel, callback) => {
    const validChannels = ['menu:open-mission-pack', 'menu:export-mission-pack', 'menu:open-sdr'];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
});
