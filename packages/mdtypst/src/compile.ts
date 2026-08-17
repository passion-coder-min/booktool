import type { Nodes, Root } from 'mdast'
import { escapeTypstText, typstString } from './escape'
import { slugifyHeading, uniqueSlug } from './slug'
import { latexToTypst } from './math'
import { parseMarkdown } from './parse'
import { htmlFragmentToTypst, htmlTableToTypst, parseHtmlTag, wrapHtmlContent } from './html'

export interface CompileOptions {
  /** md 中图片相对路径 → Typst 可见路径（编译管线注入） */
  resolveImage?: (url: string) => string
  /** 输出头部附加行（如 `#import "../template.typ": *`），计入行号映射 */
  preamble?: string
  /** 全局标题 label 集合（整本书合并编译时跨章节锚点解析；缺省仅本 md 内） */
  knownLabels?: Set<string>
}

export interface CompileWarning {
  message: string
  line: number
}

/** 生成的 .typ 行号 → 源 .md 行号（块级粒度） */
export interface LineMapping {
  typLine: number
  mdLine: number
}

export interface CompileOutput {
  typst: string
  mappings: LineMapping[]
  warnings: CompileWarning[]
}

/** 代码语言别名 → Typst/Syntect 名称 */
const LANG_ALIAS: Record<string, string> = {
  js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  sh: 'bash', shell: 'bash', zsh: 'bash', py: 'python', rb: 'ruby',
  yml: 'yaml', md: 'markdown', 'c++': 'cpp', golang: 'go', rust: 'rust',
}

type AnyNode = Nodes & { [k: string]: any }

export class Compiler {
  private opts: Required<Omit<CompileOptions, 'knownLabels'>> & { knownLabels?: Set<string> }
  private warnings: CompileWarning[] = []
  private mappings: LineMapping[] = []
  private slugSeen = new Map<string, number>()
  private labelSeen = new Map<string, number>()
  private labels = new Set<string>()
  private definitions = new Map<string, { url: string; title: string | null }>()
  private footnotes = new Map<string, AnyNode>()
  private depth = 0
  private offset = 0

  constructor(opts: CompileOptions = {}) {
    this.opts = {
      resolveImage: opts.resolveImage ?? ((u: string) => u),
      preamble: opts.preamble ?? '',
      knownLabels: opts.knownLabels,
    }
  }

  compile(root: Root): CompileOutput {
    this.prepass(root)
    const pre = this.opts.preamble.trimEnd() ? this.opts.preamble.trimEnd().split('\n') : []
    if (pre.length) pre.push('')
    this.offset = pre.length
    const body = this.serialize(root.children as AnyNode[])
    return {
      typst: [...pre, ...body].join('\n').trimEnd() + '\n',
      mappings: this.mappings,
      warnings: this.warnings,
    }
  }

  /** 收集链接定义、脚注定义与标题 label（锚点解析用） */
  private prepass(node: AnyNode) {
    if (node.type === 'definition') {
      this.definitions.set(node.identifier, { url: node.url, title: node.title ?? null })
    } else if (node.type === 'footnoteDefinition') {
      this.footnotes.set(node.identifier, node)
    } else if (node.type === 'heading') {
      // 独立 seen（不污染正式输出的 slugSeen）；按文档序遍历，
      // 与 serialize 阶段的唯一后缀分配结果一致
      this.labels.add(uniqueSlug(slugifyHeading(plainText(node)), this.labelSeen))
    }
    for (const child of node.children ?? []) this.prepass(child)
  }

  private warn(message: string, node?: AnyNode) {
    this.warnings.push({ message, line: node?.position?.start.line ?? 0 })
  }

  /**
   * 序列化块级节点列表：块间以空行分隔（紧凑列表除外），顶层块记录行号映射。
   */
  private serialize(nodes: AnyNode[], tight = false): string[] {
    const out: string[] = []
    for (const node of nodes) {
      const lines = this.blockToLines(node)
      if (lines.length === 0) continue
      if (out.length > 0 && !tight) out.push('')
      if (this.depth === 0) {
        this.mappings.push({ typLine: out.length + 1 + this.offset, mdLine: node.position?.start.line ?? 0 })
      }
      out.push(...lines)
    }
    return out
  }

