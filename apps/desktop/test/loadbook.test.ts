import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { loadBook } from '../electron/main/books'

const demoBook = join(__dirname, '../../../examples/demo-book')

describe('loadBook（真实目录）', () => {
  it.skipIf(!existsSync(join(demoBook, 'book.toml')))('解析 book.toml 与 SUMMARY', () => {
    const book = loadBook(demoBook)
    expect(book.config.title).toBe('BookTool 演示手册')
    expect(book.config.srcDir).toBe('src')
    expect(book.chapters.map((c) => c.path)).toEqual([
      'chapter-1.md',
      'chapter-2.md',
      'chapter-3.md',
      'chapter-4.md',
      'chapter-5.md',
    ])
    // Part 结构
    const part = book.summary.find((s) => s.type === 'part')
    expect(part?.title).toBe('基础篇')
  })

  it('无 versions 配置时 srcDir 默认 src', () => {
    expect(loadBook(demoBook).config.versions).toEqual([])
  })

  it('兼容 mdBook 默认结构（无 book.toml，仅 src/SUMMARY.md）', () => {
    const dir = join(tmpdir(), `booktool-mdbook-${Date.now()}`)
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'SUMMARY.md'), '# Summary\n\n- [第一章](ch1.md)\n')
    const book = loadBook(dir)
    expect(book.config.srcDir).toBe('src')
    expect(book.chapters.map((c) => c.path)).toEqual(['ch1.md'])
    // 目录名作为缺省书名
    expect(book.config.title).toContain('booktool-mdbook')
  })
})
