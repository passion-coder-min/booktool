import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, relative, basename, extname, sep } from 'node:path'
import { createRequire } from 'node:module'
import { parseSummary, flattenChapters, type SummaryItem } from '@booktool/shared'
import { renderMarkdown, type TocHeading } from './html'

const require = createRequire(import.meta.url)

export interface BookInfo {
  dir: string
  title: string
  authors: string[]
  srcDir: string
  summary: SummaryItem[]
  chapters: { path: string; title: string }[]
}

/** 加载书籍：book.toml（src 目录可缺省，mdBook 默认 src/）+ SUMMARY.md */
export function loadBook(bookDir: string): BookInfo {
  const tomlPath = join(bookDir, 'book.toml')
  let srcDir = 'src'
  let title = basename(bookDir)
  let authors: string[] = []
  if (existsSync(tomlPath)) {
    const raw = readFileSync(tomlPath, 'utf8')
    const src = raw.match(/^\s*src\s*=\s*"([^"]+)"/m)
    if (src) srcDir = src[1].replace(/[\\/]+$/, '')
    const t = raw.match(/^\s*title\s*=\s*"([^"]*)"/m)
    if (t) title = t[1]
    const au = raw.match(/^\s*authors\s*=\s*\[([^\]]*)\]/m)
    if (au) authors = [...au[1].matchAll(/"([^"]*)"/g)].map((m) => m[1])
  }
  const summaryPath = join(bookDir, srcDir, 'SUMMARY.md')
  const summary: SummaryItem[] = existsSync(summaryPath)
    ? parseSummary(readFileSync(summaryPath, 'utf8'))
    : []
  return { dir: bookDir, title, authors, srcDir, summary, chapters: flattenChapters(summary) }
}

/** 站点静态资源（KaTeX / highlight / mermaid / 站点样式与脚本），复制到 out/assets */
function copySiteAssets(outDir: string): void {
  const dest = join(outDir, 'assets')
  mkdirSync(dest, { recursive: true })

  // KaTeX（CSS + 字体）
  const katexDir = dirname(require.resolve('katex/package.json'))
  cpSync(join(katexDir, 'dist', 'katex.min.css'), join(dest, 'katex.min.css'))
  cpSync(join(katexDir, 'dist', 'fonts'), join(dest, 'fonts'), { recursive: true })

  // highlight.js 主题
  const hljsDir = dirname(require.resolve('highlight.js/package.json'))
  cpSync(join(hljsDir, 'styles', 'github.css'), join(dest, 'github.css'))

  // mermaid（前端渲染）
  const mermaidDir = dirname(require.resolve('mermaid/package.json'))
  cpSync(join(mermaidDir, 'dist', 'mermaid.min.js'), join(dest, 'mermaid.min.js'))

  // 站点样式与脚本（内嵌）
  writeFileSync(join(dest, 'style.css'), SITE_CSS)
  writeFileSync(join(dest, 'app.js'), SITE_JS)
}