  private blockToLines(node: AnyNode): string[] {
    switch (node.type) {
      case 'paragraph': {
        // `[TOC]` 标记（Typora/mdbook 常见）：不渲染字面文本（站点端替换为章节目录）
        if (/^\[toc\]$/i.test(plainText(node).trim())) {
          return []
        }
        // 段落仅含一张图片 → 带题注的 figure
        if (node.children.length === 1 && node.children[0].type === 'image') {
          return this.figureLines(node.children[0])
        }
        // 段落仅含一个公式（含单行 $$…$$，remark-math 解析为 inlineMath）→ 展示公式
        if (node.children.length === 1 && node.children[0].type === 'inlineMath') {
          return this.displayMath(node.children[0])
        }
        const c = this.content(node.children)
        return c ? [c] : []
      }
      case 'heading': {
        const text = plainText(node)
        const slug = uniqueSlug(slugifyHeading(text), this.slugSeen)
        const marks = '='.repeat(Math.min(node.depth, 6))
        return [`${marks} ${this.content(node.children)} <${slug}>`]
      }
      case 'thematicBreak':
        return ['#line(length: 100%)']
      case 'code': {
        const lang = (node.lang || '').trim()
        if (lang === 'mermaid') {
          this.warn('Mermaid 图未渲染（编译管线缺失），已跳过', node)
          return ['#box[(Mermaid 图未渲染)]']
        }
        const l = LANG_ALIAS[lang] ?? lang
        const params = l ? `, lang: ${typstString(l)}` : ''
        return [`#raw(${typstString(node.value)}, block: true${params})`]
      }
      case 'math': {
        return this.displayMath(node)
      }
      case 'blockquote': {
        // GitHub callout：> [!TYPE] 或 > [!TYPE] 标题 → admonition（与 ::: 容器等价）
        const kids = node.children as any[]
        const first = kids[0] as any
        if (first && first.type === 'paragraph' && first.children?.[0]?.type === 'text') {
          const t0 = String(first.children[0].value)
          // 标题须与 [!TYPE] 同处一行（仅空格/制表符分隔），换行则视为正文开始
          const m = t0.match(/^\[\s*!([A-Za-z]+)\s*\](?:[ \t]+([^\n]*))?/)
          if (m) {
            const kind = m[1].toLowerCase()
            const title = (m[2] ?? '').trim()
            const rest = t0.replace(/^\[\s*![A-Za-z]+\s*\](?:[ \t]+[^\n]*)?/, '')
            const bodyChildren: any[] = []
            const restText = rest.replace(/^\s+/, '')
            if (restText) {
              bodyChildren.push({ ...first, children: [{ ...first.children[0], value: restText }, ...first.children.slice(1)] })
              bodyChildren.push(...kids.slice(1))
            } else {
              const restFirst = first.children.slice(1)
              if (restFirst.length) bodyChildren.push({ ...first, children: restFirst })
              bodyChildren.push(...kids.slice(1))
            }
            const titleParam = title ? `, title: ${typstString(title)}` : ''
            return [`#admonition(${typstString(kind)}${titleParam})[`, ...this.serialize(bodyChildren, false), ']']
          }
        }
        return ['#quote(block: true)[', ...this.nested(node), ']']
      }
      case 'list':
        return this.listLines(node)
      case 'table':
        return this.tableLines(node)
      case 'image':
        return this.figureLines(node)
      case 'html': {
        const v = node.value ?? ''
        const trimmed = v.trim()
        if (!trimmed) return []
        // 网络抓取书常用整段 HTML 表格：解析为 Typst 表格（支持 rowspan）
        if (/^<table\b/i.test(trimmed)) {
          const lines = htmlTableToTypst(v)
          if (lines.length) return lines
        }
        const frag = htmlFragmentToTypst(v)
        return frag ? [frag] : []
      }
      case 'yaml':
      case 'definition':
      case 'footnoteDefinition':
        return []
      case 'containerDirective': {
        const title = node.attributes?.title ? `, title: ${typstString(node.attributes.title)}` : ''
        return [`#admonition(${typstString(node.name)}${title})[`, ...this.nested(node), ']']
      }
      case 'leafDirective':
        this.warn(`不支持行内指令 ::${node.name}，已跳过`, node)
        return []
      default: {
        // 兜底：按内联内容降级输出
        const c = this.content([node])
        if (c) {
          this.warn(`未处理的节点类型：${node.type}`, node)
          return [c]
        }
        return []
      }
    }
  }

