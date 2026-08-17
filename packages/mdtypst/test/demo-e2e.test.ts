/**
 * 端到端验证：示例书籍 → mdtypst → mmdc(Mermaid) → 真实 Typst → PDF。
 * 环境（.tools/typst 或 PATH 上的 typst、mmdc）缺失时跳过。
 */
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname, relative, basename, extname } from 'node:path'
import { compileMarkdown, renderMainTypst, renderTemplate, collectHeadingLabels, type LineMapping } from '../src/index'

const repoRoot = join(__dirname, '../../..')
const bookDir = join(repoRoot, 'examples', 'demo-book')
const typstBin = join(repoRoot, '.tools', 'typst')

function findTypst(): string | null {
  if (existsSync(typstBin)) return typstBin
  const r = spawnSync('typst', ['--version'], { encoding: 'utf8', timeout: 5000 })
  return r.status === 0 ? 'typst' : null
}

function findMmdc(): boolean {
  const r = spawnSync('mmdc', ['--version'], { encoding: 'utf8', timeout: 20000 })
  return r.status === 0
}

const chapters: { file: string; content: string }[] = [
  {
    file: 'chapter-1.md',
    content: `# 欢迎

BookTool 是一个**本地优先**的知识出版与工作管理工具：左手 \`Markdown\` 书籍，右手任务与日历。

## 它解决什么问题

1. mdBook / GitBook 的 PDF 排版质量不足，尤其中文
2. 中英文混排时西文撑开行高
3. 技术书籍需要 Mermaid 图与数学公式

:::tip{title="30 秒上手"}
打开右侧章节 → 编辑 → 点击「编译 PDF」。首次编译会自动下载 Typst 编译器。
:::

> 好的工具应该让你忘记工具本身，专注于内容。

这是脚注示例[^note1]，还有[内部链接](#排版能力)与[外部链接](https://typst.app)。

[^note1]: 这是脚注内容，支持 *强调* 与 \`code\`。
`,
  },
  {
    file: 'chapter-2.md',
    content: `# 排版能力

## 中英文混排

本段验证 CJK 与 Latin 的混排：使用 Noto Sans SC 与 Noto Sans 字体，西文自动缩小至 0.85em（例如 English text、数字 2026、标点 like this one）而不撑开行高。两端对齐让版面接近 LaTeX 的观感。

## 数学公式

质能方程 $E=mc^2$ 与欧拉公式 $e^{i\\pi} + 1 = 0$：

$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$

求和极限与集合：

$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}, \\quad \\lim_{x \\to 0} \\frac{\\sin x}{x} = 1, \\quad x \\in \\mathbb{R}$$

矩阵与分段函数：

$$A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}, \\quad f(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases}$$

对齐环境与希腊字母：

$$\\begin{aligned} \\nabla \\cdot \\mathbf{E} &= \\rho / \\epsilon_0 \\\\ \\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} \\end{aligned}$$

## 表格

| 特性 | mdBook | BookTool |
|---|:-:|--:|
| PDF 质量 | 一般 | 优秀 |
| 中英混排优化 | ✗ | ✓ |
| Mermaid 图表 | 插件 | 内建 |
| 数学公式 | MathJax | Typst 原生 |

## API 长标识符表格（断行与列宽回归）

| 方法 | 说明 | 值 |
|---|---|---|
| \`getPollInterval()\` | 获取网络统计数据的轮询间隔时间（毫秒） | 30分钟 |
| \`getPollDelay()\` | 获取执行轮询的延迟时间（毫秒） | \`DEFAULT_PERFORM_POLL_DELAY_MS\` |
| \`getGlobalAlertBytes(long def)\` | 获取全局网络流量警告的字节数，若未设置则返回默认值 | 传入的默认值 def |
| \`getSampleEnabled()\` | 获取是否启用采样功能, 主要用于上层跟踪 | true |

含不可断长 token（代码标识符/常量）的表格：列宽按 min-content 兜底分配，
超宽时在零宽断行点（下划线/驼峰边界）折行，不溢出单元格、不与相邻列重叠。

## logcat 行格式（7 列宽表缩字号）

| 日期 | 时间 | PID | TID | 级别 | 标签 | 消息 |
|---|---|---|---|---|---|---|
| 08-17 | 11:23:45.123 | 12345 | 678 | V | ActivityManager | Schedule background network policy check for uid=10123 |
| 08-17 | 11:23:46.001 | 12345 | 678 | D | NetworkPolicy | isLoggable POLICY_REJECT_METERED_BACKGROUND uid=10123 |
| 08-17 | 11:24:02.345 | 12346 | 980 | W | TrafficStats | getGlobalAlertBytes DEFAULT_PERFORM_POLL_DELAY_MS exceeded |

## 网络策略 API（HTML 表格，Android 文档抓取形态）

<table>
<tr><th>方法</th><th>说明</th><th>默认值</th></tr>
<tr><td><code>getPollInterval()</code></td><td>获取网络统计数据的轮询间隔时间（毫秒）</td><td>30分钟</td></tr>
<tr><td><code>getPollDelay()</code></td><td>获取执行轮询的延迟时间（毫秒）</td><td><code>DEFAULT_PERFORM_POLL_DELAY_MS</code></td></tr>
<tr><td><code>getGlobalAlertBytes(long def)</code></td><td>获取全局网络流量警告的字节数，若未设置则返回默认值</td><td>传入的默认值 def</td></tr>
<tr><td><code>getSampleEnabled()</code></td><td>获取是否启用采样功能, 主要用于上层跟踪</td><td>true</td></tr>
</table>

HTML 表格与 GFM 表格共用同一套列宽（min/max 加权）与 ZWSP 断行算法。

## 缺格 HTML 表格（抓取常见，验证不错位）

<table>
<tr><th>状态</th><th>number</th><th>说明</th></tr>
<tr><td>ACTIVE</td><td>ro</td></tr>
<tr><td>IDLE</td><td>42</td><td>空闲态，连接池保留 number 条</td></tr>
</table>

第 1 行缺"说明"格：应补空单元格而不是把下一行内容错位填入。

## 删除线与任务

~~旧方案已废弃~~。本周计划：

- [x] 完成编译器核心
- [x] 模板与字体
- [ ] 多版本管理

有序步骤：

1. 解析 Markdown
2. 转换 Typst
3. 编译 PDF
`,
  },
  {
    file: 'chapter-3.md',
    content: `# 图表与工作流

## 架构图（Mermaid）

\`\`\`mermaid
graph LR
    A[Markdown 源文件] --> B[remark 解析]
    B --> C{包含 Mermaid?}
    C -- 是 --> D[mmdc 渲染 SVG]
    C -- 否 --> E[mdtypst 编译]
    D --> E
    E --> F[Typst 生成 PDF]
\`\`\`

## 时序图

\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    participant E as Electron
    participant T as Typst CLI
    U->>E: 点击编译
    E->>T: typst compile
    T-->>E: book.pdf
    E-->>U: 预览 + 诊断
\`\`\`

## 代码高亮（含中文注释与全角省略号）

\`\`\`ts
// 编译入口：中文注释不应触发艺术字回退
const compile = async (book: Book) => {
  console.log(\`编译 \${book.title} …\`)
  return true
}
\`\`\`

## 警告容器

:::warning
Typst 语法错误会在诊断面板显示，并映射回 Markdown 源文件行号。
:::

:::danger{title="破坏性操作"}
删除 build 目录会清空 Mermaid 缓存，首次编译将重新渲染。
:::
`,
  },
  {
    file: 'chapter-4.md',
    content: `# 长表格跨页测试

| 序号 | 特性 | 状态 | 负责人 | 备注 |
|:-:|---|:-:|---|---|
${Array.from({ length: 40 }, (_, i) => `| ${i + 1} | 功能项 ${i + 1} ${i % 3 === 0 ? '（跨页长内容验证，这一列文字较长以撑宽单元格）' : ''} | ${i % 2 ? '✓' : '…'} | 成员${(i % 5) + 1} | 备注内容 ${i + 1} |`).join('\n')}

表格应在行边界自动断页，且表头在每一页重复出现。
`,
  },
  {
    file: 'chapter-5.md',
    content: `# 图片缩放与字体试金石

## 超高图片（600×2400）自动缩放

![纵向流程长图](tall.svg)

上图原始高度超过一页，应被等比缩小到单页可见，不截断、不分页。

## 字体试金石

- **粗体**：中文粗体应为 Noto Sans SC Bold，而非 Black 超粗
- *强调*：中文强调为半粗体（不出现楷体/艺术字）
- 常规文字与 \`code 内中文注释\` 的字体均应为 Noto Sans SC
- 西文 quick brown fox 0123 与中文混排，西文 0.85em

:::warning
本页用于验证字体回退不再命中系统艺术字体。
:::
`,
  },
]

