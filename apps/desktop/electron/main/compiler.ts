import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { join, relative, dirname, basename, extname } from 'node:path'
import pLimit from 'p-limit'
import { compileMarkdown, renderMainTypst, renderTemplate, type LineMapping, type MermaidDiagram } from '@booktool/mdtypst'
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
  const builds: ChapterBuild[] = []
  const warnings: Diagnostic[] = []

  book.chapters.forEach((ch, idx) => {
    const md = readChapter(bookDir, book.config.srcDir, ch.path)
    const mdDirAbs = join(srcAbs, dirname(ch.path))
    const out = compileMarkdown(md, {
      preamble: '#import "../template.typ": *',
      resolveImage: (url) => {
        // root 绝对路径（/ 开头）：auto-fit-image 位于 template.typ，
        // 相对路径会以 template.typ 为基准，必须用 --root 绝对路径
        if (url.startsWith('mermaid:')) {
          return `/build/assets/mermaid-${url.slice('mermaid:'.length)}.svg`
        }
        if (/^(https?:|data:)/.test(url)) return url
        const abs = join(mdDirAbs, url)
        return '/' + relative(bookDir, abs)
      },
    })
    for (const d of out.diagrams) diagrams.set(d.hash, d.code)
    const slug = basename(ch.path, extname(ch.path)).replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'chapter'
    const typFile = `ch-${String(idx).padStart(2, '0')}-${slug}.typ`
    atomicWrite(join(chaptersDir, typFile), out.typst)
    builds.push({ typFile, mdPath: ch.path, typst: out.typst, mappings: out.mappings })
    for (const w of out.warnings) {
      warnings.push({ severity: 'warning', message: w.message, file: ch.path, line: w.line, typFile, typLine: 0 })
    }
  })

  // 2) Mermaid 渲染（内容哈希缓存，3 并发）
  let mermaidRendered = 0
  let mermaidCached = 0
  const limiter = pLimit(3)
  const jobs = [...diagrams.entries()].map(([hash, code]) =>
    limiter(async () => {
      const svg = join(assetsDir, `mermaid-${hash}.svg`)
      if (existsSync(svg)) {
        mermaidCached++
        return
      }
      onStatus?.(`渲染 Mermaid 图 ${hash.slice(0, 6)} …`)
      await renderMermaid(code, svg)
      mermaidRendered++
    }),
  )
  await Promise.all(jobs)

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
  ]
  return {
    ok: result.status === 0 && existsSync(pdfPath),
    pdfPath: existsSync(pdfPath) ? pdfPath : null,
    diagnostics,
    durationMs: Date.now() - t0,
    mermaidRendered,
    mermaidCached,
  }
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
        })
      } else {
        diagnostics.push({
          severity: sev[1] as 'error' | 'warning',
          message: sev[2],
          file: typFileRel.replace(/^.*[\\/]/, ''),
          line: typLine,
          typFile: typFileRel,
          typLine,
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
