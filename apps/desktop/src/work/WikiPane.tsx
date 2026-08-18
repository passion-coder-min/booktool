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
}

export default function WikiPane({ project, file }: Props) {
  const [doc, setDoc] = useState('')
  const [saved, setSaved] = useState(true)
  /** 内容就绪后才挂载 Vditor：Vditor 只在 docKey 变化时重建、忽略 value 变化，
   *  若先挂载后异步 setDoc，编辑区会一直是空（见 AGENTS.md「VditorEditor 坑」）。 */
  const [loaded, setLoaded] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const vdHandleRef = useRef<EditorHandle | null>(null)

  useEffect(() => {
    const my = ++seq.current
    setLoaded(false)
    if (!file) return
    void api.work.wikiRead(project.id, file).then((r: { content: string }) => {
      if (my !== seq.current) return
      setDoc(r.content)
      setSaved(true)
      setLoaded(true)
    }).catch((e) => {
      if (my !== seq.current) return
      alert('读取 wiki 页面失败：' + String(e))
      setLoaded(true)
    })
  }, [project.id, file])

  const onChange = (v: string) => {
    setDoc(v)
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void api.work.wikiWrite(project.id, file, v)
      setSaved(true)
    }, 500)
  }

  const baseDir = useMemo(() => `${project.dir}/wiki`, [project.dir])

  if (!file) {
    return <div className="preview" style={{ color: 'var(--muted)' }}>该项目还没有 wiki 文件</div>
  }

  return (
    <EditorCtx.Provider value={vdHandleRef.current}>
      <div className="content-area">
        <div className="pane">
          <div className="pane-header">
            <span className="doc-title">{file}</span>
            <span className={`save-state${saved ? '' : ' dirty'}`}>{saved ? '✓ 已保存' : '● 保存中…'}</span>
            <span className="spacer" />
            <button className="small" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? '隐藏预览' : '显示预览'}
            </button>
          </div>
          <FormatToolbar />
          {loaded ? (
            <VditorEditor
              value={doc}
              docKey={`${project.id}/${file}`}
              baseDir={baseDir}
              onChange={onChange}
              handleRef={vdHandleRef}
              key={`ir-${project.id}/${file}`}
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
