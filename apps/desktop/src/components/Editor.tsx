import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react'
import { EditorView, keymap, Decoration, type DecorationSet } from '@codemirror/view'
import { EditorState, StateEffect, StateField, Prec } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  headingPrefix,
  tableTemplate,
  admonitionTemplate,
  nextFootnoteId,
  type FormatCmd,
  type EditorHandle,
} from '../edit/formatCommands'

export interface EditorProps {
  value: string
  docKey: string
  onChange: (v: string) => void
  gotoLine?: { line: number; nonce: number } | null
  handleRef?: RefObject<EditorHandle | null>
  /** 拖拽图片文件到编辑区（绝对路径经 webUtils 解析后回调） */
  onDropImage?: (absPath: string) => void
}

const setDeco = StateEffect.define<DecorationSet>()
const decoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const e of tr.effects) if (e.is(setDeco)) value = e.value
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** 在光标/选区处插入文本；selectRange 选中插入内容的一段（相对插入起点偏移） */
function insertAtCursor(view: EditorView, text: string, selectRange?: [number, number]) {
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + (selectRange?.[0] ?? text.length), head: from + (selectRange?.[1] ?? text.length) },
  })
}

function wrapSelection(view: EditorView, mark: string, fallback: string) {
  const sel = view.state.selection.main
  const selected = view.state.sliceDoc(sel.from, sel.to) || fallback
  // 已包裹则取消
  if (sel.from - mark.length >= 0) {
    const before = view.state.sliceDoc(sel.from - mark.length, sel.from)
    const after = view.state.sliceDoc(sel.to, sel.to + mark.length)
    if (before === mark && after === mark) {
      view.dispatch({
        changes: [
          { from: sel.from - mark.length, to: sel.from, insert: '' },
          { from: sel.to, to: sel.to + mark.length, insert: '' },
        ],
      })
      return
    }
  }
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: mark + selected + mark },
    selection: { anchor: sel.from + mark.length, head: sel.from + mark.length + selected.length },
  })
}

/** 行首前缀整体切换：所有行都带前缀 → 移除；否则添加 */
function toggleBlockPrefix(
  view: EditorView,
  match: RegExp,
  prefixOf: (line: string, index: number) => string,
) {
  const state = view.state
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  const texts = Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i).text)
  const allHave = texts.every((t) => match.test(t))
  view.dispatch({
    changes: texts.map((t, i) => {
      const line = state.doc.line(first + i)
      if (allHave) {
        return { from: line.from, to: line.from + (t.match(match)?.[0].length ?? 0), insert: '' }
      }
      return { from: line.from, to: line.from + (t.match(match)?.[0].length ?? 0), insert: prefixOf(t, i) }
    }),
  })
}

