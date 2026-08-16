import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, readFileSync, openSync, readSync, closeSync, readdirSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, relative, dirname, basename, extname } from 'node:path'
import pLimit from 'p-limit'
import { compileMarkdown, parseMarkdown, renderMainTypst, renderTemplate, collectHeadingLabels, type LineMapping, type MermaidDiagram } from '@booktool/mdtypst'
import type { CompileReport, Diagnostic } from '@booktool/shared'
import { loadBook, readChapter, atomicWrite } from './books'
import { ensureTypst, runTypst } from './typst'

interface ChapterBuild {
  typFile: string
  mdPath: string
  typst: string
  mappings: LineMapping[]
}

/** 编译整本书：md -> typst -> PDF，含 Mermaid 渲染与诊断回映射 */
export async function compileBook(
  bookDir: string,
  onStatus?: (msg: string) => void,
  opts?: { outputName?: string },
): Promise<CompileReport> {
  const t0 = Date.now()
  const outputName = opts?.outputName ?? 'book.pdf'
  const book = loadBook(bookDir)
  const srcAbs = join(bookDir, book.config.srcDir)
  const buildDir = join(bookDir, 'build')
  const chaptersDir = join(buildDir, 'chapters')
  const assetsDir = join(buildDir, 'assets')
  for (const d of [buildDir, chaptersDir, assetsDir]) mkdirSync(d, { recursive: true })

  // 1) 逐章编译 mdast → Typst
  const diagrams = new Map<string, string>()
  // mermaid 哈希 → 首次出现的章节与行号，渲染失败时用于诊断回映射
  const diagramLocals = new Map<string, { file: string; line: number }>()
  const builds: ChapterBuild[] = []
  const warnings: Diagnostic[] = []
  // 远程图片预取（Typst CLI 不支持网络取图）
  const chapterContents = book.chapters.map((ch) => ({
    path: ch.path,
    md: readChapter(bookDir, book.config.srcDir, ch.path),
  }))
  const { map: remoteImages, warnings: remoteWarnings } = await prefetchRemoteImages(
    chapterContents,
    bookDir,
    assetsDir,
    onStatus,
  )
  warnings.push(...remoteWarnings)

  // 全书标题 label 集合：main.typ 合并所有章节为同一文档，跨章节锚点须全局解析
  const globalLabels = new Set<string>()
  for (const ch of chapterContents) {
    for (const l of collectHeadingLabels(ch.md)) globalLabels.add(l)
  }

  chapterContents.forEach((ch, idx) => {
    const mdDirAbs = join(srcAbs, dirname(ch.path))
    const out = compileMarkdown(ch.md, {
      preamble: '#import "../template.typ": *',
      knownLabels: globalLabels,
      resolveImage: (url) => {
        // root 绝对路径（/ 开头）：auto-fit-image 位于 template.typ，
        // 相对路径会以 template.typ 为基准，必须用 --root 绝对路径
        if (url.startsWith('mermaid:')) {
          return `/build/assets/mermaid-${url.slice('mermaid:'.length)}.svg`
        }
        if (/^https?:/i.test(url)) return remoteImages.get(url) ?? url
        // data: URL 图片（旧版粘贴/Vditor 直接插入的 base64）→ 落盘 build/assets，Typst 才能读取
        if (url.startsWith('data:image/')) {
          return saveDataImage(bookDir, url, assetsDir)
        }
        const abs = join(mdDirAbs, url)
        if (!existsSync(abs)) {
          warnings.push({
            severity: 'warning',
            message: `本地图片不存在（已用占位图替代）：${url}`,
            file: ch.path,
            line: 0,
            typFile: '',
            typLine: 0,
          })
          return '/' + writeMissingImagePlaceholder(bookDir, abs, assetsDir)
        }
        return '/' + imageForTypst(bookDir, abs, assetsDir)
      },
    })
    for (const d of out.diagrams) {
      diagrams.set(d.hash, d.code)
      if (!diagramLocals.has(d.hash)) diagramLocals.set(d.hash, { file: ch.path, line: d.line })
    }
    const slug = basename(ch.path, extname(ch.path)).replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'chapter'
    const typFile = `ch-${String(idx).padStart(2, '0')}-${slug}.typ`
    atomicWrite(join(chaptersDir, typFile), out.typst)
    builds.push({ typFile, mdPath: ch.path, typst: out.typst, mappings: out.mappings })
    for (const w of out.warnings) {
      warnings.push({ severity: 'warning', message: w.message, file: ch.path, line: w.line, typFile, typLine: 0 })
    }
  })

  // 2) Mermaid 渲染（内容哈希缓存，3 并发；单图失败不中止全书，写占位图 + 警告）
  let mermaidRendered = 0
  let mermaidCached = 0
  const mermaidFailures: { hash: string; err: string }[] = []
  const limiter = pLimit(3)
  const jobs = [...diagrams.entries()].map(([hash, code]) =>
    limiter(async () => {
      const svg = join(assetsDir, `mermaid-${hash}.svg`)
      if (existsSync(svg)) {
        mermaidCached++
        return
      }
      onStatus?.(`渲染 Mermaid 图 ${hash.slice(0, 6)} …`)
      try {
        await renderMermaid(code, svg)
        mermaidRendered++
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        mermaidFailures.push({ hash, err: msg })
        writeMermaidPlaceholder(svg, hash, msg)
      }
    }),
  )
  await Promise.all(jobs)
  for (const f of mermaidFailures) {
    const loc = diagramLocals.get(f.hash)
    warnings.push({
      severity: 'warning',
      message: `Mermaid 渲染失败（已用占位图替代）：${f.err.slice(0, 200)}`,
      file: loc?.file ?? '',
      line: loc?.line ?? 0,
      typFile: '',
      typLine: 0,
    })
  }

  // 3) template.typ + main.typ（模板样式 + 章节引用）
  writeFileSync(join(buildDir, 'template.typ'), renderTemplate())
  const mainTypst = renderMainTypst({
    title: book.config.title,
    authors: book.config.authors,
    chapters: builds.map((b) => ({ file: `chapters/${b.typFile}` })),
  })
  writeFileSync(join(buildDir, 'main.typ'), mainTypst)

  // 4) Typst 编译
  onStatus?.('Typst 编译 PDF …')
  const typstPath = await ensureTypst(onStatus)
  const outRel = outputName === 'book.pdf' ? 'output/book.pdf' : `build/${outputName}`
  const fontsDir = join(app.getAppPath(), 'resources', 'fonts')
  const args = ['compile', '--root', bookDir]
  if (existsSync(fontsDir)) args.push('--font-path', fontsDir)
  args.push('build/main.typ', outRel)
  mkdirSync(join(bookDir, 'output'), { recursive: true })
  const result = await runTypst(typstPath, args, bookDir)

  const pdfPath = join(bookDir, outRel)
  const diagnostics = [
    ...warnings,
    ...parseTypstDiagnostics(result.stdout + '\n' + result.stderr, builds),
  ].filter((d) => !(d.severity === 'warning' && /unknown font family/i.test(d.message)))
  // 为可回映射到源文件的诊断补充源码行片段与 .typ 上下文，便于面板展示更详细的错误信息
  for (const d of diagnostics) {
    if (!d.file || d.line <= 0) continue
    try {
      const md = readChapter(bookDir, book.config.srcDir, d.file)
      const srcLine = md.split(/\r?\n/)[d.line - 1]
      if (srcLine != null && srcLine.trim() !== '') {
        const header = `--- ${d.file}:${d.line} ---`
        d.detail = d.detail ? `${d.detail}\n\n${header}\n${srcLine}` : `${header}\n${srcLine}`
      }
    } catch {
      /* 非章节文件或读取失败则跳过 */
    }
    // 补充生成的 .typ 文件在错误行附近的片段，方便排查生成器问题
    if (d.typFile && d.typLine > 0) {
      try {
        const typ = readFileSync(join(chaptersDir, d.typFile), 'utf8').split(/\r?\n/)
        const from = Math.max(0, d.typLine - 3)
        const to = Math.min(typ.length, d.typLine + 3)
        const snippet = typ
          .slice(from, to)
          .map((l, i) => `${from + i + 1 === d.typLine ? '>' : ' '} ${from + i + 1}  ${l}`)
          .join('\n')
        d.detail = `${d.detail ?? ''}\n\n--- 生成 ${d.typFile}:${d.typLine} ---\n${snippet}`
      } catch {
        /* 生成文件读取失败则跳过 */
      }
    }
  }
  return {
    ok: result.status === 0 && existsSync(pdfPath),
    pdfPath: existsSync(pdfPath) ? pdfPath : null,
    diagnostics,
    durationMs: Date.now() - t0,
    mermaidRendered,
    mermaidCached,
  }
}

