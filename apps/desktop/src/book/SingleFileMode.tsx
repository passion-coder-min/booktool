import { useCallback, useEffect, useRef, useState } from 'react'
import type { CompileReport } from '@booktool/shared'
import { api, fileUrl } from '../api'
import { dirname } from '../path'
import Editor from '../components/Editor'
import VditorEditor from '../components/VditorEditor'
import MarkdownPreview from '../components/MarkdownPreview'
import FormatToolbar from '../components/FormatToolbar'
import DiagnosticsPanel from '../components/DiagnosticsPanel'
import SplitPane, { usePersistedState, type LayoutMode } from '../components/SplitPane'
import { EditorCtx } from '../edit/EditorContext'
import type { EditorHandle } from '../edit/formatCommands'
import type { BookCommands } from '../book/BookMode'

type EditorMode = 'ir' | 'source'
type PreviewMode = 'html' | 'pdf'

export interface SingleFile {
  absPath: string
  name: string
  content: string
}

interface Props {
  file: SingleFile
  onClose: () => void
  onRegisterCommands: (c: BookCommands | null) => void
}

/**
 * 单个 markdown 文件编辑模式：不依赖书籍结构，直接编辑任意 .md，
 * 支持保存到原文件、导出为 PDF（复用书籍的模板/字体/诊断管线）。
 */