/** 命令实现（导出供复用与测试） */
export function applyCmdToView(view: EditorView, cmd: FormatCmd): void {
  const state = view.state
  const sel = state.selection.main
  const selected = state.sliceDoc(sel.from, sel.to)

  switch (cmd.type) {
    case 'heading': {
      const first = state.doc.lineAt(sel.from).number
      const last = state.doc.lineAt(sel.to).number
      view.dispatch({
        changes: Array.from({ length: last - first + 1 }, (_, i) => {
          const line = state.doc.line(first + i)
          const m = line.text.match(/^#{1,6}\s+/)?.[0]
          if (cmd.level === 0) return { from: line.from, to: line.from + (m?.length ?? 0), insert: '' }
          const p = headingPrefix(line.text, cmd.level)
          return { from: line.from, to: line.from + (m?.length ?? 0), insert: p ?? '' }
        }),
      })
      break
    }
    case 'bold':
      wrapSelection(view, '**', '粗体')
      break
    case 'italic':
      wrapSelection(view, '*', '斜体')
      break
    case 'inlineCode':
      wrapSelection(view, '`', 'code')
      break
    case 'link':
      insertAtCursor(view, `[${selected || '链接文字'}](url)`, [2, 2 + (selected || '链接文字').length])
      break
    case 'codeblock': {
      const lang = cmd.lang ?? 'ts'
      insertAtCursor(view, '```' + lang + '\n' + selected + '\n```\n', [3, 3 + lang.length])
      break
    }
    case 'mathBlock':
      insertAtCursor(view, `$$\n${selected}\n$$\n`, [3, 3])
      break
    case 'mathInline':
      wrapSelection(view, '$', 'E=mc^2')
      break
    case 'table':
      insertAtCursor(view, '\n' + tableTemplate(cmd.rows, cmd.cols) + '\n', [3, 3])
      break
    case 'image':
      insertAtCursor(view, `![${cmd.alt ?? '题注'}](${cmd.path ?? 'assets/图片路径.png'})`, [2, 2 + (cmd.alt ?? '题注').length])
      break
    case 'admonition':
      insertAtCursor(view, '\n' + admonitionTemplate(cmd.kind, cmd.title) + '\n\n')
      break
    case 'listBullet':
      toggleBlockPrefix(view, /^\s*[-*+]\s+/, () => '- ')
      break
    case 'listOrdered':
      toggleBlockPrefix(view, /^\s*\d+\.\s+/, (_t, i) => `${i + 1}. `)
      break
    case 'listTask':
      toggleBlockPrefix(view, /^\s*[-*+]\s+\[[ xX]\]\s+/, () => '- [ ] ')
      break
    case 'blockquote':
      toggleBlockPrefix(view, /^\s*>\s+/, () => '> ')
      break
    case 'hr':
      insertAtCursor(view, '\n---\n\n')
      break
    case 'footnote': {
      const id = nextFootnoteId(state.doc.toString())
      insertAtCursor(view, `[^${id}]`)
      const lastLine = state.doc.line(state.doc.lines)
      const anchor = lastLine.to + 2 + `[^${id}]: `.length
      view.dispatch({
        changes: { from: lastLine.to, insert: `\n\n[^${id}]: 脚注内容` },
        selection: { anchor: anchor + 4, head: anchor + 4 },
      })
      break
    }
  }
  view.focus()
}

function applyGoto(view: EditorView, line: number) {
  const l = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines))
  view.dispatch({
    selection: { anchor: l.from },
    effects: [
      EditorView.scrollIntoView(l.from, { y: 'center' }),
      setDeco.of(Decoration.set([Decoration.line({ class: 'cm-goto-highlight' }).range(l.from)])),
    ],
  })
  view.focus()
  setTimeout(() => view.dispatch({ effects: setDeco.of(Decoration.none) }), 2600)
}

/** Ctrl+数字等编辑器内格式快捷键 */
function formatHotkeys() {
  const h = (key: string, cmd: FormatCmd) => ({ key, run: (v: EditorView) => (applyCmdToView(v, cmd), true) })
  return keymap.of([
    h('Mod-0', { type: 'heading', level: 0 }),
    h('Mod-1', { type: 'heading', level: 1 }),
    h('Mod-2', { type: 'heading', level: 2 }),
    h('Mod-3', { type: 'heading', level: 3 }),
    h('Mod-4', { type: 'heading', level: 4 }),
    h('Mod-5', { type: 'heading', level: 5 }),
    h('Mod-6', { type: 'heading', level: 6 }),
    h('Mod-Shift-k', { type: 'codeblock' }),
    h('Mod-Shift-m', { type: 'mathBlock' }),
    h('Mod-m', { type: 'mathInline' }),
    h('Mod-Shift-u', { type: 'listBullet' }),
    h('Mod-Shift-o', { type: 'listOrdered' }),
    h('Mod-Shift-t', { type: 'listTask' }),
    h('Mod-Shift-d', { type: 'hr' }),
    h('Mod-Shift-b', { type: 'admonition', kind: 'warning' }),
    h('Mod-Shift-f', { type: 'footnote' }),
    h('Mod-k', { type: 'link' }),
    h('Mod-Shift-i', { type: 'image' }),
  ])
}

export default function Editor({ value, docKey, onChange, gotoLine, handleRef, onDropImage }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const dropRef = useRef(onDropImage)
  dropRef.current = onDropImage

  const onDrop = (e: React.DragEvent) => {
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      e.preventDefault()
      e.stopPropagation()
      const abs = window.api.filePath(file)
      if (abs) void dropRef.current?.(abs)
    }
  }

  useImperativeHandle(
    handleRef,
    () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? '',
      focus: () => viewRef.current?.focus(),
      gotoLine: (line: number) => {
        if (viewRef.current) applyGoto(viewRef.current, line)
      },
      apply: (cmd: FormatCmd) => {
        if (viewRef.current) applyCmdToView(viewRef.current, cmd)
      },
    }),
    [docKey],
  )

  useEffect(() => {
    const host = hostRef.current!
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
        EditorView.lineWrapping,
        decoField,
        Prec.high(formatHotkeys()),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  useEffect(() => {
    if (gotoLine && viewRef.current) applyGoto(viewRef.current, gotoLine.line)
  }, [gotoLine])

  return <div className="editor-host" ref={hostRef} onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={onDrop} />
}