/** Mermaid 渲染失败时写入占位 SVG（红框 + 错误摘要），保证编译可继续且 PDF 中可见失败位置 */
function writeMermaidPlaceholder(svgPath: string, hash: string, err: string): void {
  writePlaceholderImage(svgPath, `Mermaid 渲染失败 (${hash.slice(0, 6)})`, err)
}

/** 占位 SVG（红框 + 标题 + 错误摘要），用于渲染/下载失败的图片 */
function writePlaceholderImage(svgPath: string, title: string, detail: string): void {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const lines = detail.slice(0, 300).split(/\r?\n/).slice(0, 6)
  const texts = lines.map((l, i) => `<text x="16" y="${52 + i * 18}" font-size="13" fill="#7a1f1f">${esc(l)}</text>`).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${64 + lines.length * 18}" viewBox="0 0 640 ${64 + lines.length * 18}">` +
    `<rect x="1" y="1" width="638" height="${62 + lines.length * 18}" fill="#fdf0f0" stroke="#d94a4a" stroke-width="2" rx="6"/>` +
    `<text x="16" y="30" font-size="15" font-weight="bold" fill="#d94a4a">${esc(title)}</text>` +
    `${texts}</svg>`
  try {
    writeFileSync(svgPath, svg)
  } catch {
    /* 占位图写入失败则让 Typst 报缺文件错误 */
  }
}

