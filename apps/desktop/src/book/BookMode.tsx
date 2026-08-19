import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceInfo, LoadedBook, SummaryItem, CompileReport, Diagnostic, SearchMatch, BookSearchAllMatch } from '@booktool/shared'
import { api, fileUrl } from '../api'
import { join } from '../path'
import Editor from '../components/Editor'
import VditorEditor from '../components/VditorEditor'
import MarkdownPreview from '../components/MarkdownPreview'
import FormatToolbar from '../components/FormatToolbar'
import EmptyCard from '../components/EmptyCard'
import SplitPane, { usePersistedState, type LayoutMode } from '../components/SplitPane'
import { EditorCtx } from '../edit/EditorContext'
import type { EditorHandle } from '../edit/formatCommands'
import BookManagePage from './BookManagePage'
import SingleFileMode, { type SingleFile } from './SingleFileMode'
import ImageDialog from '../components/ImageDialog'
import { promptAsync } from '../components/PromptHost'
import DiagnosticsPanel from '../components/DiagnosticsPanel'

type PreviewMode = 'html' | 'pdf'
type EditorMode = 'ir' | 'source'

/** 供 App 全局快捷键/状态栏调用的命令接口 */
export interface BookCommands {
  jumpDiagnostic(dir: 1 | -1): void
  togglePreview(): void
  toggleEditorMode(): void
  saveAndCompile(): void
  exportPdf(): void
  createNew(): void
  openDiagnostics(): void
  toggleSidebar(): void
  cycleLayout(): void
  /** 编译完成后用系统查看器打开 PDF */
  openPdf(): void
  /** 编译完成后在应用内预览 PDF */
  previewPdf(): void
  statusBarInfo?: {
    compiling: boolean
    durationMs?: number
    warnings: number
    errors: number
    ok?: boolean
    /** 编译状态文本（含 Mermaid 渲染统计） */
    status?: string
    /** 相对书籍根的产物路径 */
    pdfRel?: string | null
    /** 产物绝对路径 */
    pdfPath?: string | null
  }
}

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
  onRegisterCommands: (c: BookCommands | null) => void
  /** 供 App「打开目录」在书籍加载后跳入工作区（BookMode 可能晚于请求挂载） */
  onRegisterBookOpen?: (fn: (dir: string, name: string) => void) => void
}

