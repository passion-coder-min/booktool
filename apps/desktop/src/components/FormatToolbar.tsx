import { useState } from 'react'
import { useEditor } from '../edit/EditorContext'
import type { FormatCmd } from '../edit/formatCommands'

const ADMONITIONS: { kind: string; label: string }[] = [
  { kind: 'note', label: '备注' },
  { kind: 'tip', label: '提示' },
  { kind: 'warning', label: '注意' },
  { kind: 'danger', label: '警告' },
]

/** 插入类命令（收纳进「插入 ▾」下拉，带快捷键提示） */
const INSERT_ITEMS: { label: string; key: string; make: () => FormatCmd; image?: boolean; admonition?: boolean }[] = [
  { label: '表格…', key: 'Ctrl+T', make: () => ({ type: 'table', rows: 3, cols: 3 }) },
  { label: '图片…', key: 'Ctrl+Shift+I', make: () => ({ type: 'image' }), image: true },
  { label: '代码块', key: 'Ctrl+Shift+K', make: () => ({ type: 'codeblock' }) },
  { label: '行内公式', key: 'Ctrl+M', make: () => ({ type: 'mathInline' }) },
  { label: '块级公式', key: 'Ctrl+Shift+M', make: () => ({ type: 'mathBlock' }) },
  { label: '警告框…', key: 'Ctrl+Shift+B', make: () => ({ type: 'admonition', kind: 'warning' }), admonition: true },
  { label: '分割线', key: 'Ctrl+Shift+D', make: () => ({ type: 'hr' }) },
  { label: '脚注', key: 'Ctrl+Shift+F', make: () => ({ type: 'footnote' }) },
]

export default function FormatToolbar({
  disabled,
  onImage,
}: {
  disabled?: boolean
  /** 打开图片对话框（图床/本地双模式）；未提供时降级为命令插入 */
  onImage?: () => void
}) {
  const editor = useEditor()
  const [headingOpen, setHeadingOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [admonOpen, setAdmonOpen] = useState(false)

  const closeAll = () => {
    setHeadingOpen(false)
    setInsertOpen(false)
    setAdmonOpen(false)
  }
  const run = (cmd: FormatCmd) => {
    closeAll()
    editor?.apply(cmd)
  }

  return (
    <div className="format-toolbar">
      <div style={{ position: 'relative' }}>
        <button className="ft-btn" disabled={disabled} title="标题（Ctrl+1~6）" onClick={() => { setHeadingOpen(!headingOpen); setInsertOpen(false); setAdmonOpen(false) }}>
          <span className="h-label">H▾</span>
        </button>
        {headingOpen && (
          <div className="ft-popover">
            {[1, 2, 3, 4, 5, 6].map((l) => (
              <button key={l} className="ft-btn" onClick={() => run({ type: 'heading', level: l as 1 })}>
                <span className="h-label">H{l}</span>
                <span style={{ marginLeft: 8 }}>{'#'.repeat(l)} 标题</span>
                <kbd style={{ marginLeft: 'auto' }}>Ctrl+{l}</kbd>
              </button>
            ))}
            <button className="ft-btn" onClick={() => run({ type: 'heading', level: 0 })}>
              正文 <kbd style={{ marginLeft: 'auto' }}>Ctrl+0</kbd>
            </button>
          </div>
        )}
      </div>

      <span className="ft-sep" />
      <button className="ft-btn" disabled={disabled} title="加粗 Ctrl+B" onClick={() => run({ type: 'bold' })}><b>B</b></button>
      <button className="ft-btn" disabled={disabled} title="斜体 Ctrl+I" onClick={() => run({ type: 'italic' })}><i>I</i></button>
      <button className="ft-btn" disabled={disabled} title="行内代码" onClick={() => run({ type: 'inlineCode' })}>{'<>'}</button>
      <button className="ft-btn" disabled={disabled} title="链接 Ctrl+K" onClick={() => run({ type: 'link' })}>🔗</button>

      <span className="ft-sep" />
      <button className="ft-btn" disabled={disabled} title="无序列表 Ctrl+Shift+U" onClick={() => run({ type: 'listBullet' })}>≡</button>
      <button className="ft-btn" disabled={disabled} title="有序列表 Ctrl+Shift+O" onClick={() => run({ type: 'listOrdered' })}>1.</button>
      <button className="ft-btn" disabled={disabled} title="任务列表 Ctrl+Shift+T" onClick={() => run({ type: 'listTask' })}>☑</button>
      <button className="ft-btn" disabled={disabled} title="引用" onClick={() => run({ type: 'blockquote' })}>❝</button>

      <span className="ft-sep" />
      <div style={{ position: 'relative' }}>
        <button
          className="ft-btn"
          disabled={disabled}
          title="插入（表格/图片/公式/警告框…）"
          onClick={() => { setInsertOpen(!insertOpen); setHeadingOpen(false); setAdmonOpen(false) }}
        >
          插入 ▾
        </button>
        {insertOpen && (
          <div className="ft-popover" style={{ minWidth: 230 }}>
            {INSERT_ITEMS.map((it) =>
              it.image && onImage ? (
                <button key={it.label} className="ft-btn" onClick={() => { closeAll(); onImage() }}>
                  {it.label} <kbd style={{ marginLeft: 'auto' }}>{it.key}</kbd>
                </button>
              ) : it.admonition ? (
                <div key={it.label} style={{ position: 'relative' }}>
                  <button className="ft-btn" style={{ width: '100%' }} onClick={() => setAdmonOpen(!admonOpen)}>
                    警告框… <kbd style={{ marginLeft: 'auto' }}>{it.key}</kbd>
                  </button>
                  {admonOpen && (
                    <div className="ft-popover" style={{ left: 235, top: 0 }}>
                      {ADMONITIONS.map((a) => (
                        <button key={a.kind} className="ft-btn" onClick={() => run({ type: 'admonition', kind: a.kind })}>
                          {a.label}（:::{a.kind}）
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button key={it.label} className="ft-btn" onClick={() => run(it.make())}>
                  {it.label} <kbd style={{ marginLeft: 'auto' }}>{it.key}</kbd>
                </button>
              ),
            )}
          </div>
        )}
      </div>
      <button className="ft-btn" disabled={disabled} title="行内公式 Ctrl+M" onClick={() => run({ type: 'mathInline' })}>∑</button>
      <button className="ft-btn" disabled={disabled} title="块级公式 Ctrl+Shift+M" onClick={() => run({ type: 'mathBlock' })}>∑█</button>
      <button
        className="ft-btn"
        disabled={disabled}
        title="插入图片（图床 / 本地）Ctrl+Shift+I"
        onClick={() => (onImage ? onImage() : run({ type: 'image' }))}
      >
        🖼
      </button>
    </div>
  )
}