describe('端到端：示例书籍编译 PDF', { timeout: 240_000 }, () => {
  const typst = findTypst()
  const mmdc = findMmdc()

  it('生成 PDF 并校验诊断为空', async () => {
    if (!typst) return console.warn('跳过：未找到 typst 二进制')
    if (!mmdc) return console.warn('跳过：未找到 mmdc')

    const srcDir = join(bookDir, 'src')
    const buildDir = join(bookDir, 'build')
    const chaptersDir = join(buildDir, 'chapters')
    const assetsDir = join(buildDir, 'assets')
    for (const d of [srcDir, buildDir, chaptersDir, assetsDir]) mkdirSync(d, { recursive: true })
    writeFileSync(join(bookDir, 'book.toml'), `[book]\ntitle = "BookTool 演示手册"\nauthors = ["BookTool"]\n`)
    writeFileSync(
      join(srcDir, 'SUMMARY.md'),
      `[前言](chapter-1.md)\n\n# 基础篇\n\n- [排版能力一览](chapter-2.md)\n- [图表与工作流](chapter-3.md)\n\n# 测试篇\n\n- [长表格跨页](chapter-4.md)\n- [图片缩放与字体试金石](chapter-5.md)\n`,
    )
    for (const ch of chapters) writeFileSync(join(srcDir, ch.file), ch.content)
    // 高图测试资产：600×2400 SVG
    writeFileSync(
      join(srcDir, 'tall.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="2400" viewBox="0 0 600 2400"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a90d9"/><stop offset="1" stop-color="#2e5e8c"/></linearGradient></defs><rect width="600" height="2400" fill="url(#g)"/>${Array.from({ length: 12 }, (_, i) => `<text x="60" y="${140 + i * 180}" fill="#fff" font-size="36" font-family="Noto Sans SC">步骤 ${i + 1}：纵向流程节点</text><rect x="60" y="${160 + i * 180}" width="480" height="80" fill="none" stroke="#fff" stroke-width="2" rx="8"/>${i < 11 ? `<line x1="300" y1="${240 + i * 180}" x2="300" y2="${340 + i * 180}" stroke="#fff" stroke-width="2"/>` : ''}`).join('')}</svg>`,
    )

    // 逐章编译
    const diagrams = new Map<string, string>()
    const builds: { typFile: string; mappings: LineMapping[] }[] = []
    const warnings: string[] = []
    // 全书合并为同一文档，跨章节锚点须全局解析（与 compileBook 一致）
    const globalLabels = new Set<string>()
    for (const ch of chapters) {
      for (const l of collectHeadingLabels(readFileSync(join(srcDir, ch.file), 'utf8'))) globalLabels.add(l)
    }
    chapters.forEach((ch, idx) => {
      const md = readFileSync(join(srcDir, ch.file), 'utf8')
      const out = compileMarkdown(md, {
        preamble: '#import "../template.typ": *',
        knownLabels: globalLabels,
        resolveImage: (url) => {
          // root 绝对路径：auto-fit-image 位于 template.typ，须与所在文件无关
          if (url.startsWith('mermaid:')) return `/build/assets/mermaid-${url.slice(8)}.svg`
          if (/^(https?:|data:)/.test(url)) return url
          return '/' + relative(bookDir, join(srcDir, dirname(ch.file), url))
        },
      })
      for (const d of out.diagrams) diagrams.set(d.hash, d.code)
      for (const w of out.warnings) warnings.push(`${ch.file}:${w.line} ${w.message}`)
      const typFile = `ch-${String(idx).padStart(2, '0')}-${basename(ch.file, extname(ch.file))}.typ`
      writeFileSync(join(chaptersDir, typFile), out.typst)
      builds.push({ typFile, mappings: out.mappings })
    })
    expect(warnings).toEqual([])

    // Mermaid 渲染
    for (const [hash, code] of diagrams) {
      const svg = join(assetsDir, `mermaid-${hash}.svg`)
      if (existsSync(svg)) continue
      const inFile = join(assetsDir, `in-${hash}.mmd`)
      writeFileSync(inFile, code)
      const r = spawnSync(
        'mmdc',
        ['-i', inFile, '-o', svg, '-b', 'white', '-p', join(repoRoot, 'scripts', 'puppeteer.json'), '-c', join(repoRoot, 'scripts', 'mermaid.json')],
        { encoding: 'utf8', timeout: 60_000 },
      )
      if (!existsSync(svg)) throw new Error('Mermaid 渲染失败：' + (r.stderr || '').slice(0, 600))
    }

    // main.typ + template.typ
    writeFileSync(join(buildDir, 'template.typ'), renderTemplate())
    writeFileSync(
      join(buildDir, 'main.typ'),
      renderMainTypst({
        title: 'BookTool 演示手册',
        authors: ['BookTool'],
        chapters: builds.map((b) => ({ file: `chapters/${b.typFile}` })),
      }),
    )
    mkdirSync(join(bookDir, 'output'), { recursive: true })
    const fontsDir = join(repoRoot, 'apps', 'desktop', 'resources', 'fonts')
    const fontArgs = existsSync(fontsDir) ? ['--font-path', fontsDir] : []
    const r = spawnSync(
      typst,
      ['compile', ...fontArgs, '--root', bookDir, 'build/main.typ', 'output/book.pdf'],
      {
        cwd: bookDir,
        encoding: 'utf8',
        timeout: 120_000,
      },
    )
    if (r.status !== 0) {
      throw new Error(`Typst 编译失败：\n${r.stdout}\n${r.stderr}`)
    }
    const pdf = join(bookDir, 'output', 'book.pdf')
    expect(existsSync(pdf)).toBe(true)
    expect(statSync(pdf).size).toBeGreaterThan(10_000)

    // 客观重叠检测：提取 PDF 全部词的包围盒，同一行内水平相交 >1pt 即为
    // 文字重叠（溢出单元格画到相邻列）。本章含 7 列宽表 / 长常量 API 表 /
    // HTML 抓取表 / 缺格表，全部应零重叠。
    const pdftotext = spawnSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf-8', timeout: 60_000 })
    expect(pdftotext.status).toBe(0)
    const overlaps: string[] = []
    if (pdftotext.status === 0 && pdftotext.stdout) {
      const pageRe = /<page[^>]*>([\s\S]*?)<\/page>/g
      const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g
      let pm: RegExpExecArray | null
      while ((pm = pageRe.exec(pdftotext.stdout))) {
        const words: [number, number, number, number, string][] = []
        let wm: RegExpExecArray | null
        while ((wm = wordRe.exec(pm[1]))) {
          words.push([+wm[1], +wm[2], +wm[3], +wm[4], wm[5]])
        }
        words.sort((a, b) => a[1] - b[1] || a[0] - b[0])
        for (let i = 0; i < words.length; i++) {
          for (let j = i + 1; j < words.length; j++) {
            const a = words[i]!, b = words[j]!
            const ay = (a[1] + a[3]) / 2
            const by = (b[1] + b[3]) / 2
            if (by - ay > 4) break // 已按 y 排序，后续不再同行
            if (Math.abs(ay - by) > 4) continue
            const ov = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
            if (ov > 1) overlaps.push(`「${a[4]}」×「${b[4]}」 ${ov.toFixed(1)}pt`)
          }
        }
      }
    }
    expect(overlaps, `PDF 存在文字重叠：\n${overlaps.join('\n')}`).toEqual([])
  })
})
