/**
 * IPC Handlers – System Info
 *
 * Channel: system:getInfo
 * Returns: Electron version, OS platform, and app data path.
 */

'use strict'

const { ipcMain, app } = require('electron')
const os = require('os')

function registerSystemHandlers() {
  /**
   * Returns basic system/runtime information.
   * Used by the renderer to verify IPC is wired up correctly.
   */
  ipcMain.handle('system:getInfo', async () => {
    return {
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: os.platform(),
      arch: os.arch(),
      appDataPath: app.getPath('userData'),
      appVersion: app.getVersion(),
    }
  })
}

module.exports = { registerSystemHandlers }
