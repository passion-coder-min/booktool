/**
 * 桌面端编译管线集成测试：compileBook（mdtypst → mmdc → Typst CLI → PDF）。
 * mock electron 的 app 路径；跳过条件同 e2e（缺 typst/mmdc）。
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
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
