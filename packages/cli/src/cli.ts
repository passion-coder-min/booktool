/**
 * BookTool CLI：mdbook 风格的书籍操作——初始化 / 构建静态站点 / 本地服务查看。
 *
 * 用法：
 *   booktool init [目录]                创建新书（book.toml + src/SUMMARY.md + 首页）
 *   booktool build <目录> [-o 输出]      构建静态 HTML 站点（浏览器可看）
 *   booktool serve <目录> [-p 端口]      构建并本地服务，改动自动重建 + 浏览器热重载
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildSite } from './build'
import { serve } from './serve'

function help(): void {
  console.log(`BookTool CLI — 书籍构建与网页查看（mdbook 风格）

用法:
  booktool init [目录]               创建新书骨架（默认当前目录）
  booktool build <目录> [-o 输出]     构建静态 HTML 站点
  booktool serve <目录> [-p 端口]     构建并本地服务（自动重建 + 热重载）

示例:
  booktool init mybook
  booktool build mybook -o mybook-site
  booktool serve mybook -p 3000       → http://localhost:3000
`)
}

function parseArgs(argv: string[]): { cmd: string; bookDir: string; out: string; port: number } {
  const cmd = argv[0] ?? ''
  let bookDir = ''
  let out = ''
  let port = 3000
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-o' || a === '--out') out = argv[++i] ?? ''
    else if (a === '-p' || a === '--port') port = Number(argv[++i] ?? 3000)
    else if (a === '-h' || a === '--help') { help(); process.exit(0) }
    else bookDir = a
  }
  return { cmd, bookDir, out, port }
}

function initBook(dir: string): void {
  mkdirSync(join(dir, 'src'), { recursive: true })
  const name = dir.split(/[\\/]/).pop() || 'book'
  writeFileSync(join(dir, 'book.toml'), `[book]\ntitle = "${name}"\nauthors = []\n`)
  writeFileSync(join(dir, 'src', 'SUMMARY.md'), `# Summary\n\n- [前言](preface.md)\n`)
  writeFileSync(join(dir, 'src', 'preface.md'), `# 前言\n\n开始写作…\n`)
  console.log(`已初始化书籍：${dir}\n编辑 src/ 下的 Markdown，然后 booktool serve ${dir} 在浏览器查看`)
}

async function main(): Promise<void> {
  const { cmd, bookDir, out, port } = parseArgs(process.argv.slice(2))

  if (cmd === 'init') {
    const dir = resolve(bookDir || '.')
    if (existsSync(join(dir, 'book.toml'))) throw new Error(`已存在书籍：${dir}`)
    initBook(dir)
    return
  }

  if (cmd === 'build' || cmd === 'serve') {
    if (!bookDir) throw new Error('缺少书籍目录参数，用法见：booktool --help')
    const dir = resolve(bookDir)
    if (!existsSync(join(dir, 'book.toml')) && !existsSync(join(dir, 'src', 'SUMMARY.md'))) {
      throw new Error(`不是有效的书籍目录（缺少 book.toml 或 src/SUMMARY.md）：${dir}`)
    }
    const outDir = resolve(out || join(dir, 'site'))
    if (cmd === 'build') {
      const r = buildSite(dir, outDir, (m) => console.log(m))
      console.log(`\n构建完成：${r.pages} 页 → ${outDir}\n打开 ${join(outDir, 'index.html')} 或在目录运行静态服务查看`)
      return
    }
    await serve(dir, Number.isFinite(port) ? port : 3000, outDir)
    return
  }

  help()
}

main().catch((err) => {
  console.error('错误：' + String((err as Error)?.message ?? err))
  process.exit(1)
})
