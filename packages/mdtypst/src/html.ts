import { escapeTypstText, typstString } from './escape'

/**
 * 原生 HTML 处理（网络抓取的书常见）：把 HTML 片段转成 Typst content。
 * 支持常见标签——br→换行、wbr/hr→跳过、a→链接（http/https/mailto 才可点击）、
 * code→行内代码、b/strong/i/em→强调；未知标签剥掉但保留文本内容。
 */

const VOID_TAGS = new Set(['br', 'wbr', 'hr', 'img', 'meta', 'link', 'input'])
/** 未知标签：保留其中文本即可 */
const STRIP_TAGS = new Set(['p', 'div', 'span', 'td', 'th', 'tr', 'table', 'thead', 'tbody', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'section', 'article', 'header', 'footer', 'main', 'form', 'label', 'blockquote'])

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 剥掉全部标签、解码实体，得到纯文本（code 内联代码用） */
export function htmlToPlainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
}

/** HTML 片段 → Typst content（返回可为空字符串） */
export function htmlFragmentToTypst(html: string): string {  let out = ''
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      out += escapeTypstText(decodeEntities(html.slice(i)))
      break
    }
    out += escapeTypstText(decodeEntities(html.slice(i, lt)))
    const gt = html.indexOf('>', lt)
    if (gt === -1) {
      // 未闭合的 '<'，按文本处理
      out += escapeTypstText(decodeEntities(html.slice(lt)))
      break
    }
    const tagText = html.slice(lt + 1, gt).trim()
    if (tagText.startsWith('/') || tagText.startsWith('!')) {
      // 孤立闭合标签或注释
      i = gt + 1
      continue
    }
    const name = tagText.split(/[\s/]+/)[0].toLowerCase()
    if (!name) {
      i = gt + 1
      continue
    }
    if (VOID_TAGS.has(name)) {
      if (name === 'br') out += '#linebreak()'
      i = gt + 1
      continue
    }
    // 配对标签：找最近匹配的闭合标签
    const ci = html.toLowerCase().indexOf(`</${name}`, gt + 1)
    if (ci === -1) {
      // 未闭合：剥掉开标签，内容按后续文本继续处理
      i = gt + 1
      continue
    }
    const inner = html.slice(gt + 1, ci)
    const innerTyp = htmlFragmentToTypst(inner)
    i = html.indexOf('>', ci) + 1
    switch (name) {
      case 'a': {
        const href = /href\s*=\s*["']([^"']*)["']/i.exec(tagText)?.[1] ?? ''
        if (/^(https?:|mailto:)/i.test(href)) out += `#link(${typstString(href)})[${innerTyp}]`
        else out += innerTyp // 相对/未知协议：渲染文本，避免无效链接
        break
      }
      case 'code':
        // 含嵌套标签（如 <code><a>…</a></code>）时保留内层结构（链接），否则按行内代码
        out += inner.includes('<') ? innerTyp : `#raw(${typstString(htmlToPlainText(inner))}, block: false)`
        break
      case 'b':
      case 'strong':
        out += `#strong[${innerTyp}]`
        break
      case 'i':
      case 'em':
        out += `#emph[${innerTyp}]`
        break
      default:
        out += STRIP_TAGS.has(name) ? innerTyp : innerTyp
    }
  }
  return out
}

interface HtmlTableCell {
  text: string
  rowspan: number
  colspan: number
  isHead: boolean
}

/**
 * HTML <table> → Typst #table 行序列（支持 rowspan/colspan）。
 * 复用 markdown 表格的输出格式，可被 tableLines 同级渲染。
 */
