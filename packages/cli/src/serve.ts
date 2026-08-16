import { createServer, type Server } from 'node:http'
import { readFileSync, statSync, existsSync, watch } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { buildSite } from './build'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

/** 简单静态文件服务（防止路径穿越） */
function serveStatic(outDir: string) {
  return (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/__reload') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write('retry: 1500\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/') rel = '/index.html'
    const abs = normalize(join(outDir, rel))
    if (!abs.startsWith(normalize(outDir))) {
      res.writeHead(403).end('Forbidden')
      return
    }
    if (!existsSync(abs) || statSync(abs).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream' })
    res.end(readFileSync(abs))
  }
}

const clients = new Set<import('node:http').ServerResponse>()

function notifyReload(): void {
  for (const res of clients) {
    try {
      res.write('event: reload\ndata: {}\n\n')
    } catch {
      /* 忽略断开的连接 */
    }
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null

/** 监听 src 目录变化，防抖重建并通知浏览器刷新 */
function watchAndRebuild(bookDir: string, outDir: string, onStatus: (msg: string) => void): void {
  const rebuild = () => {
    try {
      buildSite(bookDir, outDir, onStatus)
      notifyReload()
    } catch (err) {
      onStatus(`重建失败：${String((err as Error)?.message ?? err)}`)
    }
  }
  const schedule = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(rebuild, 300)
  }
  const watchers: ReturnType<typeof watch>[] = []
  const watchRecursive = (dir: string) => {
    if (!existsSync(dir)) return
    try {
      const w = watch(dir, { recursive: true }, () => schedule())
      w.on('error', () => undefined)
      watchers.push(w)
    } catch {
      // 递归监听不支持（部分平台）→ 逐层监听
      for (const name of ['SUMMARY.md']) {
        const p = join(dir, name)
        if (existsSync(p)) {
          const w = watch(p, () => schedule())
          watchers.push(w)
        }
      }
    }
  }
  watchRecursive(join(bookDir, 'src'))
  process.on('SIGINT', () => {
    for (const w of watchers) w.close()
    process.exit(0)
  })
}

/** 构建并启动本地服务（mdbook serve 风格：自动重建 + 浏览器热重载） */
export async function serve(bookDir: string, port: number, outDir: string): Promise<Server> {
  buildSite(bookDir, outDir, (m) => console.log('[build]', m))
  const server = createServer(serveStatic(outDir))
  server.listen(port, () => {
    console.log(`\nBookTool serve\n  http://localhost:${port}\n  监听 ${bookDir}，修改后自动重建并刷新（Ctrl+C 退出）\n`)
  })
  watchAndRebuild(bookDir, outDir, (m) => console.log('[build]', m))
  return server
}
