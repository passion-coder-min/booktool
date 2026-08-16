import { useState } from 'react'
import { api } from '../api'

/**
 * 插入图片对话框 —— 多种方式：
 * 1. 本地文件：选择后自动复制到 书籍根/image/<文档名>/ 下（与拖拽/粘贴同目录），插入相对路径（PDF 编译自包含）
 * 2. 图床/外链：直接填 URL
 * （另支持编辑区直接 Ctrl+V 粘贴截图 / 拖拽图片文件，三者均存入同一 image/<文档名>/ 目录）
 */
export default function ImageDialog({
  bookDir,
  chapterPath,
  onClose,
  onInsert,
}: {
  bookDir: string
  chapterPath: string
  onClose: () => void
  onInsert: (path: string, alt: string) => void
}) {
  const [mode, setMode] = useState<'local' | 'url'>('local')
  const [alt, setAlt] = useState('')
  const [url, setUrl] = useState('')
  const [picked, setPicked] = useState<{ abs: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const docName = chapterPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'chapter'

  const pick = async () => {
    setError('')
    const abs = await api.image.pick()
    if (abs) setPicked({ abs, name: abs.split('/').pop() ?? 'image' })
  }

  const insert = async () => {
    setError('')
    try {
      setBusy(true)
      if (mode === 'url') {
        if (!url.trim()) return
        onInsert(url.trim(), alt.trim() || '图片')
      } else {
        if (!picked) return
        const rel = await api.image.import(bookDir, picked.abs, chapterPath)
        onInsert(rel, alt.trim() || picked.name.replace(/\.[^.]+$/, ''))
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2>插入图片</h2>
        <div className="view-tabs" style={{ marginBottom: 12 }}>
          <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}>
            本地文件（image/{docName}/）
          </button>
          <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>
            图床 / 外链 URL
          </button>
        </div>

        {mode === 'local' ? (
          <div className="form-row">
            <label>选择图片（自动复制到 书籍根/image/{docName}/ 目录，与 Ctrl+V 粘贴/拖拽同目录，PDF 编译自包含）</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ghost" onClick={() => void pick()}>
                选择文件…
              </button>
              {picked && (
                <span style={{ fontSize: 12.5, color: 'var(--ok)', alignSelf: 'center' }}>✓ {picked.name}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="form-row">
            <label>图片 URL（https:// 图床外链）</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cdn.example.com/pic.png" autoFocus />
          </div>
        )}

        <div className="form-row">
          <label>题注（图注，可为空）</label>
          <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="架构图" />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</p>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy || (mode === 'url' ? !url.trim() : !picked)} onClick={() => void insert()}>
            {busy ? '导入中…' : '插入'}
          </button>
        </div>
      </div>
    </div>
  )
}