const SITE_CSS = `:root { --accent:#3d8bfd; --bg:#f6f7f9; --panel:#fff; --text:#1f2328; --muted:#6a737d; --border:#e2e6ec; }
* { box-sizing: border-box; }
body { margin:0; font-family: -apple-system, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--text); }
.layout { display: flex; min-height: 100vh; }
.sidebar { width: 280px; flex-shrink: 0; background:#fff; border-right:1px solid var(--border); padding: 12px; overflow-y: auto; position: sticky; top:0; height:100vh; }
.brand { font-weight:700; font-size:15px; padding: 4px 8px 12px; color: var(--accent); }
.sidebar nav { display:flex; flex-direction:column; gap:2px; }
.sidebar a { color: var(--text); text-decoration:none; font-size:13px; padding:4px 8px; border-radius:6px; }
.sidebar a:hover { background: var(--bg); }
.sidebar a.active { background:#e8f1ff; color: var(--accent); font-weight:600; }
.nav-part { font-size:12px; color:var(--muted); font-weight:600; padding: 8px 8px 2px; }
.nav-sub { margin-left: 12px; display:flex; flex-direction:column; gap:2px; }
.nav-sep { border-top:1px dashed var(--border); margin:6px 4px; }
.content { flex:1; min-width:0; padding: 24px 32px 64px; max-width: 900px; margin: 0 auto; }
.toc { border: 1px solid var(--border); border-radius: 8px; background: #fafbfc; padding: 10px 14px; margin: 6px 0 20px; }
.toc-title { font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 6px; }
.toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.toc a { color: var(--text); text-decoration: none; font-size: 13px; display: block; padding: 2px 6px; border-radius: 4px; }
.toc a:hover { background: #eef4ff; color: var(--accent); }
.toc .toc-l1 { padding-left: 14px; }
.markdown-body { line-height: 1.7; font-size: 15px; }
.markdown-body img { max-width: 100%; }
.markdown-body pre { background: #f6f8fa; padding: 12px; border-radius: 8px; overflow-x: auto; }
.markdown-body code { font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace; font-size: 0.9em; }
.markdown-body table { border-collapse: collapse; width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 6px 10px; }
.markdown-body blockquote { margin:0; border-left: 3px solid var(--border); padding-left: 12px; color: var(--muted); }
.admonition { border: 1px solid var(--border); border-radius: 8px; padding: 4px 14px 10px; margin: 12px 0; background: #f6f8fa; }
.admonition-title { font-weight: 600; margin-bottom: 4px; }
.admonition-note .admonition-title { color: #3d8bfd; }
.admonition-tip .admonition-title { color: #2e9e5b; }
.admonition-warning .admonition-title { color: #d99020; }
.admonition-danger .admonition-title { color: #d94a4a; }
.page-nav { display: flex; justify-content: space-between; margin-top: 32px; gap: 12px; }
.page-btn { padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--text); font-size: 13px; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-btn:hover { border-color: var(--accent); color: var(--accent); }
@media (max-width: 760px) { .sidebar { display:none; } }
`

const SITE_JS = `// mermaid 由 startOnLoad 自动渲染；站点无需额外脚本
`