/**
 * 预取章节中的远程图片（http/https）：Typst CLI 不支持网络取图，
 * 下载到 build/assets 后本地引用；失败写占位 SVG 并给出警告，不中止编译。
 * 返回 url -> root 绝对路径（/ 开头）映射。
 */
async function prefetchRemoteImages(
  chapters: { path: string; md: string }[],
  rootDir: string,
  assetsDir: string,
  onStatus?: (msg: string) => void,
): Promise<{ map: Map<string, string>; warnings: Diagnostic[] }> {
  const found = new Map<string, { file: string; line: number }>()
  for (const ch of chapters) {
    const root = parseMarkdown(ch.md)
    const walk = (node: any) => {
      if (node?.type === 'image' && typeof node.url === 'string' && /^https?:/i.test(node.url)) {
        if (!found.has(node.url)) found.set(node.url, { file: ch.path, line: node.position?.start?.line ?? 0 })
      }
      for (const child of node?.children ?? []) walk(child)
    }
    walk(root)
  }
  const map = new Map<string, string>()
  const warnings: Diagnostic[] = []
  if (found.size === 0) return { map, warnings }

  const cached = new Set(readdirSync(assetsDir))
  const limiter = pLimit(3)
  await Promise.all(
    [...found.entries()].map(([url, loc]) =>
      limiter(async () => {
        const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
        // 缓存命中（此前编译已下载）
        const hit = [...cached].find((n) => n.startsWith(`web-${hash}.`))
        if (hit) {
          map.set(url, '/' + relative(rootDir, join(assetsDir, hit)))
          return
        }
        onStatus?.(`下载远程图片 ${hash.slice(0, 6)} …`)
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buf = Buffer.from(await res.arrayBuffer())
          const sniffed = sniffImageExt(buf) ?? '.png'
          const dest = join(assetsDir, `web-${hash}${sniffed}`)
          if (!existsSync(dest)) writeFileSync(dest, buf)
          map.set(url, '/' + relative(rootDir, dest))
        } catch (err) {
          const msg = String((err as Error)?.message ?? err)
          const dest = join(assetsDir, `web-missing-${hash}.svg`)
          writePlaceholderImage(dest, '远程图片下载失败', `${msg}\n${url}`)
          map.set(url, '/' + relative(rootDir, dest))
          warnings.push({
            severity: 'warning',
            message: `远程图片下载失败（已用占位图替代）：${msg}`,
            file: loc.file,
            line: loc.line,
            typFile: '',
            typLine: 0,
          })
        }
      }),
    ),
  )
  return { map, warnings }
}

/** 常见图片格式魔数嗅探（返回规范扩展名；无法识别返回 null） */
function sniffImageExt(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf.length >= 6 && buf.subarray(0, 4).toString('latin1') === 'GIF8') return '.gif'
  if (buf.length >= 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return '.png'
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return '.webp'
  if (buf.length >= 2 && buf.subarray(0, 2).toString('latin1') === 'BM') return '.bmp'
  const head = buf.toString('utf8').trimStart()
  if (head.startsWith('<') && head.includes('<svg')) return '.svg'
  return null
}

/**
 * 扩展名与真实格式不符的图片（网络抓取常见，如 JPEG 存成 .gif）会导致
 * Typst 解码失败；检测到错位时复制到 build/assets 以正确扩展名引用，
 * 不改动源文件。返回相对 root 的路径。
 */
