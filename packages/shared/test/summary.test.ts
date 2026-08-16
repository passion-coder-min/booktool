import { describe, expect, it } from 'vitest'
import { parseSummary, flattenChapters } from '../src/summary'

describe('parseSummary', () => {
  it('解析标准 mdBook SUMMARY', () => {
    const md = [
      '# Summary',
      '',
      '[前言](preface.md)',
      '',
      '# 第一部分',
      '',
      '- [第一章](ch1.md)',
      '  - [1.1 小节](ch1/s1.md)',
      '  - [1.2 小节](ch1/s2.md)',
      '- [第二章](ch2.md)',
      '',
      '---',
      '',
      '- [附录](appendix.md)',
    ].join('\n')
    const items = parseSummary(md)
    // 无缩进链接列表顶层、Part 标题、嵌套、分隔线
    expect(items[0]).toMatchObject({ type: 'chapter', title: '前言', path: 'preface.md' })
    expect(items[1]).toMatchObject({ type: 'part', title: '第一部分' })
    const part = items[1].children
    expect(part[0]).toMatchObject({ type: 'chapter', title: '第一章', path: 'ch1.md' })
    expect(part[0].children[0]).toMatchObject({ type: 'chapter', path: 'ch1/s1.md' })
    expect(part[1]).toMatchObject({ type: 'chapter', title: '第二章' })
    expect(items[2]).toMatchObject({ type: 'separator' })
    expect(items[3]).toMatchObject({ type: 'chapter', path: 'appendix.md' })
  })

  it('顶层无缩进链接与列表混排', () => {
    const items = parseSummary('- [A](a.md)\n- 分组（无链接）\n  - [B](b.md)')
    expect(items[0]).toMatchObject({ type: 'chapter', path: 'a.md' })
    expect(items[1]).toMatchObject({ type: 'part', title: '分组（无链接）' })
    expect(items[1].children[0]).toMatchObject({ type: 'chapter', path: 'b.md' })
  })

  it('flattenChapters 保持顺序', () => {
    const items = parseSummary('- [A](a.md)\n- P\n  - [B](b.md)\n- [C](c.md)')
    expect(flattenChapters(items).map((c) => c.path)).toEqual(['a.md', 'b.md', 'c.md'])
  })

  it('URL 编码路径解码', () => {
    const items = parseSummary('- [中文](%E4%B8%AD%E6%96%87.md)')
    expect(items[0].path).toBe('中文.md')
  })
})
