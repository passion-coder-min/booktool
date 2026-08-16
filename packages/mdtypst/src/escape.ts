/**
 * Typst 标记模式（markup）转义。
 *
 * Typst 标记模式中具有特殊含义、需要反斜杠转义的字符集合。
 * `- + = /` 仅在行首特殊（列表/术语/标题），统一转义以简化实现；
 * Typst 的 `\c`（反斜杠+任意字符）一律输出该字符本身，因此多转义是安全的。
 */
const MARKUP_ESCAPE = new Set([
  '#', '$', '%', '&', '*', '_', '`', '\\', '[', ']', '<', '>', '@',
  "'", '"', '~', '-', '+', '=', '/', '^', '|',
])

/** 标记模式正文转义（text 节点、标题、单元格等） */
export function escapeTypstText(text: string): string {
  let out = ''
  for (const ch of text) {
    if (MARKUP_ESCAPE.has(ch)) out += '\\' + ch
    else out += ch
  }
  return out
}

/** Typst 代码模式字符串字面量转义（#raw("...")、#link("...") 等） */
export function escapeTypstString(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/** 生成 Typst 字符串字面量（含引号） */
export function typstString(text: string): string {
  return `"${escapeTypstString(text)}"`
}