  /** 展示（块级）公式：`$ … $` 两侧空格在 Typst 中表示块级 */
  private displayMath(node: AnyNode): string[] {
    const { typst, warnings } = latexToTypst(node.value)
    for (const w of warnings) this.warn(w, node)
    return [`$ ${typst} $`]
  }

  private nested(node: AnyNode, tight = false): string[] {
    this.depth++
    try {
      return this.serialize(node.children ?? [], tight)
    } finally {
      this.depth--
    }
  }

  private figureLines(img: AnyNode): string[] {
    const url = this.opts.resolveImage(img.url ?? '')
    const alt = img.alt ?? ''
    const inner = `  auto-fit-image(${typstString(url)})`
    return alt
      ? ['#figure(', `${inner},`, `  caption: [${escapeTypstText(alt)}],`, ')']
      : ['#figure(', inner, ')']
  }

  private listLines(node: AnyNode): string[] {
    const isTask = node.children.some((li: AnyNode) => li.checked !== null && li.checked !== undefined)
    const tight = !node.spread
    if (isTask) {
      const out: string[] = []
      for (const li of node.children) {
        const body = this.nested(li, tight).join('\n')
        out.push(`#task-item(${li.checked ? 'true' : 'false'})[\n${body}\n]`)
      }
      return out
    }
    if (node.ordered && node.start !== 1 && node.start !== null) {
      this.warn(`有序列表起始编号 ${node.start} 暂不支持，已从 1 开始`, node)
    }
    const marker = node.ordered ? '+' : '-'
    const out: string[] = []
    for (const li of node.children) {
      const itemLines = this.nested(li, tight)
      if (itemLines.length === 0) continue
      out.push(`${marker} ${itemLines[0]}`)
      for (let k = 1; k < itemLines.length; k++) {
        const l = itemLines[k]
        out.push(l === '' ? '' : `  ${l}`)
      }
    }
    return out
  }

  private tableLines(node: AnyNode): string[] {
    const cols = node.align?.length ?? node.children[0]?.children?.length ?? 0
    if (cols === 0) return []
    const aligns = (node.align ?? [])
      .slice(0, cols)
      .map((a: string | null) => a ?? 'auto')
      .map((a: string) => (a === 'centre' ? 'center' : a))
      .join(', ')
    const rows: AnyNode[] = node.children
    const [head, ...body] = rows
    const headerCells: string[] = head.children.map((cell: AnyNode) => `  ${this.cell(cell)}`)
    // 列宽按内容长度加权：每列取全表该列最长纯文本长度为权重（0.75 次幂压缩，
    // 避免超长列吃光整页），以 Nfr 显式分配——内容最长的列分到最宽，
    // 且所有列按比例铺满页宽（长文本在列内自然换行，不撑出页面）。
    const colSpec = this.columnSpec(node, cols)
    const out = [
      '#table(',
      `  columns: (${colSpec}),`,
      `  align: (${aligns}),`,
      '  table.header(',
      ...headerCells.map((l: string) => `  ${l},`),
      '  ),',
    ]
    for (const row of body) {
      for (const cell of row.children) {
        out.push(`  ${this.cell(cell)},`)
      }
    }
    out.push(')')
    return out
  }