/** 生成导航 HTML（SUMMARY 树，当前章节高亮） */
function navHtml(summary: SummaryItem[], current: string, rootPrefix: string): string {
  const renderNode = (item: SummaryItem): string => {
    if (item.type === 'separator') return '<div class="nav-sep"></div>'
    if (item.type === 'part') {
      return `<div class="nav-part">${escapeHtml(item.title)}</div>` + item.children.map(renderNode).join('')
    }
    if (item.type === 'chapter' && item.path) {
      const href = `${rootPrefix}${pathToHtml(item.path)}`
      const active = item.path === current ? ' class="active"' : ''
      const children = item.children.length ? `<div class="nav-sub">${item.children.map(renderNode).join('')}</div>` : ''
      return `<a href="${href}"${active}>${escapeHtml(item.title)}</a>${children}`
    }
    return ''
  }
  return summary.map(renderNode).join('')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 生成章节目录（子标题 h2/h3 锚点引导）；无子标题返回空 */
function tocHtml(headings: TocHeading[]): string {
  const subs = headings.filter((h) => h.level >= 2 && h.level <= 3)
  if (subs.length === 0) return ''
  const items = subs
    .map((h) => `<li class="toc-l${h.level - 2}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
    .join('')
  return `<nav class="toc"><div class="toc-title">📑 本节目录</div><ul>${items}</ul></nav>`
}

/** 注入章节目录：有 [TOC] 标记则替换占位，否则自动插到首个 h1 之后 */
function injectToc(html: string, headings: TocHeading[]): string {
  const toc = tocHtml(headings)
  if (!toc) return html
  if (html.includes('data-toc')) {
    return html.replace(/<nav[^>]*data-toc[^>]*>\s*<\/nav>/, toc)
  }
  const m = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)
  if (m && m.index !== undefined) {
    return html.slice(0, m.index + m[0].length) + toc + html.slice(m.index + m[0].length)
  }
  return toc + html
}

/** 章节 markdown 路径 → 输出 html 相对路径（保持目录结构） */
function pathToHtml(p: string): string {
  return p.replace(/\.md$/i, '') + '.html'
}

function layoutHtml(opts: { title: string; nav: string; body: string; rootPrefix: string; prev: { href: string; title: string } | null; next: { href: string; title: string } | null }): string {
  const { title, nav, body, rootPrefix, prev, next } = opts
  const prevBtn = prev ? `<a class="page-btn" href="${prev.href}">‹ ${escapeHtml(prev.title)}</a>` : '<span></span>'
  const nextBtn = next ? `<a class="page-btn" href="${next.href}">${escapeHtml(next.title)} ›</a>` : '<span></span>'
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${rootPrefix}assets/katex.min.css">
<link rel="stylesheet" href="${rootPrefix}assets/github.css">
<link rel="stylesheet" href="${rootPrefix}assets/style.css">
</head>
<body>
<div class="layout">
  <aside class="sidebar"><div class="brand">${escapeHtml(title)}</div><nav>${nav}</nav></aside>
  <main class="content">
    <article class="markdown-body">${body}</article>
    <div class="page-nav">${prevBtn}${nextBtn}</div>
  </main>
</div>
<script src="${rootPrefix}assets/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, theme: 'neutral' });</script>
</body>
</html>`
}

/** 构建静态站点：src 的非 .md 文件复制（图片等保持相对路径）、章节转 HTML、生成导航 */
export function buildSite(bookDir: string, outDir: string, onStatus?: (msg: string) => void): { pages: number; outDir: string } {
  const book = loadBook(bookDir)
  const srcAbs = join(bookDir, book.srcDir)
  if (!existsSync(srcAbs)) throw new Error(`未找到章节目录：${srcAbs}（book.toml 的 src）`)

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  // 站点资源 + 复制 src 中非 .md 文件（图片/资源原样保留，相对路径天然可用）
  copySiteAssets(outDir)
  copyTreeNonMd(srcAbs, outDir, onStatus)

  const rootPrefix = './'
  const pages: { href: string; title: string }[] = []
  for (const ch of book.chapters) {
    const srcFile = join(srcAbs, ch.path)
    if (!existsSync(srcFile)) continue // 缺失章节跳过
    const md = readFileSync(srcFile, 'utf8')
    const { html, headings } = renderMarkdown(md)
    const body = injectToc(html, headings)
    const rel = pathToHtml(ch.path)
    pages.push({ href: rel, title: ch.title })
    const outFile = join(outDir, rel)
    mkdirSync(dirname(outFile), { recursive: true })
    const idx = pages.length - 1
    const prev = idx > 0 ? pages[idx - 1] : null
    const nav = navHtml(book.summary, ch.path, rootPrefix)
    writeFileSync(
      outFile,
      layoutHtml({
        title: ch.title,
        nav,
        body,
        rootPrefix,
        prev,
        next: idx + 1 < book.chapters.length ? pages[idx + 1] : null,
      }),
    )
    onStatus?.(`渲染 ${ch.path} …`)
  }

  // 首页：重定向到第一章
  const first = pages[0]
  writeFileSync(
    join(outDir, 'index.html'),
    first ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${first.href}"></head><body><a href="${first.href}">进入《${escapeHtml(book.title)}》</a></body></html>` : '',
  )
  onStatus?.(`完成：${pages.length} 页 → ${outDir}`)
  return { pages: pages.length, outDir }
}

/** 递归复制 src 树，跳过 .md（转为 .html 由渲染逻辑处理） */
function copyTreeNonMd(srcAbs: string, outDir: string, onStatus?: (msg: string) => void): void {
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const src = join(dir, name)
      const rel = relative(srcAbs, src).split(sep).join('/')
      if (statSync(src).isDirectory()) {
        if (name === 'SUMMARY.md') continue
        walk(src)
        continue
      }
      if (name.toLowerCase().endsWith('.md')) continue
      const dest = join(outDir, rel)
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(src, dest)
    }
  }
  walk(srcAbs)
  void onStatus
}
