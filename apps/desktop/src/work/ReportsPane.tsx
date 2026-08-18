import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '@booktool/shared'
import { api } from '../api'
import VditorEditor from '../components/VditorEditor'
import MarkdownPreview from '../components/MarkdownPreview'
import FormatToolbar from '../components/FormatToolbar'
import { EditorCtx } from '../edit/EditorContext'
import type { EditorHandle } from '../edit/formatCommands'

interface Props {
  project: Project
  file: string
  /** addToday 返回的文件与当前不一致（周轮换等）时通知父组件切换 */
  onFile?: (file: string) => void
}

/** 工作日报编辑器：每周一个 md 文件，Vditor 编辑 + 500ms 防抖自动保存；可追加今日章节 */
export default function ReportsPane({ project, file, onFile }: Props) {
  const [doc, setDoc] = useState('')
  const [saved, setSaved] = useState(true)
  /** 内容就绪后才挂载 Vditor（Vditor 只在 docKey 变化时重建、忽略 value 变化，
   *  异步 setDoc 需先于挂载，否则编辑区一直为空）。 */
  const [loaded, setLoaded] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  /** addToday 追加后自增：Vditor 只按 docKey 重建，故用版本号触发重载 */
  const [version, setVersion] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const vdHandleRef = useRef<EditorHandle | null>(null)

  useEffect(() => {
    const my = ++seq.current
    setLoaded(false)
    if (!file) return
    void api.work.reportRead(project.id, file).then((r: { content: string }) => {
      if (my !== seq.current) return
      setDoc(r.content)
      setSaved(true)
      setLoaded(true)
    }).catch((e) => {
      if (my !== seq.current) return
      alert('读取日报失败：' + String(e))
      setLoaded(true)
    })
  }, [project.id, file])

  const onChange = (v: string) => {
    setDoc(v)
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void api.work.reportWrite(project.id, file, v)
      setSaved(true)
    }, 500)
  }

  const addToday = async () => {
    try {
      // 先落盘当前草稿，避免追加后重载丢失未保存的编辑
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      await api.work.reportWrite(project.id, file, doc)
      const r = await api.work.reportAddToday(project.id)
      // setDoc 与 setVersion 同批提交：docKey 变化触发 Vditor 重建时已带着新内容
      setDoc(r.content)
      setSaved(true)
      if (r.file !== file) onFile?.(r.file)
      setVersion((v) => v + 1)
    } catch (e) {
      alert('新增今日日报失败：' + String(e))
    }
  }

  const baseDir = useMemo(() => `${project.dir}/reports`, [project.dir])

  if (!file) {
    return <div className="preview" style={{ color: 'var(--muted)' }}>该项目还没有日报文件</div>
  }

  return (
    <EditorCtx.Provider value={vdHandleRef.current}>
      <div className="content-area">
        <div className="pane">
          <div className="pane-header">
            <span className="doc-title" title={file}>
              {file}
            </span>
            <span className={`save-state${saved ? '' : ' dirty'}`}>{saved ? '✓ 已保存' : '● 保存中…'}</span>
            <span className="spacer" />
            <button className="small" onClick={() => void addToday()} title="在当前周日报末尾新增今天（## 日期 周X）章节">
              ＋ 今日日报
            </button>
            <button className="small" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? '隐藏预览' : '显示预览'}
            </button>
          </div>
          <FormatToolbar />
          {loaded ? (
            <VditorEditor
              value={doc}
              docKey={`${project.id}/report/${file}#${version}`}
              baseDir={baseDir}
              onChange={onChange}
              handleRef={vdHandleRef}
              key={`ir-report-${project.id}/${file}#${version}`}
            />
          ) : (
            <div className="editor-host vditor-host" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              加载中…
            </div>
          )}
        </div>
        {showPreview && (
          <div className="pane">
            <div className="pane-header">预览</div>
            <MarkdownPreview markdown={doc} baseDir={baseDir} />
          </div>
        )}
      </div>
    </EditorCtx.Provider>
  )
}