export default function BookMode({ workspace, onChanged, onRegisterCommands, onRegisterBookOpen }: Props) {
  // 三级导航：书籍管理页 ↔ 书籍工作区 ↔ 单个文件编辑（URL hash 可指定初始进入，用于自动化目检：
  // #book-workspace 打开第一本书、#single-file:<绝对路径> 打开单个文件）
  const [view, setView] = useState<'manage' | 'workspace' | 'single'>(() => {
    const h = decodeURIComponent(location.hash.slice(1))
    if (h.startsWith('book-workspace')) return 'workspace'
    if (h.startsWith('single-file:')) return 'single'
    return 'manage'
  })
  const [singleFile, setSingleFile] = useState<SingleFile | null>(() => {
    const h = decodeURIComponent(location.hash.slice(1))
    if (h.startsWith('single-file:')) {
      const absPath = h.slice('single-file:'.length)
      return { absPath, name: absPath.split(/[\\/]/).pop() || '文件', content: '' }
    }
    return null
  })
  // hash 指定 single-file 时异步读取文件内容
  useEffect(() => {
    if (view !== 'single' || !singleFile || singleFile.content) return
    void fetch(fileUrl(singleFile.absPath))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((content) => setSingleFile((f) => (f ? { ...f, content } : f)))
      .catch((e) => setStatus('打开文件失败：' + String(e)))
  }, [view, singleFile])
  const [book, setBook] = useState<LoadedBook | null>(null)
  const [bookName, setBookName] = useState('')
  const [bookDir, setBookDir] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  /** 当前章节文件在磁盘上缺失（SUMMARY 有登记但文件不存在） */
  const [missingPath, setMissingPath] = useState<string | null>(null)
  const [doc, setDoc] = useState('')
  const [saved, setSaved] = useState(true)

  const [editorMode, setEditorMode] = usePersistedState<EditorMode>('booktool-editor-mode', 'ir')
  const [preview, setPreview] = usePersistedState<PreviewMode>('booktool-preview-mode', 'html')
  const [layout, setLayout] = usePersistedState<LayoutMode>('booktool-layout', 'split')
  const [sidebarOpen, setSidebarOpen] = usePersistedState('booktool-sidebar', true)
  /** 所见即所得模式下是否并排显示预览（默认关闭以铺满屏幕，可手动开启） */
  const [irPreview, setIrPreview] = usePersistedState('booktool-ir-preview', false)

  const [manageTree, setManageTree] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([])
  const [live, setLive] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [status, setStatus] = useState('')
  /** 编译中的实时阶段消息（编译器经 onCompileStatus 推送）与进度（done/total，可空） */
  const [compilePhase, setCompilePhase] = useState('')
  const [compileProgress, setCompileProgress] = useState<{ done: number; total: number } | null>(null)
  /** 编译已耗时（ms），编译中定时刷新 */
  const [compileElapsed, setCompileElapsed] = useState(0)
  const compileStartRef = useRef(0)
  const [report, setReport] = useState<CompileReport | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)

  /** 目录中磁盘缺失的章节路径集合（树中 ⚠ 标记） */
  const missingSet = useMemo(
    () => new Set((book?.chapters ?? []).filter((c) => c.missing).map((c) => c.path)),
    [book],
  )
  const [pdfVersion, setPdfVersion] = useState(0)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const pdfBlobUrlRef = useRef<string | null>(null)
  const [gotoLine, setGotoLine] = useState<{ line: number; nonce: number } | null>(null)
  /** 跨书搜索命中后待跳转的章节与行 */
  const [pendingJump, setPendingJump] = useState<{ file: string; line: number } | null>(null)
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagIndex, setDiagIndex] = useState(-1)
  const [imgOpen, setImgOpen] = useState(false)

  const cmHandleRef = useRef<EditorHandle | null>(null)
  const vdHandleRef = useRef<EditorHandle | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSeq = useRef(0)
  const stateRef = useRef({ bookDir, current, doc, saved, live, compiling, editorMode, layout })
  stateRef.current = { bookDir, current, doc, saved, live, compiling, editorMode, layout }

  const openBook = useCallback((dir: string, name: string) => {
    setBookDir(dir)
    setBookName(name)
    void api.book.load(dir).then(setBook)
    setCurrent(null)
    setReport(null)
    setPdfPath(null)
    setView('workspace')
  }, [])

  // 向 App 暴露 openBook（供「打开目录」跨活动加载书籍；含挂载前 pending 兜底）
  useEffect(() => {
    onRegisterBookOpen?.(openBook)
    return () => onRegisterBookOpen?.(() => {})
  }, [onRegisterBookOpen, openBook])

  // hash 指定 book-workspace 时自动打开第一本书与第一章（自动化目检用）
  useEffect(() => {
    if (view === 'workspace' && !bookDir && workspace && workspace.books.length > 0) {
      openBook(join(workspace.root, 'books', workspace.books[0]), workspace.books[0])
    }
  }, [view, bookDir, workspace, openBook])

  const reloadBook = useCallback(() => {
    if (stateRef.current.bookDir) void api.book.load(stateRef.current.bookDir).then(setBook)
  }, [])

  const openChapter = useCallback(async (path: string) => {
    const dir = stateRef.current.bookDir
    if (!dir) return
    const seq = ++loadSeq.current
    const content = await api.book.readChapter(dir, path)
    if (seq !== loadSeq.current) return
    setCurrent(path)
    // 文件缺失：编辑器显示「缺失」状态卡，可重建或从目录移除
    setMissingPath(content === null ? path : null)
    setDoc(content ?? '')
    setSaved(true)
  }, [])

  /** 为缺失章节创建文件（用 SUMMARY 标题作默认内容），随后重新打开 */
  const createMissingChapter = useCallback(async () => {
    const s = stateRef.current
    if (!s.bookDir || !s.current) return
    const title = book?.chapters.find((c) => c.path === s.current)?.title ?? s.current
    await api.book.writeChapter(s.bookDir, s.current, `# ${title}\n\n`)
    reloadBook()
    void openChapter(s.current)
  }, [book, reloadBook, openChapter])

  /** 从目录（SUMMARY）移除缺失章节条目（不删磁盘文件） */
  const removeMissingChapter = useCallback(async () => {
    const s = stateRef.current
    if (!s.bookDir || !s.current) return
    if (!confirm(`从目录移除「${s.current}」？（仅移除 SUMMARY 条目，不影响磁盘文件）`)) return
    await api.book.chapterDelete(s.bookDir, s.current, false)
    setCurrent(null)
    setMissingPath(null)
    reloadBook()
  }, [reloadBook])

  // hash 指定 book-workspace 时自动打开第一章（自动化目检用；须在 openChapter 定义后）
  useEffect(() => {
    if (view === 'workspace' && book && !current && book.chapters.length > 0) {
      void openChapter(book.chapters[0].path)
    }
  }, [view, book, current, openChapter])

  const compile = useCallback(async (outputName?: string) => {
    const s = stateRef.current
    if (!s.bookDir) return null
    setCompiling(true)
    setStatus(outputName ? '实时编译 …' : '准备编译 …')
    compileStartRef.current = Date.now()
    setCompileElapsed(0)
    setCompilePhase(outputName ? '实时编译 …' : '准备编译 …')
    setCompileProgress(null)
    try {
      if (s.current && !s.saved) {
        await api.book.writeChapter(s.bookDir, s.current, s.doc)
        setSaved(true)
      }
      const r = await api.book.compile(s.bookDir, outputName ? { outputName } : undefined)
      setReport(r)
      setPdfPath(r.pdfPath)
      setPdfVersion((v) => v + 1)
      // 编译完成自动同步诊断面板：仅编译失败（有 error）才自动弹出并选中首条
      // 错误；只有警告不自动弹（警告多时反复弹出会打扰、占空间），用户想看
      // 点状态栏「⚠诊断」按钮手动展开；干净编译 → 自动收起
      const ds = r.diagnostics ?? []
      const hasErr = ds.some((d) => d.severity === 'error')
      if (hasErr) {
        setDiagOpen(true)
        const firstErr = ds.findIndex((d) => d.severity === 'error')
        setDiagIndex(firstErr >= 0 ? firstErr : 0)
      } else {
        setDiagOpen(false)
        setDiagIndex(-1)
      }
      setStatus(
        r.ok
          ? outputName
            ? `实时编译完成 ${(r.durationMs / 1000).toFixed(1)}s`
            : `编译成功：${(r.durationMs / 1000).toFixed(1)}s，Mermaid 新渲染 ${r.mermaidRendered} / 缓存 ${r.mermaidCached}`
          : '编译失败，请查看诊断',
      )
      return r
    } catch (err) {
      setStatus('编译异常：' + String(err))
      return null
    } finally {
      setCompiling(false)
    }
  }, [])

  // 订阅主进程编译进度：编译器经 compileDiagnostics 推送 { status, progress }，
  // 实时更新状态栏/按钮的阶段与进度（完成时另推送 { report }，报告走 compile() 的 invoke 返回，忽略即可）
  useEffect(
    () =>
      api.onCompileStatus((payload) => {
        const p = payload as { status?: string; progress?: { done: number; total: number } }
        if (typeof p?.status === 'string') {
          setCompilePhase(p.status)
          setCompileProgress(p.progress ?? null)
        }
      }),
    [],
  )

  // 编译计时：开始记录起始时刻，编译中每 500ms 刷新已耗时
  useEffect(() => {
    if (!compiling) {
      setCompileElapsed(0)
      return
    }
    const id = setInterval(() => setCompileElapsed(Date.now() - compileStartRef.current), 500)
    return () => clearInterval(id)
  }, [compiling])

  // 编译完成后把 PDF 读入 Blob URL 供 iframe 预览。
  // 直接以 booktool-file 协议 URL 作为 iframe src 在部分环境（GPU/自定义协议）下 PDF 预览空白（黑框），
  // Blob URL 与 Chromium 内置 PDF 查看器配合最可靠。
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!pdfPath) {
        setPdfUrl(null)
        return
      }
      try {
        const res = await fetch(fileUrl(pdfPath))
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const blob = await res.blob()
        if (cancelled) return
        if (pdfBlobUrlRef.current) URL.revokeObjectURL(pdfBlobUrlRef.current)
        const url = URL.createObjectURL(blob)
        pdfBlobUrlRef.current = url
        setPdfUrl(url)
      } catch {
        if (!cancelled) setPdfUrl(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [pdfPath, pdfVersion])

  // 组件卸载时回收最后一个 Blob URL
  useEffect(() => () => {
    if (pdfBlobUrlRef.current) URL.revokeObjectURL(pdfBlobUrlRef.current)
  }, [])

  const onChange = useCallback(
    (v: string) => {
      setDoc(v)
      setSaved(false)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const s = stateRef.current
        if (s.bookDir && s.current) {
          void api.book.writeChapter(s.bookDir, s.current, v)
          setSaved(true)
          if (s.live && !s.compiling) {
            if (liveTimer.current) clearTimeout(liveTimer.current)
            liveTimer.current = setTimeout(() => {
              void compile('preview.pdf')
            }, 800)
          }
        }
      }, 500)
    },
    [compile],
  )

  /** 拖拽图片到编辑区：导入 assets/ 并在光标处插入引用 */
  const onDropImage = useCallback(async (absPath: string) => {
    const s = stateRef.current
    if (!s.bookDir || !s.current) return
    try {
      const rel = await api.image.import(s.bookDir, absPath, s.current)
      const handle = s.editorMode === 'ir' ? vdHandleRef.current : cmHandleRef.current
      const name = absPath.split('/').pop() ?? '图片'
      handle?.apply({ type: 'image', path: rel, alt: name.replace(/\.[^.]+$/, '') })
      setStatus(`已导入图片 ${rel}`)
    } catch (e) {
      setStatus('图片导入失败：' + String(e))
    }
  }, [])

  // 粘贴图片（Ctrl+V 截图/复制图片）：保存到 image/<文档名>/ 并在光标处插入引用（仅书籍工作区）
  useEffect(() => {
    if (view !== 'workspace') return
    const onPaste = (e: ClipboardEvent) => {
      const s = stateRef.current
      if (!s.bookDir || !s.current) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            e.stopPropagation()
            void (async () => {
              try {
                const bytes = await file.arrayBuffer()
                const rel = await api.image.paste(s.bookDir!, bytes, file.type, s.current!)
                const handle = s.editorMode === 'ir' ? vdHandleRef.current : cmHandleRef.current
                handle?.apply({ type: 'image', path: rel, alt: (file.name.replace(/\.[^.]+$/, '') || '图片') })
                setStatus(`已粘贴图片 ${rel}`)
              } catch (err) {
                setStatus('图片粘贴失败：' + String(err))
              }
            })()
            break
          }
        }
      }
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [view])

  // 全文搜索（章节，防抖 250ms）
  useEffect(() => {
    const s = stateRef.current
    if (!s.bookDir || !searchQ.trim()) {
      setSearchResults([])
      return
    }
    const t = setTimeout(() => {
      void api.book.search(s.bookDir!, searchQ.trim()).then(setSearchResults)
    }, 250)
    return () => clearTimeout(t)
  }, [searchQ, bookDir])

  // 编译成功后「在应用内预览」：切到 PDF 预览并把预览面板显示出来
  const openPdfInApp = useCallback(() => {
    setPreview('pdf')
    if (editorMode === 'ir') setIrPreview(true)
    else setLayout((l) => (l === 'edit' ? 'split' : l))
  }, [editorMode, setPreview, setIrPreview, setLayout])

  /** 打开章节并跳转到指定行 */
  const gotoChapterLine = useCallback(
    (path: string, line: number) => {
      const s = stateRef.current
      const jump = () => setGotoLine({ line, nonce: Date.now() })
      if (s.current === path) {
        if (s.editorMode !== 'source') setEditorMode('source')
        jump()
      } else {
        void openChapter(path).then(() => {
          if (stateRef.current.editorMode !== 'source') setEditorMode('source')
          jump()
        })
      }
    },
    [openChapter, setEditorMode],
  )

  const jumpToDiag = useCallback((d: Diagnostic) => {
    const s = stateRef.current
    if (!s.bookDir) return
    if (s.editorMode !== 'source') setEditorMode('source')
    const jump = () => setGotoLine({ line: d.line, nonce: Date.now() })
    if (d.file !== s.current) void openChapter(d.file).then(jump)
    else jump()
  }, [openChapter, setEditorMode])

  // 跨书搜索命中：先打开对应书，书加载完成后跳到章节行
  const openSearchMatch = useCallback(
    (m: BookSearchAllMatch) => {
      openBook(m.bookDir, m.bookName)
      setPendingJump({ file: m.file, line: m.line })
    },
    [openBook],
  )
  useEffect(() => {
    if (view !== 'workspace' || !book || !pendingJump) return
    setPendingJump(null)
    gotoChapterLine(pendingJump.file, pendingJump.line)
  }, [view, book, pendingJump, gotoChapterLine])

  const createNew = useCallback(async () => {
    const s = stateRef.current
    const dir = s.bookDir
    if (!dir) return
    const fileName = await promptAsync('新章节文件名（如 chapter-4.md）')
    if (!fileName) return
    const title = fileName.replace(/\.md$/, '')
    void api.book
      .chapterCreate(dir, fileName, title)
      .then(() => {
        reloadBook()
        return api.book.readChapter(dir, fileName.endsWith('.md') ? fileName : `${fileName}.md`)
      })
      .then((c) => {
        setDoc(c)
        setCurrent(fileName.endsWith('.md') ? fileName : `${fileName}.md`)
      })
  }, [reloadBook])

  // 注册全局命令（仅书籍工作区；单文件视图由 SingleFileMode 自行注册，避免覆盖）
  useEffect(() => {
    if (view !== 'workspace') {
      if (view === 'single') return // 单文件视图：命令归 SingleFileMode
      onRegisterCommands(null)
      return
    }
    onRegisterCommands({
      jumpDiagnostic: (dir) => {
        const diags = (report?.diagnostics ?? []).filter((d) => d.line > 0)
        if (diags.length === 0) return
        setDiagOpen(true)
        let next = diagIndex + dir
        if (next < 0) next = diags.length - 1
        if (next >= diags.length) next = 0
        setDiagIndex(next)
        jumpToDiag(diags[next])
      },
      togglePreview: () => setPreview((p) => (p === 'html' ? 'pdf' : 'html')),
      toggleEditorMode: () => setEditorMode((m) => (m === 'ir' ? 'source' : 'ir')),
      saveAndCompile: () => void compile(),
      exportPdf: () => {
        void compile().then((r) => {
          if (r?.ok && r.pdfPath) void api.book.openPdf(bookDir!, r.pdfPath)
        })
      },
      openDiagnostics: () => {
        const wasOpen = diagOpen
        const diagsNow = report?.diagnostics ?? []
        setDiagOpen((v) => !v)
        // 从关闭状态打开时，自动选中第一条错误（若有）并展开详情
        if (!wasOpen && diagIndex < 0 && diagsNow.length > 0) {
          const firstErr = diagsNow.findIndex((d) => d.severity === 'error')
          const idx = firstErr >= 0 ? firstErr : 0
          setDiagIndex(idx)
          const d = diagsNow[idx]
          if (d && d.line > 0) jumpToDiag(d)
        }
      },
      toggleSidebar: () => setSidebarOpen((v) => !v),
      cycleLayout: () => {
        // 所见即所得模式下预览已强制关闭，布局循环无意义（避免切回源码时布局意外变化）
        if (editorMode === 'ir') return
        setLayout((l) => (l === 'split' ? 'edit' : l === 'edit' ? 'preview' : 'split'))
      },
      createNew,
      openPdf: () => {
        if (pdfPath) void api.book.openPdf(bookDir!, pdfPath)
      },
      previewPdf: openPdfInApp,
      get statusBarInfo() {
        const diags = report?.diagnostics ?? []
        return {
          compiling,
          durationMs: report?.durationMs,
          warnings: diags.filter((d) => d.severity === 'warning').length,
          errors: diags.filter((d) => d.severity === 'error').length,
          ok: report?.ok ?? false,
          status,
          phase: compilePhase,
          progress: compileProgress,
          elapsedMs: compileElapsed,
          pdfRel: pdfPath && bookDir ? (pdfPath.startsWith(bookDir) ? pdfPath.slice(bookDir.length + 1) : pdfPath) : null,
          pdfPath,
        }
      },
    })
    return () => onRegisterCommands(null)
  }, [view, onRegisterCommands, report, compiling, status, compilePhase, compileProgress, compileElapsed, pdfPath, bookDir, openPdfInApp, diagIndex, jumpToDiag, compile, createNew, editorMode, setEditorMode, setPreview, setLayout, setSidebarOpen])

  const chapterDir = useMemo(() => {
    if (!bookDir || !current || !book) return ''
    const dirPart = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : ''
    return join(bookDir, book.config.srcDir, dirPart)
  }, [bookDir, book, current])

  if (!workspace) return null

  // -------- 第一级：书籍管理页 --------
  if (view === 'manage') {
    return <BookManagePage workspace={workspace} onChanged={onChanged} onOpenBook={openBook} onOpenMatch={openSearchMatch} onOpenSingleFile={(f) => { setSingleFile(f); setView('single') }} />
  }

  // -------- 单文件编辑模式（不依赖书籍结构） --------
  if (view === 'single' && singleFile) {
    return <SingleFileMode file={singleFile} onClose={() => setView('manage')} onRegisterCommands={onRegisterCommands} />
  }

  // -------- 第二级：书籍工作区 --------
  const diags = report?.diagnostics ?? []
  // 所见即所得（IR）模式下内容实时渲染，默认强制「仅编辑」铺满屏幕；
  // 用户可在工具栏打开「◫ 预览」并排显示；切回源码模式时恢复用户先前选择的布局。
  const effectiveLayout: LayoutMode = editorMode === 'ir' ? (irPreview ? 'split' : 'edit') : layout

  const editorPane = (
    <section className="pane editor-pane">
      <div className="editor-toolbar">
        <div className="et-group et-left">
          <button className="ft-btn et-icon" title="侧栏开关" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <span className="doc-title" title={current ?? ''}>
            {current ?? '未选择章节'}
          </span>
          <span className={`save-state${saved ? '' : ' dirty'}`}>{saved ? '✓ 已保存' : '● 保存中…'}</span>
        </div>
        <FormatToolbar disabled={!current} onImage={() => setImgOpen(true)} />
        <div className="et-group et-right">
          <button
            className={`btn-compile${diagOpen && diags.length > 0 ? ' has-diag' : ''}`}
            disabled={!bookDir || compiling}
            onClick={() => void compile()}
            title="保存并编译 PDF（Ctrl+S）"
          >
            {compiling ? (compilePhase ? `⟳ ${compilePhase}` : '⟳ 编译中…') : '编译 PDF'}
          </button>
          <button
            className={`ft-btn et-icon diag-toggle${diags.length > 0 ? ' has-diag' : ''}`}
            onClick={() => setDiagOpen((v) => !v)}
            title={`编译输出 / 诊断（${diags.length}）`}
          >
            ⚠{diags.length > 0 ? diags.length : ''}
          </button>
          <div className="view-tabs" title="编辑模式 Ctrl+E">
            <button className={editorMode === 'ir' ? 'active' : ''} onClick={() => setEditorMode('ir')} title="所见即所得 Ctrl+E">
              所见即所得
            </button>
            <button className={editorMode === 'source' ? 'active' : ''} onClick={() => setEditorMode('source')} title="源码 Ctrl+E">
              源码
            </button>
          </div>
          {editorMode === 'source' ? (
            <div className="view-tabs layout-tabs" title="布局 Ctrl+\">
              <button className={layout === 'split' ? 'active' : ''} onClick={() => setLayout('split')} title="拆分（编辑 + 预览）">
                ⫿
              </button>
              <button className={layout === 'edit' ? 'active' : ''} onClick={() => setLayout('edit')} title="仅编辑">
                ▮
              </button>
              <button className={layout === 'preview' ? 'active' : ''} onClick={() => setLayout('preview')} title="仅预览">
                ◫
              </button>
            </div>
          ) : (
            <button
              className={`ft-btn et-icon preview-toggle${irPreview ? ' active' : ''}`}
              onClick={() => setIrPreview((v) => !v)}
              title="所见即所得模式下并排显示/隐藏预览面板"
            >
              ◫ 预览
            </button>
          )}
        </div>
      </div>
      {current && missingPath === current ? (
        <EmptyCard
          icon="⚠️"
          title="章节文件缺失"
          desc={
            <>
              {current} 在目录（SUMMARY）中登记，但磁盘文件不存在（可能被删除或移动）。
              <br />
              可重建该文件继续写作，或从目录中移除此条目。
            </>
          }
          actions={
            <>
              <button className="primary" onClick={() => void createMissingChapter()}>
                + 创建该章节文件
              </button>
              <button className="ghost danger-btn" onClick={() => void removeMissingChapter()}>
                从目录移除
              </button>
            </>
          }
        />
      ) : current ? (
        editorMode === 'ir' ? (
          <VditorEditor
            value={doc}
            docKey={`${bookDir}/${current}`}
            baseDir={chapterDir}
            onChange={onChange}
            handleRef={vdHandleRef}
            onError={(msg) => {
              if (msg === 'switch-source') setEditorMode('source')
            }}
            onDropImage={onDropImage}
            key={`ir-${bookDir}/${current}`}
          />
        ) : (
          <Editor
            value={doc}
            docKey={`${bookDir}/${current}`}
            onChange={onChange}
            gotoLine={gotoLine}
            handleRef={cmHandleRef}
            onDropImage={onDropImage}
            key={`src-${bookDir}/${current}`}
          />
        )
      ) : (
        <EmptyCard
          icon="📄"
          title="选择一个章节开始写作"
          desc={
            <>
              左侧目录点击章节打开；Ctrl+N 新建章节；
              <br />
              所见即所得模式下光标行显示源码，其余行实时渲染
            </>
          }
          actions={
            <button className="primary" onClick={createNew}>
              + 新建章节
            </button>
          }
        />
      )}
    </section>
  )

  const previewPane = (
    <section className="pane">
      <div className="pane-header">
        <div className="view-tabs">
          <button className={preview === 'html' ? 'active' : ''} onClick={() => { setPreview('html'); if (layout === 'edit') setLayout('split') }}>
            HTML 预览
          </button>
          <button className={preview === 'pdf' ? 'active' : ''} onClick={() => { setPreview('pdf'); if (layout === 'edit') setLayout('split') }}>
            PDF 预览
          </button>
        </div>
        <span className="spacer" />
        <button className={`primary${live ? ' live-on' : ''}`} onClick={() => setLive((v) => !v)} title="开启后保存自动编译实时预览">
          {live ? '● 实时开' : '○ 实时'}
        </button>
        {pdfPath && (
          <button className="small" onClick={() => void api.book.openPdf(bookDir!, pdfPath)}>
            系统打开
          </button>
        )}
        <button
          className="small"
          title="关闭预览面板"
          onClick={() => {
            if (editorMode === 'ir') setIrPreview(false)
            else setLayout('edit')
          }}
        >
          ✕
        </button>
      </div>
      {preview === 'html' ? (
        <MarkdownPreview markdown={doc} baseDir={chapterDir} />
      ) : pdfUrl ? (
        <iframe key={pdfVersion} className="pdf-frame" src={pdfUrl} title="PDF 预览" />
      ) : pdfPath ? (
        <EmptyCard icon="🖨" title="正在加载 PDF…" desc="读取编译产物中，请稍候" />
      ) : (
        <EmptyCard icon="🖨" title="编译后此处显示 PDF" desc="点击上方「编译 PDF」生成；开启「实时」后保存即自动编译刷新" />
      )}
    </section>
  )

  return (
    <EditorCtx.Provider value={editorMode === 'ir' ? vdHandleRef.current : cmHandleRef.current}>
      {imgOpen && bookDir && current && (
        <ImageDialog
          bookDir={bookDir}
          chapterPath={current}
          onClose={() => setImgOpen(false)}
          onInsert={(path, alt) => {
            const handle = editorMode === 'ir' ? vdHandleRef.current : cmHandleRef.current
            handle?.apply({ type: 'image', path, alt })
            setImgOpen(false)
          }}
        />
      )}
      <div className="workbench">
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-head">
              <span className="sidebar-book" title={bookName || '未命名书籍'}>
                {bookName || '书籍'}
              </span>
              <span className="sidebar-version" title="当前编译版本源码目录">
                {book?.config.activeVersion ? (book.config.versions.find((v) => v.key === book.config.activeVersion)?.name ?? book.config.activeVersion) : '默认 src/'}
              </span>
              <button className="ft-btn et-icon" title="返回书籍列表" onClick={() => setView('manage')}>
                ←
              </button>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">
                文档管理
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="small" onClick={createNew} title="新建章节">
                    ＋
                  </button>
                  <button
                    className={`small${manageTree ? ' primary' : ''}`}
                    onClick={() => setManageTree((v) => !v)}
                    title={manageTree ? '退出管理模式' : '管理模式：重命名/删除/调序'}
                  >
                    {manageTree ? '✓ 管理' : '✎ 管理'}
                  </button>
                </span>
              </div>
              {book && (
                <DocTree
                  summary={book.summary}
                  current={current}
                  manage={manageTree}
                  onSelect={(p) => void openChapter(p)}
                  onReload={reloadBook}
                  bookDir={bookDir!}
                  missingSet={missingSet}
                />
              )}
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">全文搜索</div>
              <input
                className="search-input"
                type="text"
                placeholder="搜索章节内容…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
              {searchQ.trim() && (
                <div className="search-results">
                  {searchResults.length === 0 ? (
                    <div className="search-empty">无结果</div>
                  ) : (
                    searchResults.slice(0, 60).map((m, i) => (
                      <div key={i} className="search-item" onClick={() => gotoChapterLine(m.file, m.line)} title={m.text}>
                        <span className="search-file">{m.file}:{m.line}</span>
                        <span className="search-text">{m.text.trim()}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        <div className="workbench-main">
          {effectiveLayout === 'split' && <SplitPane left={editorPane} right={previewPane} />}
          {effectiveLayout === 'edit' && editorPane}
          {effectiveLayout === 'preview' && previewPane}
          {diagOpen && (
            <DiagnosticsPanel
              diagnostics={diags}
              selected={diagIndex}
              onSelect={(i) => {
                setDiagIndex(i)
                const d = diags[i]
                if (d && d.line > 0) jumpToDiag(d)
              }}
              onClose={() => setDiagOpen(false)}
            />
          )}
        </div>
      </div>
    </EditorCtx.Provider>
  )
}

/** 文档树：浏览 + 管理两模式 */
function DocTree({
  summary,
  current,
  manage,
  onSelect,
  onReload,
  bookDir,
  missingSet,
}: {
  summary: SummaryItem[]
  current: string | null
  manage: boolean
  onSelect: (path: string) => void
  onReload: () => void
  bookDir: string
  /** 磁盘上缺失的章节路径集合（SUMMARY 有登记但文件不存在） */
  missingSet: Set<string>
}) {
  const [busy, setBusy] = useState(false)
  const guard = async (fn: () => Promise<unknown>) => {
    try {
      setBusy(true)
      await fn()
      onReload()
    } catch (e) {
      alert(String(e))
    } finally {
      setBusy(false)
    }
  }

  const rename = async (item: SummaryItem) => {
    const title = await promptAsync('新标题', item.title)
    if (!title || title === item.title) return
    const fileName = manage && confirm('同时重命名文件？（取消则仅改标题）')
      ? (await promptAsync('新文件名', item.path!.split('/').pop()!)) ?? undefined
      : undefined
    void guard(() => api.book.chapterRename(bookDir, item.path!, title, fileName))
  }
  const remove = (item: SummaryItem) => {
    const del = confirm(`从目录移除「${item.title}」。\n确定=同时删除文件，取消=仅移出目录`)
    void guard(() => api.book.chapterDelete(bookDir, item.path!, del))
  }
  const move = (item: SummaryItem, dir: -1 | 1) => {
    void guard(() => api.book.chapterMove(bookDir, item.path!, dir))
  }

  const renderNode = (item: SummaryItem, i: number, siblings: SummaryItem[]) => {
    if (item.type === 'separator') return <div className="tree-sep" key={i} />
    if (item.type === 'part') {
      return (
        <div key={i}>
          <div className="tree-part">{item.title}</div>
          {item.children.map((c, k) => renderNode(c, k, item.children))}
        </div>
      )
    }
    return (
      <div key={i}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className={`tree-item${current === item.path ? ' active' : ''}${item.path && missingSet.has(item.path) ? ' missing' : ''}`} style={{ flex: 1, minWidth: 0 }} onClick={() => !manage && onSelect(item.path!)}>
            {item.path && missingSet.has(item.path) && (
              <span className="tree-missing" title="文件缺失">
                ⚠
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
          </div>
          {manage && !busy && (
            <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              <button className="ft-btn" style={{ width: 22, height: 22, fontSize: 11 }} title="上移" onClick={() => move(item, -1)} disabled={i === 0}>
                ↑
              </button>
              <button className="ft-btn" style={{ width: 22, height: 22, fontSize: 11 }} title="下移" onClick={() => move(item, 1)} disabled={i === siblings.length - 1}>
                ↓
              </button>
              <button className="ft-btn" style={{ width: 22, height: 22, fontSize: 11 }} title="重命名" onClick={() => rename(item)}>
                ✎
              </button>
              <button className="ft-btn" style={{ width: 22, height: 22, fontSize: 11 }} title="移除" onClick={() => remove(item)}>
                🗑
              </button>
            </span>
          )}
        </div>
        {item.children.map((c, k) => renderNode(c, k, item.children))}
      </div>
    )
  }

  return <div>{summary.map((item, i) => renderNode(item, i, summary))}</div>
}
