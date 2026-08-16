import { useState } from 'react'
import { api } from '../api'

/**
 * 插入图片对话框 —— 两种方式：
 * 1. 图床/外链：直接填 URL
 * 2. 本地文件：选择后自动复制到章节同目录 assets/，插入相对路径（打包后 PDF 自包含）
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
            本地文件（复制到 assets/）
          </button>
          <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>
            图床 / 外链 URL
          </button>
        </div>

        {mode === 'local' ? (
          <div className="form-row">
            <label>选择图片（自动复制到当前章节的 assets/ 目录，PDF 编译自包含）</label>
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
