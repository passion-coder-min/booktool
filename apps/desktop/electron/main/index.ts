import { app, BrowserWindow, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpc } from './ipc'
import { setupMenu, setupScreenshotHook } from './menu'

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'BookTool',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // 调试：BOOKTOOL_UI_STATE 指定初始界面（如 book-workspace / work / calendar / stats）
    const uiState = process.env.BOOKTOOL_UI_STATE
    void win.loadFile(join(__dirname, '../renderer/index.html'), uiState ? { hash: uiState } : undefined)
  }
  return win
}

// 自定义协议：渲染进程经 booktool-file://<encodeURIComponent(绝对路径)> 读取本地文件
// （预览图片、PDF 加载），避免 file:// 的跨源限制。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'booktool-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

app.whenReady().then(() => {
  protocol.handle('booktool-file', (request) => {
    const raw = request.url.slice('booktool-file://'.length)
    let filePath: string
    try {
      filePath = decodeURIComponent(raw)
    } catch {
      return new Response('bad path', { status: 400 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  registerIpc()
  setupMenu()
  const win = createWindow()
  setupScreenshotHook(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

