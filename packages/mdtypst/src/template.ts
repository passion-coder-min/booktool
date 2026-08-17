/**
 * Typst 模板生成。
 *
 * 注意：Typst 的 set/show 规则是词法作用域——写在被 include 的文件里
 * 不会作用于 include 之后的内容。因此全部样式必须直接生成在 main.typ
 * 顶部；template.typ 仅承载跨章节共享的函数（经 #import 引入）。
 */

export interface TemplateChapter {
  /** 相对 main.typ 的路径，如 chapters/ch-00-intro.typ */
  file: string
}

export interface TemplateOptions {
  title: string
  authors: string[]
  chapters: TemplateChapter[]
}

/** 共享函数库（build/template.typ）：章节经 `#import "../template.typ": *` 使用 */
export function renderTemplate(): string {
  return `// ---- BookTool 共享函数（样式见 main.typ；set/show 不跨 include 生效）----

// 图片自适应：SVG 矢量图放大填满页面可用宽/高（放大不失真，避免过小）；
// 位图只缩小不放大（放大会模糊失真），永不溢出分页。
// 嵌入用 image(src, width:) 仅指定宽度、高度由固有宽高比推出——不用 scale()：
// Typst 0.15.1 的 PDF 后端对 scale() 包裹的 SVG 会额外再乘一层缩放，导致矢量图
// 在 PDF 里被缩成很小（如 Android 启动流程图本应 ~470pt 满行宽，实际只 ~104pt）。
#let auto-fit-image(src) = layout(size => {
  let img = image(src)
  let m = measure(img)
  // 注意：必须用 type(src) == str（无引号）。type(src) == "str" 在 Typst 里恒为
  // false，会导致 is-svg 永远不成立、SVG 被当位图套 1.0 上限而无法放大。
  let is-svg = type(src) == str and src.ends-with(".svg")
  let f = if is-svg {
    calc.min((size.height - 60pt) / m.height, size.width / m.width)
  } else {
    calc.min(1.0, (size.height - 60pt) / m.height, size.width / m.width)
  }
  align(center, image(src, width: m.width * f))
})

// 提示容器（:::note/tip/warning/danger）
#let admonition(kind, title: auto, body) = {
  let cfg = (
    "note": (accent: rgb("#4a90d9"), label: "备注"),
    "tip": (accent: rgb("#2e9e5b"), label: "提示"),
    "warning": (accent: rgb("#e0a030"), label: "注意"),
    "danger": (accent: rgb("#d94a4a"), label: "警告"),
    "caution": (accent: rgb("#d94a4a"), label: "警告"),
    "important": (accent: rgb("#8250df"), label: "重要"),
  )
  let c = cfg.at(kind, default: (accent: rgb("#7a8ba0"), label: kind))
  let t = if title == auto { c.label } else { title }
  block(width: 100%, breakable: true, stroke: (left: 3pt + c.accent), fill: c.accent.lighten(94%), inset: (x: 10pt, y: 8pt), radius: (right: 4pt))[
    #text(fill: c.accent, weight: "bold", size: 0.92em)[#t]
    #v(0.35em)
    #body
  ]
}

// 任务清单条目
#let task-item(checked, body) = grid(
  columns: (1.5em, 1fr),
  column-gutter: 0.35em,
  align: (top, top),
  if checked {
    square(size: 0.75em, stroke: 0.6pt + luma(120), fill: luma(90))[#align(center)[#text(fill: white, size: 0.55em)[✓]]]
  } else {
    square(size: 0.75em, stroke: 0.6pt + luma(120), fill: white)[]
  },
  body,
)
`
}

/** 主文件（build/main.typ）：样式 + 封面 + 目录 + 章节引用 */
export function renderMainTypst(opts: TemplateOptions): string {
  const authors = opts.authors.length ? opts.authors : ['佚名']
  const includes = opts.chapters
    .map((c) => `#include ${JSON.stringify(c.file)}`)
    .join('\n')
  // 尾逗号保证单元素也是数组（Typst 的 ("x") 是字符串）
  const authorsLit = `(${authors.map((a) => JSON.stringify(a)).join(', ')},)`
  return `// ---- 由 BookTool 生成 ----
#let book-title = ${JSON.stringify(opts.title)}
#let book-authors = ${authorsLit}

#import "template.typ": auto-fit-image, admonition, task-item

#set document(title: book-title, author: book-authors.join(", "))
#set page(
  paper: "a4",
  margin: (top: 2.4cm, bottom: 2.6cm, x: 2.2cm),
  header: context align(right)[#text(size: 8.5pt, fill: luma(140))[#book-title]],
  footer: context align(center)[#text(size: 9pt, fill: luma(120))[#counter(page).display("1")]],
)

// ---- 中英混排核心 ----
#set text(
  font: ("Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", "WenQuanYi Micro Hei", "Noto Sans", "DejaVu Sans"),
  lang: "zh", region: "cn", size: 10.5pt, cjk-latin-spacing: auto,
)
#set par(justify: true, leading: 1em, spacing: 1.15em)
// 中文强调不用斜体（CJK 字体普遍无斜体变体，回退会命中楷体类艺术字）
#show emph: it => text(weight: 600, it.body)

// ---- 标题 ----
#set heading(numbering: "1.1")
#show heading.where(level: 1): it => { pagebreak(weak: true); it }

// ---- 代码 ----
// 中文注释/字符串需 CJK 兜底，否则全系统回退可能命中艺术字体
#show raw: set text(font: ("JetBrains Mono", "Fira Code", "DejaVu Sans Mono", "Consolas", "Noto Sans SC", "WenQuanYi Micro Hei Mono"), size: 0.9em)
#show raw.where(block: true): it => block(width: 100%, fill: luma(246), inset: 8pt, radius: 4pt, breakable: true, it)

// ---- 引用 ----
#show quote: it => block(width: 100%, fill: luma(248), inset: (x: 10pt, y: 8pt), stroke: (left: 2pt + luma(180)), radius: (right: 4pt), it)

// ---- 表格：行边界自动跨页断行，表头（table.header）跨页重复 ----
#set table(stroke: 0.5pt + luma(170), inset: (x: 7pt, y: 5.5pt))
#show table.cell.where(y: 0): set text(weight: "bold")

// ---- 图表 ----
#set figure(numbering: "1", supplement: [图])
#show figure.caption: set text(size: 0.9em, fill: luma(90))

// ---- 封面 ----
#align(center)[
  #v(4cm)
  #text(size: 26pt, weight: "bold")[#book-title]
  #v(0.9cm)
  #text(size: 13pt, fill: luma(100))[#book-authors.join("　·　")]
  #v(0.5cm)
  #text(size: 10.5pt, fill: luma(130))[#datetime.today().display("[year] 年 [month] 月 [day] 日")]
]
#pagebreak()

// ---- 目录 ----
#outline(title: [目录], depth: 2)
#pagebreak()

// ---- 正文 ----
${includes}
`
}
