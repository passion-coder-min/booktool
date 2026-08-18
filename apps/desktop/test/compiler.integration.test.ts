/**
 * 桌面端编译管线集成测试：compileBook（mdtypst → mmdc → Typst CLI → PDF）。
 * mock electron 的 app 路径；跳过条件同 e2e（缺 typst/mmdc）。
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({
  app: {
    getPath: (_kind: string) => join(tmpdir(), 'booktool-test'),
    getAppPath: () => join(__dirname, '..'),
  },
}))

const repoRoot = join(__dirname, '../../..')
const typstBin = join(repoRoot, '.tools', 'typst')

function findTypst(): string | null {
  if (existsSync(typstBin)) return typstBin
  const r = spawnSync('typst', ['--version'], { encoding: 'utf8', timeout: 5000 })
  return r.status === 0 ? 'typst' : null
}

describe('compileBook 集成（桌面管线）', { timeout: 240_000 }, () => {
  it('端到端编译出 PDF（含 Mermaid）', async () => {
    const typst = findTypst()
    if (!typst) return console.warn('跳过：未找到 typst')
    if (spawnSync('mmdc', ['--version'], { encoding: 'utf8', timeout: 20000 }).status !== 0) {
      return console.warn('跳过：未找到 mmdc')
    }

    // 预置 typst 到 mock 的 userData/binaries，避免 ensureTypst 触发下载
    const userData = join(tmpdir(), 'booktool-test')
    const binDir = join(userData, 'binaries')
    mkdirSync(binDir, { recursive: true })
    const localTypst = join(binDir, 'typst')
    if (!existsSync(localTypst) && typst !== 'typst') {
      const { copyFileSync, chmodSync } = await import('node:fs')
      copyFileSync(typst, localTypst)
      chmodSync(localTypst, 0o755)
    }

    const { compileBook } = await import('../electron/main/compiler')
    const ws = join(tmpdir(), 'booktool-test-ws')
    const bookDir = join(ws, 'books', 'it-book')
    const src = join(bookDir, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(bookDir, 'book.toml'), `[book]\ntitle = "集成测试"\nauthors = ["测试"]\n`)
    writeFileSync(join(src, 'SUMMARY.md'), `- [第一章](ch1.md)\n`)
    writeFileSync(
      join(src, 'ch1.md'),
      `# 第一章\n\n中文与 English 混排，*强调* 不应变成艺术字。\n\n\`\`\`mermaid\ngraph LR\n  A[开始] --> B[结束]\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n`,
    )

    const report = await compileBook(bookDir, undefined, { outputName: 'it.pdf' })
    if (!report.ok) {
      console.error(JSON.stringify(report.diagnostics, null, 2))
    }
    expect(report.ok).toBe(true)
    expect(existsSync(report.pdfPath!)).toBe(true)
    // Mermaid 已渲染（无未渲染警告）
    expect(report.diagnostics.filter((d) => d.message.includes('Mermaid'))).toEqual([])
    // 产物包含模板（样式在 main.typ）
    const main = readFileSync(join(bookDir, 'build', 'main.typ'), 'utf8')
    expect(main).toContain('cjk-latin-spacing: auto')
    expect(main).toContain('#show emph: it => text(weight: 600')
  })
})

describe('compileBook Mermaid 容错（空块/渲染失败不中止）', { timeout: 240_000 }, () => {
  it('空块跳过 + 非法图占位：编译成功且产生 warning', async () => {
    const typst = findTypst()
    if (!typst) return console.warn('跳过：未找到 typst')

    const userData = join(tmpdir(), 'booktool-test')
    const binDir = join(userData, 'binaries')
    mkdirSync(binDir, { recursive: true })
    const localTypst = join(binDir, 'typst')
    if (!existsSync(localTypst) && typst !== 'typst') {
      const { copyFileSync, chmodSync } = await import('node:fs')
      copyFileSync(typst, localTypst)
      chmodSync(localTypst, 0o755)
    }

    const { compileBook } = await import('../electron/main/compiler')
    const ws = join(tmpdir(), 'booktool-mermaid-ws')
    const bookDir = join(ws, 'book')
    const src = join(bookDir, 'src')
    rmSync(bookDir, { recursive: true, force: true }) // 清理跨运行残留（mermaid 缓存会掩盖渲染路径）
    mkdirSync(src, { recursive: true })
    writeFileSync(join(bookDir, 'book.toml'), `[book]\ntitle = "容错"\nauthors = []\n`)
    writeFileSync(join(src, 'SUMMARY.md'), `- [章](ch.md)\n`)
    // 空块（应跳过）+ 非法语法（mmdc 失败 -> 占位 SVG）+ 正常文本
    writeFileSync(
      join(src, 'ch.md'),
      [
        '# 容错章',
        '',
        '```mermaid',
        '',
        '```',
        '',
        '```mermaid',
        'this is not valid mermaid at all ((((',
        '```',
        '',
        '正文结尾。',
        '',
      ].join('\n'),
    )

    const report = await compileBook(bookDir, undefined, { outputName: 'mermaid.pdf' })
    if (!report.ok) console.error(JSON.stringify(report.diagnostics, null, 2))
    expect(report.ok).toBe(true)
    expect(existsSync(report.pdfPath!)).toBe(true)
    // 空块 -> 跳过警告；非法图 -> 占位警告
    expect(report.diagnostics.some((d) => d.message.includes('空的 Mermaid 代码块'))).toBe(true)
    expect(report.diagnostics.some((d) => d.message.includes('Mermaid 渲染失败（已用占位图替代）') && d.file === 'ch.md' && d.line === 7)).toBe(true)
  })
})

describe('compileSingleFile 集成（单文件导出 PDF）', { timeout: 240_000 }, () => {
  it('单个 md 文件导出 PDF（含中文混排/表格/脚注）', async () => {
    const typst = findTypst()
    if (!typst) return console.warn('跳过：未找到 typst')

    const userData = join(tmpdir(), 'booktool-test')
    const binDir = join(userData, 'binaries')
    mkdirSync(binDir, { recursive: true })
    const localTypst = join(binDir, 'typst')
    if (!existsSync(localTypst) && typst !== 'typst') {
      const { copyFileSync, chmodSync } = await import('node:fs')
      copyFileSync(typst, localTypst)
      chmodSync(localTypst, 0o755)
    }

    const { compileSingleFile } = await import('../electron/main/compiler')
    const dir = join(tmpdir(), `booktool-single-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const md = join(dir, 'note.md')
    writeFileSync(md, '# 笔记\n\n中文与 English 混排。\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n脚注[^1]。\n\n[^1]: 脚注内容。\n')
    const outPdf = join(dir, 'note.pdf')

    const report = await compileSingleFile(md, outPdf)
    if (!report.ok) console.error(JSON.stringify(report.diagnostics, null, 2))
    expect(report.ok).toBe(true)
    expect(existsSync(outPdf)).toBe(true)
    // 产物体积非空
    expect(readFileSync(outPdf).length).toBeGreaterThan(1000)
  })
})

describe('compileBook 进度消息（onStatus 携带 done/total）', { timeout: 240_000 }, () => {
  it('章节/远程图/Mermaid 逐步推送进度，且 Typst 阶段有消息', async () => {
    const typst = findTypst()
    if (!typst) return console.warn('跳过：未找到 typst')
    if (spawnSync('mmdc', ['--version'], { encoding: 'utf8', timeout: 20000 }).status !== 0) {
      return console.warn('跳过：未找到 mmdc')
    }

    const userData = join(tmpdir(), 'booktool-test')
    const binDir = join(userData, 'binaries')
    mkdirSync(binDir, { recursive: true })
    const localTypst = join(binDir, 'typst')
    if (!existsSync(localTypst) && typst !== 'typst') {
      const { copyFileSync, chmodSync } = await import('node:fs')
      copyFileSync(typst, localTypst)
      chmodSync(localTypst, 0o755)
    }

    const { compileBook } = await import('../electron/main/compiler')
    const dir = join(tmpdir(), `booktool-progress-${Date.now()}`) // 全新目录：无 mermaid 缓存
    const src = join(dir, 'src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(dir, 'book.toml'), `[book]\ntitle = "进度"\nauthors = []\n`)
    writeFileSync(join(src, 'SUMMARY.md'), `- [一](c1.md)\n- [二](c2.md)\n`)
    for (const [f, body] of [
      ['c1.md', '# 一\n\n```mermaid\ngraph LR\n  A --> B\n```\n'],
      ['c2.md', '# 二\n\n正文。\n'],
    ] as const) {
      writeFileSync(join(src, f), body)
    }

    const statuses: { msg: string; progress?: { done: number; total: number } }[] = []
    const report = await compileBook(dir, (msg, progress) => statuses.push({ msg, progress }), { outputName: 'progress.pdf' })
    if (!report.ok) console.error(JSON.stringify(report.diagnostics, null, 2))
    expect(report.ok).toBe(true)

    const msgs = statuses.map((s) => s.msg)
    // 章节：done 递增到总数（最后一跳为 N/N）
    const chMsgs = statuses.filter((s) => s.msg.includes('转换章节'))
    expect(chMsgs.length).toBeGreaterThan(0)
    expect(chMsgs[0]!.msg).toMatch(/转换章节 \d+\/\d+/)
    expect(chMsgs[chMsgs.length - 1]!.progress).toEqual({ done: 2, total: 2 })
    // Mermaid：进度存在且 done ≤ total
    const mm = statuses.find((s) => s.msg.includes('渲染 Mermaid 图'))
    expect(mm?.msg).toMatch(/渲染 Mermaid 图 \d+\/\d+/)
    expect(mm?.progress!.total).toBe(1)
    expect(mm?.progress!.done).toBe(1)
    // Typst 阶段消息（单步，无进度）
    expect(msgs.some((m) => m.includes('Typst 编译 PDF'))).toBe(true)
  })
})
