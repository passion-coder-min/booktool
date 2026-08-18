import { useEffect, useRef, useState } from 'react'
import type { Project } from '@booktool/shared'
import { api } from '../api'
import VditorEditor from '../components/VditorEditor'
import FormatToolbar from '../components/FormatToolbar'
import { EditorCtx } from '../edit/EditorContext'
import type { EditorHandle } from '../edit/formatCommands'

interface Props {
  project: Project
  onMutated: () => void
}

/** 任务清单：直接编辑 tasks.md（markdown checkbox），唯一添加方式；保存后触发看板/四象限刷新 */
export default function TaskChecklist({ project, onMutated }: Props) {
  const [doc, setDoc] = useState('')
  const [saved, setSaved] = useState(true)
  /** 内容就绪后才挂载 Vditor（Vditor 只在 docKey 变化时重建、忽略 value 变化，
   *  异步 setDoc 需先于挂载，否则编辑区一直为空）。 */
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const vdHandleRef = useRef<EditorHandle | null>(null)

  useEffect(() => {
    const my = ++seq.current
    setLoaded(false)
    void api.work.taskChecklistRead(project.id)
      .then((r: { content: string }) => {
        if (my !== seq.current) return
        setDoc(r.content)
        setSaved(true)
        setLoaded(true)
      })
      .catch((e) => {
        if (my !== seq.current) return
        alert('读取任务清单失败：' + String(e))
        setLoaded(true)
      })
  }, [project.id])

  const onChange = (v: string) => {
    setDoc(v)
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void api.work.taskChecklistWrite(project.id, v)
      setSaved(true)
      onMutated()
    }, 500)
  }

  return (
    <EditorCtx.Provider value={vdHandleRef.current}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <FormatToolbar />
        {loaded ? (
          <VditorEditor
            value={doc}
            docKey={`${project.id}/tasks`}
            baseDir={project.dir}
            onChange={onChange}
            handleRef={vdHandleRef}
            key={`ir-tasks-${project.id}`}
          />
        ) : (
          <div
            className="editor-host vditor-host"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
          >
            加载中…
          </div>
        )}
      </div>
    </EditorCtx.Provider>
  )
}
