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

  it('空的 mermaid 代码块：跳过渲染并给出警告（不产生 diagram）', () => {
    const out = compileMarkdown('# 标题\n\n前置\n\n```mermaid\n\n```\n\n后置', {
      resolveImage: (u) => u,
    })
    expect(out.diagrams).toHaveLength(0)
    expect(out.typst).not.toContain('image("')
    expect(out.warnings).toEqual([{ message: '空的 Mermaid 代码块，已跳过渲染', line: 5 }])
  })

  it('diagram 记录源行号（诊断回映射用）', () => {
    const out = compileMarkdown('第一段\n\n```mermaid\ngraph TD; A-->B;\n```')
    expect(out.diagrams).toHaveLength(1)
    expect(out.diagrams[0].line).toBe(3)
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

  it('强调后紧跟括号：转义避免被解析为函数调用', () => {
    expect(t('**协程**(大量IO操作)方案')).toBe('#strong[协程]\\(大量IO操作)方案')
    expect(t('*斜体*{花括号}')).toBe('#emph[斜体]\\{花括号}')
  })

  it('外部链接', () => {
    expect(t('[官网](https://example.com/a?b=1)')).toBe(
      '#link("https://example.com/a?b=1")[官网]',
    )
  })

  it('空链接目标降级为纯文本并警告', () => {
    const out = compileMarkdown('见 [说明]()。')
    expect(out.typst).not.toContain('#link("")')
    expect(out.typst).toContain('见 说明。')
    expect(out.warnings.some((w) => w.message.includes('空链接'))).toBe(true)
  })

  it('内部锚点链接 → label 引用', () => {
    const out = t('# 目标标题\n\n见 [说明](#目标标题)。')
    expect(out).toContain('= 目标标题 <目标标题>')
    expect(out).toContain('#link(<目标标题>)[说明]')
  })

  it('悬空锚点降级为纯文本并警告（Typst 不允许缺失 label）', () => {
    const out = compileMarkdown('# 标题\n\n见 [说明](#不存在的锚点)。')
    expect(out.typst).not.toContain('#link(<不存在的锚点>)')
    expect(out.typst).toContain('见 说明。')
    expect(out.warnings.some((w) => w.message.includes('锚点') && w.message.includes('不存在'))).toBe(true)
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
    // 列宽按内容长度加权（等长内容 → 各列近似均分，以 N.fr 显式分配）
    expect(out).toMatch(/columns: \([\d.]+fr, [\d.]+fr, [\d.]+fr\),/)
    expect(out).toContain('align: (auto, center, right),')
    expect(out).toContain('table.header(')
    expect(out).toContain('[左],')
    expect(out).toContain('[c],')
  })

  it('表格列宽按内容长度加权（最长内容的列分到最宽）', () => {
    const out = t('| 序号 | 很长很长的说明文字内容这一列最长 | 值 |\n|---|---|---|\n| 1 | 这里的说明文字也比较长一些 | x |')
    const m = out.match(/columns: \(([\d.]+)fr, ([\d.]+)fr, ([\d.]+)fr\),/)
    expect(m).not.toBeNull()
    if (m) {
      const [w1, w2, w3] = [Number(m[1]), Number(m[2]), Number(m[3])]
      // 中列内容最长（17字）→ 权重最大，且显著大于短内容列
      expect(w2).toBeGreaterThan(w1)
      expect(w2).toBeGreaterThan(w3)
      expect(w2).toBeGreaterThan(w1 + w3)
    }
  })

  it('表格内长 token 插入零宽断行机会（防溢出重叠）', () => {
    const out = t('| 方法 | 默认值 |\n|---|---|\n| getGlobalAlertBytes(long def) | DEFAULT_PERFORM_POLL_DELAY_MS |')
    // 驼峰边界插入 ZWSP（getGlobalAlertBytes 无需转义的字符）
    expect(out).toContain('get\u{200b}Global\u{200b}Alert\u{200b}Bytes')
    // 下划线边界插入（DEFAULT_PERFORM_POLL_DELAY_MS 有 4 个 _ 边界）
    expect((out.match(/\u200b/g) ?? []).length).toBeGreaterThanOrEqual(4)
    // 可见文本不变：去掉 ZWSP 与转义反斜杠后内容原样
    const plain = out.replace(/[\u200b\\]/g, '')
    expect(plain).toContain('DEFAULT_PERFORM_POLL_DELAY_MS')
    expect(plain).toContain('getGlobalAlertBytes(long def)')
  })

  it('表格外正文与短内容不插入断行机会', () => {
    expect(t('正文里出现 DEFAULT_PERFORM_POLL_DELAY_MS 不会被改写')).not.toContain('\u{200b}')
    expect(t('| a | b |\n|---|---|\n| 1 | 2 |')).not.toContain('\u{200b}')
  })

  it('表格行列数不齐时规范化（缺格补空、多格截断）', () => {
    const out = t('| a | b | c |\n|---|---|---|\n| 1 | 2 |\n| 4 | 5 | 6 | 7 |')
    // 表体每行恰好 3 个单元格（4 空格缩进的表头不计）：缺格补 []、多格截断
    const cells = out.split('\n').filter((l) => /^ {2}\[/.test(l))
    expect(cells.length).toBe(6)
    expect(out).toContain('[],')
    expect(out).not.toContain('[7]')
  })

  it('宽表（5+列）自动缩小字号、窄表不缩', () => {
    const wide = t('| a | b | c | d | e |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |')
    expect(wide).toContain('#block[#set text(size: 0.85em)')
    expect(wide.trimEnd().endsWith(']')).toBe(true)
    const narrow = t('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(narrow).not.toContain('#set text(size:')
  })

  it('HTML 表格与 GFM 表格共用列宽/断行算法（Android 文档场景）', () => {
    const html = [
      '<table>',
      '<tr><th>方法</th><th>说明</th><th>默认值</th></tr>',
      '<tr><td><code>getPollInterval()</code></td><td>获取网络统计数据的轮询间隔时间（毫秒）</td><td>30分钟</td></tr>',
      '<tr><td><code>getGlobalAlertBytes(long def)</code></td><td>获取全局网络流量警告的字节数</td><td><code>DEFAULT_PERFORM_POLL_DELAY_MS</code></td></tr>',
      '</table>',
    ].join('')
    const out = t(html)
    // 加权 fr 列宽（不再是旧的 auto + 1fr；align 的 auto 是对齐默认值，无关）
    expect(out).toMatch(/columns: \([\d.]+fr, [\d.]+fr, [\d.]+fr\),/)
    expect(out).not.toMatch(/columns: \([^)]*auto/)
    // 单元格文本插入 ZWSP（HTML 文本节点内，标签不受影响）
    expect((out.match(/\u200b/g) ?? []).length).toBeGreaterThanOrEqual(4)
    const plain = out.replace(/[\u200b\\]/g, '')
    expect(plain).toContain('DEFAULT_PERFORM_POLL_DELAY_MS')
    expect(plain).toContain('getGlobalAlertBytes(long def)')
  })

  it('含不可断长 token 的列宽兜底（方法名/常量列不被裁断）', () => {
    // 复现：方法名列 + 中文说明列 + 常量默认值列（API 文档常见形态）
    const out = t(
      '| 方法 | 说明 | 默认值 |\n' +
      '|---|---|---|\n' +
      '| getPollInterval() | 获取轮询间隔时间 | 30分钟 |\n' +
      '| getGlobalAlertBytes(long def) | 获取全局流量警告字节数 | DEFAULT_PERFORM_POLL_DELAY_MS |',
    )
    const m = out.match(/columns: \(([\d.]+)fr, ([\d.]+)fr, ([\d.]+)fr\),/)
    expect(m).not.toBeNull()
    if (m) {
      const [w1, w2, w3] = [Number(m[1]), Number(m[2]), Number(m[3])]
      // 常量列最长原子 29 字符 → 权重最大；方法名列原子 24 字符 → 次之；
      // 中文说明列逐字可断 → 压缩换行占最窄
      expect(w3).toBeGreaterThan(w1)
      expect(w3).toBeGreaterThan(w2)
      expect(w1).toBeGreaterThan(w2)
    }
  })

  it('[TOC] 标记被移除（不渲染字面文本）', () => {
    const out = t('[TOC]\n\n正文内容')
    expect(out).not.toContain('TOC')
    expect(out).toContain('正文内容')
  })

  it('指令容器 → admonition', () => {
    const out = t(':::warning\n注意内容\n:::')
    expect(out).toBe('#admonition("warning")[\n注意内容\n]')
  })

  it('带标题属性的容器', () => {
    const out = t(':::note{title="自定义标题"}\n内容\n:::')
    expect(out).toContain('#admonition("note", title: "自定义标题")[')
  })

  it('GitHub callout 无标题 → admonition', () => {
    const out = t('> [!NOTE]\n> 内容')
    expect(out).toBe('#admonition("note")[\n内容\n]')
  })

  it('GitHub callout 带标题 + 多行正文', () => {
    const out = t('> [!WARNING] 注意标题\n> 第一行\n> 第二行')
    expect(out).toBe('#admonition("warning", title: "注意标题")[\n第一行\n第二行\n]')
  })

  it('GitHub callout CAUTION 映射 danger', () => {
    const out = t('> [!CAUTION]\n> 小心')
    expect(out).toBe('#admonition("caution")[\n小心\n]')
  })
})

describe('转义与降级', () => {
  it('正文特殊字符全部转义', () => {
    expect(t('特殊字符 #1: $ 与 *星号*')).toBe('特殊字符 \\#1: \\$ 与 #emph[星号]')
  })

  it('HTML 标签剥掉并保留文本内容', () => {
    const out = compileMarkdown('<div>hi</div>')
    expect(out.typst.trim()).toBe('hi')
    expect(out.warnings.some((w) => w.message.includes('HTML'))).toBe(false)
  })

  it('<br> 转为换行', () => {
    expect(t('第一行<br/>第二行')).toBe('第一行#linebreak()第二行')
    expect(t('第一行<br>第二行')).toBe('第一行#linebreak()第二行')
  })

  it('HTML <a> 链接（http/https 可点击，相对 href 渲染文本）', () => {
    expect(t('<a href="https://typst.app">官网</a>')).toBe('#link("https://typst.app")[官网]')
    expect(t('<a href="/ref/x">内部</a>')).toBe('内部')
  })

  it('HTML <code> 行内代码；嵌套 <a> 时保留链接', () => {
    expect(t('<code>onCreate()</code>')).toBe('#raw("onCreate()", block: false)')
    expect(t('<code><a href="https://d.android.com">onFinishInflate()</a></code>')).toBe(
      '#link("https://d.android.com")[onFinishInflate()]',
    )
  })

  it('HTML <b>/<i> 强调', () => {
    expect(t('<b>加粗</b>和<i>斜体</i>')).toBe('#strong[加粗]和#emph[斜体]')
  })

  it('整段 HTML 表格（含 rowspan）转为 Typst 表格', () => {
    const html = [
      '<table>',
      '  <thead><tr><th>类</th><th>方法</th></tr></thead>',
      '  <tbody>',
      '    <tr><td rowspan="2">创建</td><td>构造</td></tr>',
      '    <tr><td><a href="https://d.android.com/ref">onCreate()</a></td></tr>',
      '  </tbody>',
      '</table>',
    ].join('\n')
    const out = t(html)
    expect(out).toContain('#table(')
    expect(out).toContain('table.header(')
    // #table 内是代码模式，table.cell 调用不带 #
    expect(out).toContain('table.cell(rowspan: 2, [创建])')
    expect(out).toContain('#link("https://d.android.com/ref")[onCreate()]')
    // rowspan 使第二行第 1 列被占用：不出现独立的 [创建] 普通单元格
    expect(out).not.toContain('\n  [创建],')
  })

  it('HTML 实体解码（remark 已解码 markdown 文本中的实体；HTML 属性路径解码）', () => {
    // markdown 文本：remark 把 &amp; 解码为 &，转义输出 \&（渲染仍为 &）
    expect(t('a &amp; b')).toBe('a \\& b')
    // HTML 内链接属性：href 中的实体在 html.ts 中解码
    expect(t('<a href="https://x.com?a=1&amp;b=2">x</a>')).toBe('#link("https://x.com?a=1&b=2")[x]')
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