function imageForTypst(rootDir: string, abs: string, assetsDir: string): string {
  const rel = relative(rootDir, abs)
  if (!existsSync(abs)) return rel
  // 仅读文件头部做魔数嗅探
  const fd = openSync(abs, 'r')
  const head = Buffer.alloc(512)
  try {
    readSync(fd, head, 0, 512, 0)
  } finally {
    closeSync(fd)
  }
  const sniffed = sniffImageExt(head)
  const actual = extname(abs).toLowerCase() === '.jpeg' ? '.jpg' : extname(abs).toLowerCase()
  if (!sniffed || sniffed === actual) return rel
  const buf = readFileSync(abs)
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16)
  const dest = join(assetsDir, `fix-${hash}${sniffed}`)
  if (!existsSync(dest)) writeFileSync(dest, buf)
  return relative(rootDir, dest)
}

/** 本地图片缺失时写占位 SVG（灰框 + 路径），返回相对 root 的路径 */
function writeMissingImagePlaceholder(rootDir: string, abs: string, assetsDir: string): string {
  const hash = createHash('sha1').update(abs).digest('hex').slice(0, 16)
  const dest = join(assetsDir, `missing-${hash}.svg`)
  if (!existsSync(dest)) writePlaceholderImage(dest, '本地图片不存在', abs)
  return relative(rootDir, dest)
}

/** 把 data:image/...;base64 图片落盘到 build/assets，返回 root 绝对路径（Typst 无法读取 data URL） */
function saveDataImage(bookDir: string, url: string, assetsDir: string): string {
  const m = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (!m) throw new Error(`不支持的 data URL 图片（仅 base64 可用）：${url.slice(0, 48)}…`)
  const extByType: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
  }
  const ext = extByType[m[1].toLowerCase()] ?? '.png'
  const buf = Buffer.from(m[2], 'base64')
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
  const dest = join(assetsDir, `data-${hash}${ext}`)
  if (!existsSync(dest)) writeFileSync(dest, buf)
  return '/' + relative(bookDir, dest)
}

/** 解析 Typst human 格式诊断并回映射到源 markdown */
export function parseTypstDiagnostics(output: string, builds: ChapterBuild[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = output.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const sev = lines[i].match(/^\s*(error|warning):\s+(.*)$/)
    if (!sev) {
      i++
      continue
    }
    // 收集本次诊断的原始块（到下一个 error/warning 或连续空行为止，最多 24 行）
    let blockEnd = i + 1
    let blankRun = 0
    while (blockEnd < lines.length && blockEnd - i <= 24) {
      const t = lines[blockEnd].trim()
      if (/^\s*(error|warning):/.test(lines[blockEnd])) break
      if (t === '') {
        blankRun++
        if (blankRun >= 2) break
      } else {
        blankRun = 0
      }
      blockEnd++
    }
    while (blockEnd > i + 1 && lines[blockEnd - 1].trim() === '') blockEnd--
    const rawDetail = lines.slice(i, blockEnd).join('\n').trim()
    // 向后找位置行：┌─ path:line:col
    let j = i + 1
    let loc: RegExpMatchArray | null = null
    while (j < lines.length && j < i + 4) {
      loc = lines[j].match(/┌─\s*(.+?):(\d+):(\d+)/)
      if (loc) break
      j++
    }
    if (loc) {
      const typFileRel = loc[1].trim()
      const typLine = Number(loc[2])
      const build = builds.find((b) => typFileRel.endsWith(`chapters/${b.typFile}`))
      if (build) {
        const mdLine = mapLine(build.mappings, typLine)
        diagnostics.push({
          severity: sev[1] as 'error' | 'warning',
          message: sev[2],
          file: build.mdPath,
          line: mdLine,
          typFile: build.typFile,
          typLine,
          detail: rawDetail,
        })
      } else {
        diagnostics.push({
          severity: sev[1] as 'error' | 'warning',
          message: sev[2],
          file: typFileRel.replace(/^.*[\\/]/, ''),
          line: typLine,
          typFile: typFileRel,
          typLine,
          detail: rawDetail,
        })
      }
      i = j + 1
    } else {
      diagnostics.push({
        severity: sev[1] as 'error' | 'warning',
        message: sev[2],
        file: 'main.typ',
        line: 0,
        typFile: 'main.typ',
        typLine: 0,
        detail: rawDetail,
      })
      i++
    }
  }
  return diagnostics
}

