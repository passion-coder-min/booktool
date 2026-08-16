import { describe, expect, it } from 'vitest'
import { compileMarkdown } from '../src/mermaid'

const t = (md: string) => compileMarkdown(md).typst.trimEnd()

describe('mdast→Typst 基础块', () => {
  it('中英混排段落', () => {
    expect(t('这是 English 与中文 mix 的段落，数字 123。')).toBe(
      '这是 English 与中文 mix 的段落，数字 123。',
    )
  })

  it('标题生成 label（中文保留、去重）', () => {
    const out = t('# 第一章 概述\n\n## 安装 Install\n\n# 概述\n\n# 概述')
    expect(out).toContain('= 第一章 概述 <第一章-概述>')
    expect(out).toContain('== 安装 Install <安装-install>')
    // 重名标题追加序号
    expect(out).toContain('= 概述 <概述>')
    expect(out).toContain('= 概述 <概述-2>')
  })

  it('分隔线', () => {
    expect(t('---')).toBe('#line(length: 100%)')
  })

  it('段落内单图 → figure 带题注', () => {
    const out = t('![架构图](assets/arch.png)')
    expect(out).toBe([
      '#figure(',
      '  auto-fit-image("assets/arch.png"),',
      '  caption: [架构图],',
      ')',
    ].join('\n'))
  })

  it('resolveImage 重写路径（mermaid 协议）', () => {
    const out = compileMarkdown('```mermaid\ngraph TD; A-->B;\n```', {
      resolveImage: (u) => (u.startsWith('mermaid:') ? `assets/mermaid-${u.slice(8)}.svg` : u),
    })
    expect(out.diagrams).toHaveLength(1)
    expect(out.typst).toContain('image("assets/mermaid-')
    expect(out.typst).toContain('caption: [Mermaid 图]')
  })
})

describe('mdast→Typst 内联', () => {
  it('强调/加粗/删除线/行内代码/硬换行', () => {
    expect(t('*斜体* **加粗** ~~删除~~ `code`')).toBe(
      '#emph[斜体] #strong[加粗] #strike[删除] #raw("code", block: false)',
    )
  })

  it('行内代码转义引号与反斜杠', () => {
    expect(t('`a"b\\c`')).toBe('#raw("a\\"b\\\\c", block: false)')
  })

  it('外部链接', () => {
    expect(t('[官网](https://example.com/a?b=1)')).toBe(
      '#link("https://example.com/a?b=1")[官网]',
    )
  })

  it('内部锚点链接 → label 引用', () => {
    const out = t('# 目标标题\n\n见 [说明](#目标标题)。')
    expect(out).toContain('= 目标标题 <目标标题>')
    expect(out).toContain('#link(<目标标题>)[说明]')
  })

  it('自动链接', () => {
    // 链接文本经标记模式转义（/ → \/，渲染结果不变）
    expect(t('<https://typst.app>')).toBe(
      '#link("https://typst.app")[https:\\/\\/typst.app]',
    )
  })

  it('脚注引用与定义', () => {
    const out = t('正文[^1]。\n\n[^1]: 脚注内容。')
    expect(out).toContain('#footnote[脚注内容。]')
  })
})

describe('mdast→Typst 代码与数学', () => {
  it('代码块（多行、引号、语言别名）', () => {
    expect(t('```ts\nconst s = "hi"\nlet x = 1\n```')).toBe(
      '#raw("const s = \\"hi\\"\\nlet x = 1", block: true, lang: "typescript")',
    )
  })

  it('行内数学与块级数学', () => {
    const out = t('质能方程 $E=mc^2$ 如下：\n\n$$\\frac{a+b}{c}$$')
    expect(out).toContain('$E=m c^2$')
    expect(out).toContain('$ frac(a+b, c) $')
  })
})

describe('mdast→Typst 列表与引用', () => {
  it('无序嵌套列表（缩进续行）', () => {
    const out = t('- 一级\n  - 二级\n- 又一个一级')
    expect(out).toBe('- 一级\n  - 二级\n- 又一个一级')
  })

  it('有序列表', () => {
    expect(t('1. 第一\n2. 第二')).toBe('+ 第一\n+ 第二')
  })

  it('任务列表', () => {
    const out = t('- [x] 已完成\n- [ ] 待办')
    expect(out).toContain('#task-item(true)[')
    expect(out).toContain('#task-item(false)[')
  })

  it('引用块', () => {
    expect(t('> 引用的内容')).toBe('#quote(block: true)[\n引用的内容\n]')
  })
})

describe('mdast→Typst 表格与容器', () => {
  it('GFM 表格含对齐', () => {
    const out = t('| 左 | 中 | 右 |\n|---|:-:|--:|\n| a | b | c |')
    expect(out).toContain('columns: (auto, auto, auto),')
    expect(out).toContain('align: (auto, center, right),')
    expect(out).toContain('table.header(')
    expect(out).toContain('[左],')
    expect(out).toContain('[c],')
  })

  it('指令容器 → admonition', () => {
    const out = t(':::warning\n注意内容\n:::')
    expect(out).toBe('#admonition("warning")[\n注意内容\n]')
  })

  it('带标题属性的容器', () => {
    const out = t(':::note{title="自定义标题"}\n内容\n:::')
    expect(out).toContain('#admonition("note", title: "自定义标题")[')
  })
})

describe('转义与降级', () => {
  it('正文特殊字符全部转义', () => {
    expect(t('特殊字符 #1: $ 与 *星号*')).toBe('特殊字符 \\#1: \\$ 与 #emph[星号]')
  })

  it('HTML 产生 warning 并跳过', () => {
    const out = compileMarkdown('<div>hi</div>')
    expect(out.typst.trim()).toBe('')
    expect(out.warnings.some((w) => w.message.includes('HTML'))).toBe(true)
  })

  it('行号映射覆盖顶层块', () => {
    const out = compileMarkdown('第一段\n\n第二段\n\n第三段')
    expect(out.mappings).toEqual([
      { typLine: 1, mdLine: 1 },
      { typLine: 3, mdLine: 3 },
      { typLine: 5, mdLine: 5 },
    ])
  })
})
