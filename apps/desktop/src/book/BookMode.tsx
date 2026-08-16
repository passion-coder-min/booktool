import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceInfo, LoadedBook, SummaryItem, CompileReport, Diagnostic } from '@booktool/shared'
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
import ImageDialog from '../components/ImageDialog'

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
  statusBarInfo?: { compiling: boolean; durationMs?: number; warnings: number; errors: number }
}

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
  onRegisterCommands: (c: BookCommands | null) => void
}

export default function BookMode({ workspace, onChanged, onRegisterCommands }: Props) {
  // 两级导航：书籍管理页 ↔ 书籍工作区（URL hash 可指定初始进入工作区，用于自动化目检）
  const [view, setView] = useState<'manage' | 'workspace'>(() =>
    decodeURIComponent(location.hash.slice(1)).startsWith('book-workspace') ? 'workspace' : 'manage',
  )
  const [book, setBook] = useState<LoadedBook | null>(null)
  const [bookName, setBookName] = useState('')
  const [bookDir, setBookDir] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [doc, setDoc] = useState('')
  const [saved, setSaved] = useState(true)

  const [editorMode, setEditorMode] = usePersistedState<EditorMode>('booktool-editor-mode', 'ir')
  const [preview, setPreview] = usePersistedState<PreviewMode>('booktool-preview-mode', 'html')
  const [layout, setLayout] = usePersistedState<LayoutMode>('booktool-layout', 'split')
  const [sidebarOpen, setSidebarOpen] = usePersistedState('booktool-sidebar', true)

  const [manageTree, setManageTree] = useState(false)
  const [live, setLive] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<CompileReport | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [pdfVersion, setPdfVersion] = useState(0)
  const [gotoLine, setGotoLine] = useState<{ line: number; nonce: number } | null>(null)
  const [diagOpen, setDiagOpen] = useState(true)
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
    setDoc(content)
    setSaved(true)
  }, [])

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
    try {
      if (s.current && !s.saved) {
        await api.book.writeChapter(s.bookDir, s.current, s.doc)
        setSaved(true)
      }
      const r = await api.book.compile(s.bookDir, outputName ? { outputName } : undefined)
      setReport(r)
      setPdfPath(r.pdfPath)
      setPdfVersion((v) => v + 1)
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

  const jumpToDiag = useCallback((d: Diagnostic) => {
    const s = stateRef.current
    if (!s.bookDir) return
    if (s.editorMode !== 'source') setEditorMode('source')
    const jump = () => setGotoLine({ line: d.line, nonce: Date.now() })
    if (d.file !== s.current) void openChapter(d.file).then(jump)
    else jump()
  }, [openChapter, setEditorMode])

  const createNew = useCallback(() => {
    const s = stateRef.current
    const dir = s.bookDir
    if (!dir) return
    const fileName = prompt('新章节文件名（如 chapter-4.md）')
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

  // 注册全局命令
  useEffect(() => {
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
          if (r?.ok && r.pdfPath) void api.book.openPdf(bookDir!)
        })
      },
      openDiagnostics: () => setDiagOpen((v) => !v),
      toggleSidebar: () => setSidebarOpen((v) => !v),
      cycleLayout: () => setLayout((l) => (l === 'split' ? 'edit' : l === 'edit' ? 'preview' : 'split')),
      createNew,
      get statusBarInfo() {
        const diags = report?.diagnostics ?? []
        return {
          compiling,
          durationMs: report?.durationMs,
          warnings: diags.filter((d) => d.severity === 'warning').length,
          errors: diags.filter((d) => d.severity === 'error').length,
        }
      },
    })
    return () => onRegisterCommands(null)
  }, [onRegisterCommands, report, compiling, diagIndex, jumpToDiag, compile, createNew, setEditorMode, setPreview, setLayout, setSidebarOpen])

  const chapterDir = useMemo(() => {
    if (!bookDir || !current || !book) return ''
    const dirPart = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : ''
    return join(bookDir, book.config.srcDir, dirPart)
  }, [bookDir, book, current])

  if (!workspace) return null

  // -------- 第一级：书籍管理页 --------
  if (view === 'manage') {
    return <BookManagePage workspace={workspace} onChanged={onChanged} onOpenBook={openBook} />
  }

  // -------- 第二级：书籍工作区 --------
  const diags = report?.diagnostics ?? []
  const editorPane = (
    <section className="pane">
      <div className="pane-header">
        <button className="ft-btn" title="侧栏开关" onClick={() => setSidebarOpen(!sidebarOpen)}>
          ☰
        </button>
        <span className="doc-title">{current ?? '未选择章节'}</span>
        <span className={`save-state${saved ? '' : ' dirty'}`}>{saved ? '✓ 已保存' : '● 保存中…'}</span>
        <span className="spacer" />
        <div className="view-tabs">
          <button className={editorMode === 'ir' ? 'active' : ''} onClick={() => setEditorMode('ir')} title="所见即所得 Ctrl+E">
            所见即所得
          </button>
          <button className={editorMode === 'source' ? 'active' : ''} onClick={() => setEditorMode('source')} title="源码 Ctrl+E">
            源码
          </button>
        </div>
        <div className="view-tabs" style={{ marginLeft: 6 }} title="布局 Ctrl+\">
          <button className={layout === 'split' ? 'active' : ''} onClick={() => setLayout('split')}>
            ⫿ 拆分
          </button>
          <button className={layout === 'edit' ? 'active' : ''} onClick={() => setLayout('edit')}>
            ▮ 仅编辑
          </button>
          <button className={layout === 'preview' ? 'active' : ''} onClick={() => setLayout('preview')}>
            ◫ 仅预览
          </button>
        </div>
      </div>
      <FormatToolbar disabled={!current} onImage={() => setImgOpen(true)} />
      {current ? (
        editorMode === 'ir' ? (
          <VditorEditor
            value={doc}
            docKey={`${bookDir}/${current}`}
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
        <button className="primary" disabled={!bookDir || compiling} onClick={() => void compile()}>
          {compiling ? '⟳ 编译中…' : '编译 PDF'}
        </button>
        {pdfPath && (
          <button className="small" onClick={() => api.book.openPdf(bookDir!)}>
            系统打开
          </button>
        )}
      </div>
      {status && <div className="compile-status">{status}</div>}
      {preview === 'html' ? (
        <MarkdownPreview markdown={doc} baseDir={chapterDir} />
      ) : pdfPath ? (
        <iframe key={pdfVersion} className="pdf-frame" src={fileUrl(pdfPath)} title="PDF 预览" />
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
            <div className="sidebar-section">
              <button className="ghost" style={{ width: '100%' }} onClick={() => setView('manage')}>
                ← 返回书籍列表
              </button>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                />
              )}
            </div>
            {diagOpen && diags.length > 0 && (
              <div className="sidebar-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, maxHeight: 210, overflowY: 'auto' }}>
                <div className="sidebar-title">诊断（{diags.length}）</div>
                {diags.map((d, i) => (
                  <div
                    key={i}
                    className={`diag-item ${d.severity}`}
                    style={{ paddingLeft: 4, paddingRight: 4 }}
                    onClick={() => {
                      setDiagIndex(i)
                      jumpToDiag(d)
                    }}
                  >
                    <span>{d.severity === 'error' ? '✗' : '⚠'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.message}</span>
                    <span className="diag-file">{d.file}:{d.line}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}

        {layout === 'split' && <SplitPane left={editorPane} right={previewPane} />}
        {layout === 'edit' && editorPane}
        {layout === 'preview' && previewPane}
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
}: {
  summary: SummaryItem[]
  current: string | null
  manage: boolean
  onSelect: (path: string) => void
  onReload: () => void
  bookDir: string
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

  const rename = (item: SummaryItem) => {
    const title = prompt('新标题', item.title)
    if (!title || title === item.title) return
    const fileName = manage && confirm('同时重命名文件？（取消则仅改标题）')
      ? prompt('新文件名', item.path!.split('/').pop()!) ?? undefined
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
          <div className={`tree-item${current === item.path ? ' active' : ''}`} style={{ flex: 1, minWidth: 0 }} onClick={() => !manage && onSelect(item.path!)}>
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