function mapLine(mappings: LineMapping[], typLine: number): number {
  let best = 0
  for (const m of mappings) {
    if (m.typLine <= typLine) best = m.mdLine
    else break
  }
  return best
}

// ---------------- Mermaid（mmdc） ----------------

let mmdcChecked = false
let mmdcPath: string | null = null

function detectMmdc(): string {
  if (mmdcChecked) {
    if (!mmdcPath) throw new Error('未找到 mmdc（@mermaid-js/mermaid-cli），无法渲染 Mermaid 图')
    return mmdcPath
  }
  mmdcChecked = true
  const r = spawnSync('mmdc', ['--version'], { encoding: 'utf8', timeout: 20000 })
  if (r.status === 0) {
    mmdcPath = 'mmdc'
  } else {
    throw new Error('未找到 mmdc（@mermaid-js/mermaid-cli），请安装：npm i -g @mermaid-js/mermaid-cli')
  }
  return mmdcPath
}

async function renderMermaid(code: string, svgPath: string): Promise<void> {
  const cmd = detectMmdc()
  const tmpDir = join(app.getPath('userData'), 'mermaid-tmp')
  mkdirSync(tmpDir, { recursive: true })
  const inFile = join(tmpDir, `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mmd`)
  writeFileSync(inFile, code)

  // puppeteer 沙箱配置（Linux root/容器环境需要 --no-sandbox）
  const puppeteerCfg = join(tmpDir, 'puppeteer.json')
  if (!existsSync(puppeteerCfg)) {
    writeFileSync(puppeteerCfg, JSON.stringify({ args: ['--no-sandbox', '--disable-setuid-sandbox'] }))
  }
  const mermaidCfg = join(tmpDir, 'mermaid.json')
  if (!existsSync(mermaidCfg)) {
    writeFileSync(mermaidCfg, JSON.stringify({ theme: 'neutral', fontFamily: 'Noto Sans SC', securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false }, class: { htmlLabels: false } }))
  }

  const res = await runCommand(cmd, [
    '-i', inFile,
    '-o', svgPath,
    '-b', 'white',
    '-p', puppeteerCfg,
    '-c', mermaidCfg,
  ])
  if (!existsSync(svgPath)) {
    throw new Error(`Mermaid 渲染失败：${res.stderr.slice(0, 500)}`)
  }
}

/** 简易子进程运行（mmdc 用） */
function runCommand(
  cmd: string,
  args: string[],
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args)
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => p.kill('SIGKILL'), 60_000)
    p.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status: status ?? -1, stdout, stderr })
    })
    p.on('error', (err) => {
      clearTimeout(timer)
      resolve({ status: -1, stdout, stderr: String(err) })
    })
  })
}

/** 读取构建产物（PDF 预览用）：返回绝对路径 */
export function pdfPathOf(bookDir: string): string | null {
  const p = join(bookDir, 'output', 'book.pdf')
  return existsSync(p) ? p : null
}

/** 读取章节构建 warnings（调试用） */
export function readBuildMain(bookDir: string): string {
  return readFileSync(join(bookDir, 'build', 'main.typ'), 'utf8')
}

/**
 * 单个 markdown 文件导出 PDF（独立于书籍管线）。
 * 中间产物放在源文件旁的隐藏目录 `.booktool/`（复用模板/字体/诊断管线），
 * Typst `--root` 指向源文件所在目录，使相对图片路径按源文件位置解析。
 */