  /** 加权列宽：每列权重 = max(内容长度)^0.75，输出 "2.1fr, 8.5fr, …" */
  private columnSpec(node: AnyNode, cols: number): string {
    const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/
    /** 字符串渲染宽度（单位：拉丁字符=1，中文/全角=2；行内代码等宽字体 ×1.2） */
    const units = (s: string, code: boolean): number => {
      let u = 0
      for (const ch of s) u += CJK.test(ch) ? 2 : 1
      return u * (code ? 1.2 : 1)
    }
    /** 把一段文本切成"不可再断行的原子"宽度列表：
     *  空格是天然断点；每个汉字独立成原子（中文可逐字断行）；
     *  其余连续拉丁/数字/符号串（代码标识符）为一个原子，不可断。 */
    const atomWidths = (s: string, code: boolean): number[] => {
      const out: number[] = []
      for (const w of s.split(/\s+/)) {
        if (!w) continue
        let run = ''
        for (const ch of w) {
          if (CJK.test(ch)) {
            if (run) {
              out.push(units(run, code))
              run = ''
            }
            out.push(2 * (code ? 1.2 : 1))
          } else {
            run += ch
          }
        }
        if (run) out.push(units(run, code))
      }
      return out
    }
    const desired: number[] = Array.from({ length: cols }, (): number => 0)
    const minNeed: number[] = Array.from({ length: cols }, (): number => 0)
    for (const row of node.children ?? []) {
      const cells: AnyNode[] = row.children ?? []
      for (let i = 0; i < cols; i++) {
        const segs = this.cellTextSegments(cells[i] ?? { children: [] })
        desired[i] = Math.max(desired[i], segs.reduce((sum, s) => sum + units(s.text, s.code), 0))
        for (const seg of segs) {
          for (const a of atomWidths(seg.text, seg.code)) minNeed[i] = Math.max(minNeed[i], a)
        }
      }
    }
    // 权重 = max(期望宽度^0.75, 最长原子宽度)：期望值主导比例分配，
    // 原子宽度兜底保证列宽装得下不可断的长 token（如 DEFAULT_PERFORM_POLL_DELAY_MS），
    // 否则该 token 溢出单元格被裁掉（"第一列显示不完全"）。
    const weights = desired.map((d, i) => Math.max(Math.pow(Math.max(d, 1), 0.75), minNeed[i], 1))
    const total = weights.reduce<number>((a, b) => a + b, 0)
    // 每列至少 6% 页宽，避免短列（如序号列）被压到不可读
    const minRatio = 0.06 * total
    const specs = weights.map((w) => {
      const v = Math.max(w, minRatio)
      return `${(v / total).toFixed(3)}fr`
    })
    return specs.join(', ')
  }

  /** 提取单元格的纯文本片段（递归）：text/html/code 取 value，标注是否行内代码 */
  private cellTextSegments(node: AnyNode): { text: string; code: boolean }[] {
    if (!node) return []
    if (node.type === 'text' || node.type === 'html' || node.type === 'inlineCode') {
      return [{ text: String(node.value ?? ''), code: node.type === 'inlineCode' }]
    }
    return (node.children ?? []).flatMap((c: AnyNode) => this.cellTextSegments(c))
  }

  private cell(cell: AnyNode): string {
    return `[${this.content(cell.children)}]`
  }

  // ---------------- 内联（content 模式） ----------------

