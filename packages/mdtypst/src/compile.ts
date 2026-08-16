import type { Nodes, Root } from 'mdast'
import { escapeTypstText, typstString } from './escape'
import { slugifyHeading, uniqueSlug } from './slug'
import { latexToTypst } from './math'

export interface CompileOptions {
  /** md 中图片相对路径 → Typst 可见路径（编译管线注入） */
  resolveImage?: (url: string) => string
  /** 输出头部附加行（如 `#import "../template.typ": *`），计入行号映射 */
  preamble?: string
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
  private opts: Required<CompileOptions>
  private warnings: CompileWarning[] = []
  private mappings: LineMapping[] = []
  private slugSeen = new Map<string, number>()
  private definitions = new Map<string, { url: string; title: string | null }>()
  private footnotes = new Map<string, AnyNode>()
  private depth = 0
  private offset = 0

  constructor(opts: CompileOptions = {}) {
    this.opts = {
      resolveImage: opts.resolveImage ?? ((u: string) => u),
      preamble: opts.preamble ?? '',
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

  /** 收集链接定义与脚注定义 */
  private prepass(node: AnyNode) {
    if (node.type === 'definition') {
      this.definitions.set(node.identifier, { url: node.url, title: node.title ?? null })
    } else if (node.type === 'footnoteDefinition') {
      this.footnotes.set(node.identifier, node)
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
      case 'blockquote':
        return ['#quote(block: true)[', ...this.nested(node), ']']
      case 'list':
        return this.listLines(node)
      case 'table':
        return this.tableLines(node)
      case 'image':
        return this.figureLines(node)
      case 'html':
        this.warn('不支持原生 HTML，已忽略', node)
        return []
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
    // auto 列宽按内容自适应（columns: N 会强制均分）
    const colSpec = Array.from({ length: cols }, () => 'auto').join(', ')
    const out = [
      '#table(',
      `  columns: (${colSpec}),`,
      `  align: (${aligns}),`,
      `  table.header(`,
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

  private cell(cell: AnyNode): string {
    return `[${this.content(cell.children)}]`
  }

  // ---------------- 内联（content 模式） ----------------

  private content(nodes: AnyNode[]): string {
    let out = ''
    for (const node of nodes) out += this.inline(node)
    return out
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
        this.warn('不支持原生 HTML，已忽略', node)
        return ''
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
    if (url.startsWith('#')) {
      const label = slugifyHeading(url.slice(1))
      if (!label) {
        this.warn(`无效的内部锚点 ${url}`, node)
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
