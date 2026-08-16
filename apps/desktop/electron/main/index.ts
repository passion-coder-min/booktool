import { app, BrowserWindow, protocol } from 'electron'
import { join, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { registerIpc } from './ipc'
import { setupMenu, setupScreenshotHook } from './menu'

/** booktool-file 协议按扩展名返回 Content-Type（图片/PDF 预览） */
const FILE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
}

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

// 自定义协议：渲染进程经 booktool-file://local/<绝对路径>（逐段编码）读取本地文件
// （预览图片、PDF 加载），避免 file:// 的跨源限制。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'booktool-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

app.whenReady().then(() => {
  // URL 形如 booktool-file://local/<绝对路径>（host 固定为 local，绝对路径在 pathname 中）。
  // 不能用 net.fetch(file://)——Electron 的 net 模块不支持 file: 协议，会导致 PDF/图片预览空白。
  protocol.handle('booktool-file', async (request) => {
    let filePath: string
    try {
      filePath = decodeURIComponent(new URL(request.url).pathname)
    } catch {
      return new Response('bad path', { status: 400 })
    }
    try {
      const buf = await readFile(filePath)
      const mime = FILE_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(buf, { headers: { 'content-type': mime } })
    } catch {
      return new Response('not found', { status: 404 })
    }
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

