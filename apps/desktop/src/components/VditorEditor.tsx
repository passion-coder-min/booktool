import { useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import type Vditor from 'vditor'
import { api } from '../api'
import { imageSrcToUrl } from './rehypeImages'
import {
  tableTemplate,
  admonitionTemplate,
  nextFootnoteId,
  type FormatCmd,
  type EditorHandle,
} from '../edit/formatCommands'
import 'vditor/dist/index.css'

export interface VditorEditorProps {
  value: string
  docKey: string
  onChange: (v: string) => void
  /** 图片相对路径的基准绝对目录（章节/单文件/维基所在目录） */
  baseDir: string
  gotoLine?: { line: number; nonce: number } | null
  handleRef?: RefObject<EditorHandle | null>
  /** 初始化失败回调（资源缺失等），父组件可切换到源码模式 */
  onError?: (msg: string) => void
  /** 拖拽图片文件到编辑区（绝对路径经 webUtils 解析后回调） */
  onDropImage?: (absPath: string) => void
}

let vditorModule: typeof import('vditor').default | null = null

/**
 * 所见即所得（IR 即时渲染）编辑器：
 * 光标所在行显示 Markdown 源码，其余行实时渲染。
 * 离线资源经 public/vditor 提供（cdn: './vditor'），不依赖外网。
 */
export default function VditorEditor({ value, docKey, onChange, baseDir, gotoLine, handleRef, onError, onDropImage }: VditorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const vdRef = useRef<Vditor | null>(null)
  const observerRef = useRef<MutationObserver | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const gotoLineRef = useRef(gotoLine)
  gotoLineRef.current = gotoLine
  const baseDirRef = useRef(baseDir)
  baseDirRef.current = baseDir

  /**
   * IR 模式下 Lute 把图片渲染为 <img src="显示" data-src="原始路径">，
   * 而 getValue() 反推 markdown 只读 data-src--因此仅改写 src 用于显示，
   * 不会污染保存的文档内容。幂等：已是目标值则跳过，避免 observer 循环。
   */
  const rewriteImgs = useCallback(() => {
    const host = hostRef.current
    const dir = baseDirRef.current
    if (!host || !dir) return
    for (const img of host.querySelectorAll('img')) {
      const raw = img.getAttribute('data-src') || img.getAttribute('src') || ''
      const target = imageSrcToUrl(dir, raw, (abs) => api.fileUrl(abs))
      if (target !== null && img.getAttribute('src') !== target) img.setAttribute('src', target)
    }
  }, [])

  useImperativeHandle(
    handleRef,
    () => ({
      getValue: () => vdRef.current?.getValue() ?? '',
      focus: () => vdRef.current?.focus(),
      gotoLine: () => undefined, // IR 模式无可靠行定位；调用方应先切到源码模式
      apply: (cmd: FormatCmd) => {
        const vd = vdRef.current
        if (!vd) return
        applyCmdToVditor(vd, cmd, onChangeRef.current)
      },
    }),
    [docKey],
  )

  useEffect(() => {
    let disposed = false
    setFailed(null)
    void (async () => {
      try {
        if (!vditorModule) {
          vditorModule = (await import('vditor')).default
        }
        if (disposed || !hostRef.current) return
        // 资源自检：i18n 文件可达才初始化（避免 404 后编辑器空白）
        const res = await fetch(new URL('./vditor/dist/js/i18n/zh_CN.js', document.baseURI))
        if (!res.ok) throw new Error(`编辑器离线资源缺失（HTTP ${res.status}）：public/vditor/dist`)
        if (disposed || !hostRef.current) return
        const Vd = vditorModule
      const vd = new Vd(hostRef.current, {
        mode: 'ir',
        theme: 'classic',
        lang: 'zh_CN',
        cdn: './vditor',
        value,
        height: '100%',
        placeholder: '开始写作…（Ctrl+/ 查看快捷键）',
        cache: { enable: false },
        preview: {
          theme: { current: 'light', path: './vditor/dist/css/content-theme' },
          math: { engine: 'KaTeX' },
          hljs: { style: 'github', lineNumber: false, enable: true },
          // GitHub callout（> [!NOTE] 等）：Vditor 3.11+ 原生支持（Lute 渲染 .callout 块），
          // 与 HTML 预览 / Typst PDF 管线同源，因此所见即所得内即可见提示框
          markdown: { callout: true, footnotes: true },
        },
        counter: { enable: false },
        input: (v) => onChangeRef.current(v),
        toolbar: [],
      })
        vdRef.current = vd
        // 已渲染内容中的相对路径图片 -> booktool-file 协议；后续 DOM 变化（输入/重渲染）由 observer 兜底
        rewriteImgs()
        const observer = new MutationObserver(() => rewriteImgs())
        observer.observe(hostRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src'] })
        observerRef.current = observer
      } catch (err) {
        if (disposed) return
        const msg = String(err)
        setFailed(msg)
        onError?.(msg)
      }
    })()
    return () => {
      disposed = true
      observerRef.current?.disconnect()
      observerRef.current = null
      vdRef.current?.destroy()
      vdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  // 基准目录变化（切换章节/文件）时重写当前已渲染的图片，无需重建编辑器
  useEffect(() => {
    rewriteImgs()
  }, [baseDir, rewriteImgs])

  if (failed) {
    return (
      <div className="editor-host" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>所见即所得编辑器加载失败</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14, wordBreak: 'break-all' }}>{failed}</div>
          <button className="primary" onClick={() => setFailed(null)}>
            重试
          </button>
          <span style={{ margin: '0 8px' }} />
          <button className="ghost" onClick={() => onError?.('switch-source')}>
            切换到源码模式
          </button>
        </div>
      </div>
    )
  }

  const onDrop = (e: React.DragEvent) => {
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      e.preventDefault()
      e.stopPropagation()
      const abs = window.api.filePath(file)
      if (abs) void onDropImage?.(abs)
    }
  }

  return (
    <div
      className="editor-host vditor-host"
      ref={hostRef}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={onDrop}
    />
  )
}

/** Vditor 上的命令实现：块级插入精确；行前缀类用 insertValue 包裹换行模拟 */
export function applyCmdToVditor(vd: Vditor, cmd: FormatCmd, onChange: (v: string) => void): void {
  const insert = (text: string) => {
    vd.insertValue(text)
    const v = vd.getValue()
    onChange(v)
  }
  switch (cmd.type) {
    case 'heading': {
      const level = cmd.level
      // IR 模式：插入空行 + 前缀，用户续写（Vditor 内置 # 快捷语法）
      insert(level === 0 ? '\n' : `\n\n${'#'.repeat(level)} `)
      break
    }
    case 'bold':
      vd.insertValue('**粗体**')
      // 选中"粗体"便于直接输入替换
      break
    case 'italic':
      vd.insertValue('*斜体*')
      break
    case 'inlineCode':
      vd.insertValue('`code`')
      break
    case 'link':
      vd.insertValue('[链接文字](url)')
      break
    case 'codeblock':
      vd.insertValue('\n```ts\n\n```\n')
      break
    case 'mathBlock':
      vd.insertValue('\n$$\n\n$$\n')
      break
    case 'mathInline':
      vd.insertValue('$E=mc^2$')
      break
    case 'table':
      insert('\n' + tableTemplate(cmd.rows, cmd.cols) + '\n')
      break
    case 'image':
      vd.insertValue(`![题注](${cmd.path ?? 'assets/图片路径.png'})`)
      break
    case 'admonition':
      insert('\n' + admonitionTemplate(cmd.kind, cmd.title) + '\n')
      break
    case 'listBullet':
      insert('\n- 列表项\n')
      break
    case 'listOrdered':
      insert('\n1. 列表项\n')
      break
    case 'listTask':
      insert('\n- [ ] 任务\n')
      break
    case 'blockquote':
      insert('\n> 引用内容\n')
      break
    case 'hr':
      insert('\n---\n')
      break
    case 'footnote': {
      const id = nextFootnoteId(vd.getValue())
      vd.insertValue(`[^${id}]`)
      insert(`\n\n[^${id}]: 脚注内容`)
      break
    }
  }
  vd.focus()
}

