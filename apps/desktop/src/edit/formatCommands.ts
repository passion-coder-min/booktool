/**
 * 格式命令总线：工具栏、快捷键、菜单共用。
 * EditorHandle 由两种编辑器（CodeMirror/Vditor）各自实现。
 */

export type FormatCmd =
  | { type: 'heading'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'link' }
  | { type: 'codeblock'; lang?: string }
  | { type: 'inlineCode' }
  | { type: 'mathBlock' }
  | { type: 'mathInline' }
  | { type: 'table'; rows: number; cols: number }
  | { type: 'image'; path?: string; alt?: string }
  | { type: 'admonition'; kind: string; title?: string }
  | { type: 'listBullet' }
  | { type: 'listOrdered' }
  | { type: 'listTask' }
  | { type: 'hr' }
  | { type: 'footnote' }
  | { type: 'blockquote' }

export interface EditorHandle {
  /** 当前 markdown 全文 */
  getValue(): string
  /** 应用格式命令（两种编辑器各自实现光标语义） */
  apply(cmd: FormatCmd): void
  /** 跳转到 1-based 行（源码模式精确，IR 模式尽力） */
  gotoLine(line: number): void
  focus(): void
}

// ---------- 命令 -> markdown 片段生成（纯函数，便于单测） ----------

export function tableTemplate(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ')
  const sep = Array.from({ length: cols }, () => '---').join(' | ')
  const body = Array.from(
    { length: Math.max(0, rows - 1) },
    (_, r) => Array.from({ length: cols }, (_, c) => ` ${(r + 1) * (c + 1)} `).join('|'),
  ).join('\n')
  return [`| ${header} |`, `| ${sep} |`, body].filter(Boolean).join('\n')
}

/** 应用内提示类型 → GitHub callout 标签（Vditor IR 原生渲染） */
const KIND_TO_CALLOUT: Record<string, string> = {
  note: 'NOTE',
  tip: 'TIP',
  warning: 'WARNING',
  danger: 'CAUTION',
}

export function admonitionTemplate(kind: string, title?: string): string {
  const tag = KIND_TO_CALLOUT[kind] ?? kind.toUpperCase()
  return `> [!${tag}]${title ? ' ' + title : ''}\n> 内容`
}

export function nextFootnoteId(doc: string): number {
  const ids = [...doc.matchAll(/\[\^(\d+)\]/g)].map((m) => Number(m[1]))
  return (ids.length ? Math.max(...ids) : 0) + 1
}

/** 标题行前缀切换：返回新的行首前缀（null 表示移除标题） */
export function headingPrefix(currentLine: string, level: number): string | null {
  const m = currentLine.match(/^(#{1,6})\s+/)
  if (m && m[1].length === level) return null // 再按同级别取消
  return '#'.repeat(level) + ' '
}

export const stripHeading = (line: string) => line.replace(/^#{1,6}\s+/, '')