  private content(nodes: AnyNode[]): string {
    interface Ctx {
      parts: string[]
      prevExpr: boolean
      hasMarkup: boolean
    }
    const root: Ctx = { parts: [], prevExpr: false, hasMarkup: false }
    const stack: ({ ctx: Ctx; name: string; href: string })[] = []
    const append = (ctx: Ctx, piece: string, isText: boolean) => {
      if (piece === '') return
      if (isText && ctx.prevExpr && /^[({]/.test(piece)) {
        // 表达式（#strong[…] 等）后紧跟 ( 或 { 会被解析为调用参数，转义首字符
        ctx.parts.push('\\' + piece)
      } else {
        ctx.parts.push(piece)
      }
      ctx.prevExpr = piece.startsWith('#')
      if (!isText) ctx.hasMarkup = true
    }
    const cur = () => (stack.length ? stack[stack.length - 1].ctx : root)
    for (const node of nodes) {
      const tag = node.type === 'html' ? parseHtmlTag(node.value ?? '') : null
      if (tag) {
        if (tag.void) {
          append(cur(), tag.name === 'br' ? '#linebreak()' : '', false)
          continue
        }
        if (!tag.isClose) {
          // 开标签：内容压栈，待匹配闭标签后封装
          stack.push({ ctx: { parts: [], prevExpr: false, hasMarkup: false }, name: tag.name, href: tag.href })
          continue
        }
        // 闭标签：弹栈并封装
        const frame = stack.pop()
        if (frame && frame.name === tag.name) {
          const inner = frame.ctx.parts.join('')
          append(cur(), wrapHtmlContent(frame.name, frame.href, inner, frame.ctx.hasMarkup), false)
        }
        continue
      }
      append(cur(), this.inline(node), node.type === 'text')
    }
    // 未闭合标签：缓冲内容直接保留
    let extra = ''
    for (const frame of stack) extra += frame.ctx.parts.join('')
    return root.parts.join('') + extra
  }

  private inline(node: AnyNode): string {
    switch (node.type) {
      case 'text':
        return escapeTypstText(node.value)
      case 'emphasis':
        return `#emph[${this.content(node.children)}]`
      case 'strong':
        return `#strong[${this.content(node.children)}]`
      case 'delete':
        return `#strike[${this.content(node.children)}]`
      case 'inlineCode':
        return `#raw(${typstString(node.value)}, block: false)`
      case 'break':
        return '#linebreak()'
      case 'inlineMath': {
        const { typst, warnings } = latexToTypst(node.value)
        for (const w of warnings) this.warn(w, node)
        return `$${typst}$`
      }
      case 'link':
        return this.linkCode(node.url, this.content(node.children), node)
      case 'linkReference': {
        const def = this.definitions.get(node.identifier)
        const c = this.content(node.children)
        if (!def) {
          this.warn(`未定义的链接引用 [${node.identifier}]`, node)
          return c
        }
        return this.linkCode(def.url, c, node)
      }
      case 'image':
        return `#image(${typstString(this.opts.resolveImage(node.url ?? ''))})`
      case 'imageReference': {
        const def = this.definitions.get(node.identifier)
        if (!def) {
          this.warn(`未定义的图片引用 [${node.identifier}]`, node)
          return ''
        }
        return `#image(${typstString(this.opts.resolveImage(def.url))})`
      }
      case 'footnoteReference': {
        const def = this.footnotes.get(node.identifier)
        if (!def) {
          this.warn(`未定义的脚注 [^${node.identifier}]`, node)
          return ''
        }
        const body = this.nested(def).join(' ')
        return `#footnote[${body}]`
      }
      case 'html':
        return htmlFragmentToTypst(node.value ?? '')
      case 'textDirective':
        return this.content(node.children ?? [])
      case 'leafDirective':
        this.warn(`不支持行内指令 :${node.name}，已跳过`, node)
        return ''
      default: {
        if (node.children) return this.content(node.children)
        if (node.value !== undefined) return escapeTypstText(String(node.value))
        return ''
      }
    }
  }

  private linkCode(url: string, text: string, node: AnyNode): string {
    // 空链接目标（如 [x]()）：Typst #link("") 会报错，降级为纯文本
    if (!url) {
      this.warn('空链接目标，已转为纯文本', node)
      return text
    }
    if (url.startsWith('#')) {
      const label = slugifyHeading(url.slice(1))
      if (!label) {
        this.warn(`无效的内部锚点 ${url}`, node)
        return text
      }
      // 悬空锚点（Typst 对不存在的 label 直接报错）：降级为纯文本。
      // 优先用整本书的全局 label 集合（跨章节锚点），缺省用本文档内 label
      if (!(this.opts.knownLabels ?? this.labels).has(label)) {
        this.warn(`锚点 ${url} 无对应标题，已转为纯文本`, node)
        return text
      }
      return `#link(<${label}>)[${text}]`
    }
    return `#link(${typstString(url)})[${text}]`
  }
}

/** 提取节点纯文本（用于 slug） */
function plainText(node: AnyNode): string {
  if (node.value !== undefined) return String(node.value)
  return (node.children ?? []).map((c: AnyNode) => plainText(c)).join('')
}

export function compileMdast(root: Root, opts?: CompileOptions): CompileOutput {
  return new Compiler(opts).compile(root)
}

/**
 * 收集 markdown 中全部标题 label（与编译阶段相同的去重后缀规则），
 * 供整本书合并编译时做跨章节锚点解析（knownLabels）。
 */
export function collectHeadingLabels(md: string): Set<string> {
  const root = parseMarkdown(md)
  const seen = new Map<string, number>()
  const labels = new Set<string>()
  const walk = (node: any) => {
    if (node?.type === 'heading') {
      labels.add(uniqueSlug(slugifyHeading(plainText(node)), seen))
    }
    for (const child of node?.children ?? []) walk(child)
  }
  walk(root)
  return labels
}