export function htmlTableToTypst(html: string): string[] {
  const rows: HtmlTableCell[][] = []
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = trRe.exec(html))) {
    const cells: HtmlTableCell[] = []
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(m[1]))) {
      const attrs = cm[2]
      const rs = /rowspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1] ?? '1'
      const cs = /colspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1] ?? '1'
      cells.push({ text: cm[3], rowspan: +rs || 1, colspan: +cs || 1, isHead: cm[1] === 'th' })
    }
    if (cells.length) rows.push(cells)
  }
  if (rows.length === 0) return []

  // 布局：occupancy[c] 表示第 c 列被上方 rowspan 覆盖的剩余行数
  const occupancy: number[] = []
  const layout: { row: number; col: number; cell: HtmlTableCell }[] = []
  let colCount = 0
  rows.forEach((row, r) => {
    let c = 0
    for (const cell of row) {
      while ((occupancy[c] ?? 0) > 0) c++
      layout.push({ row: r, col: c, cell })
      for (let k = 0; k < cell.colspan; k++) occupancy[c + k] = Math.max(occupancy[c + k] ?? 0, cell.rowspan)
      c += cell.colspan
      colCount = Math.max(colCount, c)
    }
    for (let k = 0; k < occupancy.length; k++) if ((occupancy[k] ?? 0) > 0) occupancy[k]--
  })
  if (colCount === 0) return []

  const out = [
    '#table(',
    `  columns: (${Array.from({ length: colCount }, () => 'auto').join(', ')}),`,
    `  align: (${Array.from({ length: colCount }, () => 'auto').join(', ')}),`,
  ]
  // 头部行（连续以 <th> 开头的行）
  let hi = 0
  while (hi < rows.length && rows[hi][0]?.isHead) hi++
  if (hi > 0) {
    for (let r = 0; r < hi; r++) {
      out.push('  table.header(')
      for (const cell of rows[r]) out.push(`    ${spanCell(cell)},`)
      out.push('  ),')
    }
  }
  for (let r = hi; r < rows.length; r++) {
    for (const cell of rows[r]) out.push(`  ${spanCell(cell)},`)
  }
  out.push(')')
  return out
}

function spanCell(cell: HtmlTableCell): string {
  const content = htmlFragmentToTypst(cell.text)
  if (cell.rowspan > 1 || cell.colspan > 1) {
    const params = [`rowspan: ${cell.rowspan}`]
    if (cell.colspan > 1) params.push(`colspan: ${cell.colspan}`)
    // #table(…) 内是代码模式：table.cell 调用不带 #
    return `table.cell(${params.join(', ')}, [${content}])`
  }
  return `[${content}]`
}

export interface ParsedHtmlTag {
  name: string
  isClose: boolean
  /** 自闭合 / void 标签（br/wbr/hr 等），无需配对 */
  void: boolean
  href: string
}

const INLINE_VOID_TAGS = new Set(['br', 'wbr', 'hr', 'img', 'meta', 'link', 'input'])

/**
 * 解析单个行内 HTML 标签（CommonMark 会把 <a …>、</a>、中间文本拆成独立
 * mdast html/text 节点，因此行内处理按开/闭标签配对，而非整段元素）。
 */
export function parseHtmlTag(s: string): ParsedHtmlTag | null {
  const t = s.trim()
  if (!t.startsWith('<')) return null
  const body = t.slice(1)
  if (body.startsWith('!') || body.startsWith('?')) return null // 注释/处理指令
  const isClose = body.startsWith('/')
  const rest = (isClose ? body.slice(1) : body).trim()
  const m = rest.match(/^([a-zA-Z][a-zA-Z0-9]*)/)
  if (!m) return null
  const name = m[1].toLowerCase()
  const attrs = rest.slice(m[0].length)
  const selfClose = /\/\s*>$/.test(t)
  return {
    name,
    isClose,
    void: selfClose || INLINE_VOID_TAGS.has(name),
    href: /href\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '',
  }
}

/** 反转 escapeTypstText 的转义（反斜杠+字符 → 字符），用于提取行内 code 纯文本 */
const UNESCAPE = /\\([#$%&*_`[\]<>@'"~\-+=/^|\\])/g

/**
 * 把配对标签内的 content 内容封装为 Typst（a→链接、code→行内代码、
 * b/strong→加粗、i/em→斜体）。hasMarkup 表示内层含非纯文本节点。
 */
export function wrapHtmlContent(name: string, href: string, inner: string, hasMarkup: boolean): string {
  switch (name) {
    case 'a':
      return /^(https?:|mailto:)/i.test(href) ? `#link(${typstString(decodeEntities(href))})[${inner}]` : inner
    case 'code':
      if (hasMarkup) return inner
      return `#raw(${typstString(htmlToPlainText(inner.replace(UNESCAPE, '$1')))}, block: false)`
    case 'b':
    case 'strong':
      return `#strong[${inner}]`
    case 'i':
    case 'em':
      return `#emph[${inner}]`
    default:
      return inner
  }
}