export default function SingleFileMode({ file, onClose, onRegisterCommands }: Props) {
  const [doc, setDoc] = useState(file.content)
  const [saved, setSaved] = useState(true)
  const [editorMode, setEditorMode] = usePersistedState<EditorMode>('booktool-editor-mode', 'ir')
  const [preview, setPreview] = usePersistedState<PreviewMode>('booktool-preview-mode', 'html')
  const [layout, setLayout] = usePersistedState<LayoutMode>('booktool-layout', 'split')
  const [irPreview, setIrPreview] = usePersistedState('booktool-ir-preview', false)
  const [compiling, setCompiling] = useState(false)
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<CompileReport | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [pdfVersion, setPdfVersion] = useState(0)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const pdfBlobUrlRef = useRef<string | null>(null)
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagIndex, setDiagIndex] = useState(-1)

  const cmHandleRef = useRef<EditorHandle | null>(null)
  const vdHandleRef = useRef<EditorHandle | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc

  // 文件内容可能异步就绪（如 hash 打开流程），或切换了新文件 → 同步 doc
  useEffect(() => {
    setDoc(file.content)
    setSaved(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.absPath, file.content])

  // 保存到原文件（防抖）
  const save = useCallback(() => {
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void api.file.save(file.absPath, docRef.current).then(() => setSaved(true))
    }, 400)
  }, [file.absPath])

  // 导出 PDF：选择保存位置 → 编译（含 Mermaid/字体/诊断），成功后打开
  const compilePdf = useCallback(async () => {
    if (compiling) return null
    setCompiling(true)
    setStatus('导出 PDF …')
    try {
      const r = await api.file.compile(file.absPath)
      setReport(r)
      setPdfPath(r?.pdfPath ?? null)
      setPdfVersion((v) => v + 1)
      // 与书籍模式一致：仅 error 自动弹出于底部并选中首条错误；只有警告
      // 不自动弹（点状态栏诊断查看）；干净编译自动收起
      const ds = r?.diagnostics ?? []
      const hasErr = ds.some((d) => d.severity === 'error')
      if (hasErr) {
        setDiagOpen(true)
        const firstErr = ds.findIndex((d) => d.severity === 'error')
        setDiagIndex(firstErr >= 0 ? firstErr : 0)
      } else {
        setDiagOpen(false)
        setDiagIndex(-1)
      }
      setStatus(r ? (r.ok ? `导出完成 ${(r.durationMs / 1000).toFixed(1)}s` : '导出失败，请查看诊断') : '已取消')
      return r
    } catch (err) {
      setStatus('导出异常：' + String(err))
      return null
    } finally {
      setCompiling(false)
    }
  }, [file.absPath, compiling])

  // 编译完成后 PDF 读入 Blob URL 供 iframe 预览
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

  useEffect(
    () => () => {
      if (pdfBlobUrlRef.current) URL.revokeObjectURL(pdfBlobUrlRef.current)
    },
    [],
  )

  const openPdfInApp = useCallback(() => {
    setPreview('pdf')
    if (editorMode === 'ir') setIrPreview(true)
    else setLayout((l) => (l === 'edit' ? 'split' : l))
  }, [editorMode, setPreview, setIrPreview, setLayout])

  const openSystem = useCallback(() => {
    if (pdfPath) void api.book.openPdf('', pdfPath)
  }, [pdfPath])

  // 注册全局命令（保存/编译/模式/预览/诊断），供快捷键与底部状态栏使用
  useEffect(() => {
    onRegisterCommands({
      saveAndCompile: () => {
        save()
        void compilePdf()
      },
      exportPdf: () => {
        void compilePdf().then((r) => {
          if (r?.ok && r.pdfPath) void api.book.openPdf('', r.pdfPath)
        })
      },
      createNew: () => undefined,
      jumpDiagnostic: () => undefined,
      togglePreview: () => setPreview((p) => (p === 'html' ? 'pdf' : 'html')),
      toggleEditorMode: () => setEditorMode((m) => (m === 'ir' ? 'source' : 'ir')),
      toggleSidebar: () => undefined,
      cycleLayout: () => {
        if (editorMode === 'ir') return
        setLayout((l) => (l === 'split' ? 'edit' : l === 'edit' ? 'preview' : 'split'))
      },
      openDiagnostics: () => setDiagOpen((v) => !v),
      openPdf: openSystem,
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
          pdfRel: pdfPath,
          pdfPath,
        }
      },
    })
    return () => onRegisterCommands(null)
  }, [onRegisterCommands, report, compiling, status, pdfPath, openPdfInApp, openSystem, save, compilePdf, editorMode, setEditorMode, setPreview, setLayout])

  const diags = report?.diagnostics ?? []
  const effectiveLayout: LayoutMode = editorMode === 'ir' ? (irPreview ? 'split' : 'edit') : layout
  const baseDir = dirname(file.absPath)

  const toolbar = (
    <div className="editor-toolbar">
      <div className="et-group et-left">
        <button className="ft-btn et-icon" title="返回书籍列表" onClick={onClose}>
          ←
        </button>
        <span className="doc-title" title={file.absPath}>
          {file.name}
        </span>
        <span className={`save-state${saved ? '' : ' dirty'}`}>{saved ? '✓ 已保存' : '● 保存中…'}</span>
      </div>
      <FormatToolbar disabled={false} onImage={() => undefined} />
      <div className="et-group et-right">
        <button className={`btn-compile${diagOpen && diags.length > 0 ? ' has-diag' : ''}`} disabled={compiling} onClick={() => void compilePdf()} title="导出为 PDF（选择保存位置，Ctrl+S）">
          {compiling ? '⟳ 导出中…' : '导出 PDF'}
        </button>
        <button className={`ft-btn et-icon diag-toggle${diags.length > 0 ? ' has-diag' : ''}`} onClick={() => setDiagOpen((v) => !v)} title={`编译输出 / 诊断（${diags.length}）`}>
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
          <button className={`ft-btn et-icon preview-toggle${irPreview ? ' active' : ''}`} onClick={() => setIrPreview((v) => !v)} title="所见即所得模式下并排显示/隐藏预览">
            ◫ 预览
          </button>
        )}
      </div>
    </div>
  )

  const editorPane = (
    <section className="pane">
      {editorMode === 'ir' ? (
        <VditorEditor
          value={doc}
          docKey={`single-${file.absPath}`}
          baseDir={baseDir}
          onChange={(v) => {
            setDoc(v)
            save()
          }}
          handleRef={vdHandleRef}
          onError={(msg) => {
            if (msg === 'switch-source') setEditorMode('source')
          }}
          key={`sir-${file.absPath}`}
        />
      ) : (
        <Editor
          value={doc}
          docKey={`single-${file.absPath}`}
          onChange={(v) => {
            setDoc(v)
            save()
          }}
          handleRef={cmHandleRef}
          key={`ssrc-${file.absPath}`}
        />
      )}
    </section>
  )

  const previewPane = (
    <section className="pane">
      <div className="pane-header">
        <div className="view-tabs">
          <button className={preview === 'html' ? 'active' : ''} onClick={() => setPreview('html')}>
            HTML 预览
          </button>
          <button className={preview === 'pdf' ? 'active' : ''} onClick={() => setPreview('pdf')}>
            PDF 预览
          </button>
        </div>
        <span className="spacer" />
        {pdfPath && (
          <button className="small" onClick={openSystem}>
            系统打开
          </button>
        )}
        <button
          className="small"
          title="关闭预览"
          onClick={() => {
            if (editorMode === 'ir') setIrPreview(false)
            else setLayout('edit')
          }}
        >
          ✕
        </button>
      </div>
      {preview === 'html' ? (
        <MarkdownPreview markdown={doc} baseDir={baseDir} />
      ) : pdfUrl ? (
        <iframe key={pdfVersion} className="pdf-frame" src={pdfUrl} title="PDF 预览" />
      ) : pdfPath ? (
        <div className="diag-empty" style={{ padding: 16 }}>
          正在加载 PDF…
        </div>
      ) : (
        <div className="diag-empty" style={{ padding: 16 }}>
          点击「导出 PDF」选择保存位置并编译。
        </div>
      )}
    </section>
  )

  return (
    <EditorCtx.Provider value={editorMode === 'ir' ? vdHandleRef.current : cmHandleRef.current}>
      <div className="workbench" style={{ flexDirection: 'column' }}>
        {toolbar}
        {/* workbench-main 保持纵向（CSS 默认）：编辑/预览区在上，诊断面板在下方 */}
        <div className="workbench-main">
          {effectiveLayout === 'split' && <SplitPane left={editorPane} right={previewPane} />}
          {effectiveLayout === 'edit' && editorPane}
          {effectiveLayout === 'preview' && previewPane}
          {diagOpen && (
            <DiagnosticsPanel
              diagnostics={diags}
              selected={diagIndex}
              onSelect={(i) => setDiagIndex(i)}
              onClose={() => setDiagOpen(false)}
            />
          )}
        </div>
      </div>
    </EditorCtx.Provider>
  )
}
