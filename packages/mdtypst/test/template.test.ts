import { describe, expect, it } from 'vitest'
import { renderMainTypst, renderTemplate } from '../src/template'

describe('renderTemplate', () => {
  it('共享函数（不含 set/show 样式，样式在 main.typ）', () => {
    const out = renderTemplate()
    expect(out).toContain('#let auto-fit-image(')
    expect(out).toContain('#let admonition(')
    expect(out).toContain('#let task-item(')
    expect(out).not.toContain('#set text')
  })
})

describe('renderMainTypst', () => {
  it('样式直接生成在 main.typ（词法作用域，include 不传播）', () => {
    const out = renderMainTypst({ title: 'T', authors: [], chapters: [] })
    expect(out).toContain('cjk-latin-spacing: auto')
    // 曾用 #show regex("…+") 缩小西文（0.85em），但 Typst 0.15.1 对长 ASCII 串
    // 报「maximum grouping depth exceeded」（真实书触发）→ 已移除，避免回归
    expect(out).not.toContain('#show regex(')
    // 中文强调不用斜体（防楷体回退）
    expect(out).toContain('#show emph: it => text(weight: 600')
    // 表格样式与表头加粗
    expect(out).toContain('#set table(stroke:')
    expect(out).toContain('#set heading(numbering: "1.1")')
    expect(out).toContain('supplement: [图]')
    expect(out).toContain('#import "template.typ"')
  })

  it('包含标题、作者与章节 include', () => {
    const out = renderMainTypst({
      title: '我的书',
      authors: ['张三', '李四'],
      chapters: [{ file: 'chapters/ch-00-intro.typ' }, { file: 'chapters/ch-01.typ' }],
    })
    expect(out).toContain('#let book-title = "我的书"')
    expect(out).toContain('"张三", "李四",')
    expect(out).toContain('#include "chapters/ch-00-intro.typ"')
    expect(out).toContain('#include "chapters/ch-01.typ"')
    expect(out).toContain('#outline(')
  })

  it('单作者也是数组（尾逗号）', () => {
    const out = renderMainTypst({ title: 'T', authors: ['张三'], chapters: [] })
    expect(out).toContain('#let book-authors = ("张三",)')
  })
})