export async function compileSingleFile(
  fileAbs: string,
  outPdf: string,
  onStatus?: (msg: string) => void,
): Promise<CompileReport> {
  const t0 = Date.now()
  const md = readFileSync(fileAbs, 'utf8')
  const dir = dirname(fileAbs)
  const base = basename(fileAbs, extname(fileAbs))
  const buildDir = join(dir, '.booktool')
  const chaptersDir = join(buildDir, 'chapters')
  const assetsDir = join(buildDir, 'assets')
  for (const d of [buildDir, chaptersDir, assetsDir]) mkdirSync(d, { recursive: true })

  // 1) 单文件 md → typst（图片相对源文件目录解析；data:/mermaid 落到 .booktool/assets）
  const { map: remoteImages, warnings: remoteWarnings } = await prefetchRemoteImages(
    [{ path: `${base}.md`, md }],
    dir,
    assetsDir,
    onStatus,
  )
  const diagrams = new Map<string, string>()
  const out = compileMarkdown(md, {
    preamble: '#import "../template.typ": *',
    resolveImage: (url) => {
      if (url.startsWith('mermaid:')) return `/.booktool/assets/mermaid-${url.slice('mermaid:'.length)}.svg`
      if (/^https?:/i.test(url)) return remoteImages.get(url) ?? url
      if (url.startsWith('data:image/')) return saveDataImage(dir, url, assetsDir)
      const abs = join(dir, url)
      if (!existsSync(abs)) {
        remoteWarnings.push({
          severity: 'warning',
          message: `本地图片不存在（已用占位图替代）：${url}`,
          file: `${base}.md`,
          line: 0,
          typFile: '',
          typLine: 0,
        })
        return '/' + writeMissingImagePlaceholder(dir, abs, assetsDir)
      }
      return '/' + imageForTypst(dir, abs, assetsDir)
    },
  })
  const diagramLines = new Map<string, number>()
  for (const d of out.diagrams) {
    diagrams.set(d.hash, d.code)
    if (!diagramLines.has(d.hash)) diagramLines.set(d.hash, d.line)
  }
  const builds: ChapterBuild[] = [{ typFile: 'chapter.typ', mdPath: `${base}.md`, typst: out.typst, mappings: out.mappings }]
  atomicWrite(join(chaptersDir, 'chapter.typ'), out.typst)
  const warnings: Diagnostic[] = [
    ...remoteWarnings,
    ...out.warnings.map((w) => ({
      severity: 'warning' as const,
      message: w.message,
      file: `${base}.md`,
      line: w.line,
      typFile: 'chapter.typ',
      typLine: 0,
    })),
  ]

  // 2) Mermaid（复用书籍管线；缓存命中则跳过；单图失败不中止导出）
  let mermaidRendered = 0
  let mermaidCached = 0
  const mermaidFailures: { hash: string; err: string }[] = []
  const limiter = pLimit(3)
  const jobs = [...diagrams.entries()].map(([hash, code]) =>
    limiter(async () => {
      const svg = join(assetsDir, `mermaid-${hash}.svg`)
      if (existsSync(svg)) {
        mermaidCached++
        return
      }
      onStatus?.(`渲染 Mermaid 图 ${hash.slice(0, 6)} …`)
      try {
        await renderMermaid(code, svg)
        mermaidRendered++
      } catch (err) {
        const msg = String((err as Error)?.message ?? err)
        mermaidFailures.push({ hash, err: msg })
        writeMermaidPlaceholder(svg, hash, msg)
      }
    }),
  )
  await Promise.all(jobs)
  for (const f of mermaidFailures) {
    warnings.push({
      severity: 'warning',
      message: `Mermaid 渲染失败（已用占位图替代）：${f.err.slice(0, 200)}`,
      file: `${base}.md`,
      line: diagramLines.get(f.hash) ?? 0,
      typFile: 'chapter.typ',
      typLine: 0,
    })
  }

  // 3) template.typ + main.typ
  writeFileSync(join(buildDir, 'template.typ'), renderTemplate())
  writeFileSync(join(buildDir, 'main.typ'), renderMainTypst({ title: base, authors: [], chapters: [{ file: 'chapters/chapter.typ' }] }))

  // 4) Typst 编译
  onStatus?.('Typst 编译 PDF …')
  const typstPath = await ensureTypst(onStatus)
  const fontsDir = join(app.getAppPath(), 'resources', 'fonts')
  const args = ['compile', '--root', dir]
  if (existsSync(fontsDir)) args.push('--font-path', fontsDir)
  args.push('.booktool/main.typ', outPdf)
  const result = await runTypst(typstPath, args, dir)

  const diagnostics = [
    ...warnings,
    ...parseTypstDiagnostics(result.stdout + '\n' + result.stderr, builds),
  ].filter((d) => !(d.severity === 'warning' && /unknown font family/i.test(d.message)))
  // 补充源行片段便于诊断
  for (const d of diagnostics) {
    if (d.line <= 0) continue
    try {
      const srcLine = md.split(/\r?\n/)[d.line - 1]
      if (srcLine != null && srcLine.trim() !== '') {
        const header = `--- ${base}.md:${d.line} ---`
        d.detail = d.detail ? `${d.detail}\n\n${header}\n${srcLine}` : `${header}\n${srcLine}`
      }
    } catch {
      /* 忽略 */
    }
  }
  return {
    ok: result.status === 0 && existsSync(outPdf),
    pdfPath: existsSync(outPdf) ? outPdf : null,
    diagnostics,
    durationMs: Date.now() - t0,
    mermaidRendered,
    mermaidCached,
  }
}
