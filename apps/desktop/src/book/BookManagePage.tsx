import { useEffect, useState } from 'react'
import type { WorkspaceInfo, LoadedBook, BookSearchAllMatch } from '@booktool/shared'
import { api } from '../api'
import { join } from '../path'
import EmptyCard from '../components/EmptyCard'
import type { SingleFile } from './SingleFileMode'

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
  onOpenBook: (dir: string, name: string) => void
  /** 打开单个 markdown 文件（独立编辑模式） */
  onOpenSingleFile: (file: SingleFile) => void
  /** 跨书搜索命中 → 打开对应书并跳到章节行 */
  onOpenMatch?: (m: BookSearchAllMatch) => void
}

/** 书籍管理页（出版活动第一级）：卡片网格 + CRUD + 版本管理 + 打开目录/单个文件 + 跨书搜索 */
export default function BookManagePage({ workspace, onChanged, onOpenBook, onOpenSingleFile, onOpenMatch }: Props) {
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [versioning, setVersioning] = useState<{ dir: string; name: string } | null>(null)
  const [error, setError] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [matches, setMatches] = useState<BookSearchAllMatch[] | null>(null)

  // 跨书全文搜索（300ms 防抖）
  useEffect(() => {
    const q = searchQ.trim()
    if (!q) {
      setMatches(null)
      return
    }
    const t = setTimeout(() => {
      void api.book.searchAll(q).then(setMatches).catch((e) => setError(String(e)))
    }, 300)
    return () => clearTimeout(t)
  }, [searchQ])

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      setError('')
      await fn()
      onChanged()
    } catch (e) {
      setError(String(e))
    }
  }

  const create = async (name: string, title: string, authors: string) => {
    await guard(() => api.book.create(name, title, authors ? authors.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : []))
    setCreating(false)
  }

  /** 删除书籍：两级确认。一级【确定】=仅从管理列表移除（默认，文件保留、可恢复）；
   *  一级取消后进入二级，【确定】才彻底删除目录（不可恢复）。 */
  const remove = async (name: string) => {
    if (
      confirm(
        `从管理列表移除书籍「${name}」？\n\n` +
          '【确定】仅移除出管理列表，书籍文件保留在 books/ 目录（可在下方"已移除书籍"中恢复）\n' +
          '【取消】不移除，继续询问是否彻底删除',
      )
    ) {
      await guard(() => api.book.hide(name))
      return
    }
    if (!confirm(`要彻底删除书籍「${name}」吗？\n\n将删除整个书籍目录（含全部源文件），不可恢复！`)) return
    await guard(() => api.book.remove(name))
  }

  const unhide = async (name: string) => {
    await guard(() => api.book.unhide(name))
  }

  /** 打开外部目录（mdBook 兼容书籍）并注册，随后自动打开 */
  const openDirectory = async () => {
    try {
      setError('')
      const prev = new Set((workspace?.externalBooks ?? []).map((b) => b.dir))
      const ws = await api.book.openDirectory()
      if (ws) {
        onChanged()
        const added = ws.externalBooks.find((b) => !prev.has(b.dir))
        if (added) onOpenBook(added.dir, added.name)
      }
    } catch (e) {
      setError(String(e))
    }
  }

  /** 打开单个 markdown 文件（独立编辑，可导出 PDF） */
  const openSingleFile = async () => {
    try {
      setError('')
      const f = await api.file.open()
      if (f) onOpenSingleFile(f)
    } catch (e) {
      setError(String(e))
    }
  }

  const removeExternal = async (dir: string) => {
    if (!confirm('移除该外部书籍引用？（不会删除原目录）')) return
    await guard(() => api.book.removeExternal(dir))
  }

  if (!workspace || (workspace.books.length === 0 && workspace.externalBooks.length === 0)) {
    return (
      <>
      <EmptyCard
        icon="📚"
        title="还没有书籍"
        desc={
          <>
            书籍 = 一本可编译为 PDF 的 Markdown 著作。
            <br />
            可直接「打开目录」导入现有 mdBook 项目，或「打开单个文件」独立编辑任意 Markdown。
          </>
        }
        actions={
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={() => setCreating(true)}>
              + 新建书籍
            </button>
            <button className="ghost" onClick={() => void openDirectory()}>
              📂 打开目录（mdBook）
            </button>
            <button className="ghost" onClick={() => void openSingleFile()}>
              📄 打开单个文件
            </button>
          </span>
        }
      />
      {workspace && workspace.hiddenBooks.length > 0 && (
        <HiddenBooksRow hidden={workspace.hiddenBooks} onUnhide={unhide} />
      )}
      </>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <h2 style={{ fontSize: 16 }}>我的书籍（{workspace.books.length + workspace.externalBooks.length}）</h2>
        <input
          type="text"
          placeholder="🔍 全部书籍全文搜索…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          style={{ width: 240, marginLeft: 10 }}
        />
        <span style={{ flex: 1 }} />
        <button className="ghost" onClick={() => void openDirectory()} title="导入现有 mdBook 项目目录（原位置引用）">
          📂 打开目录
        </button>
        <button className="ghost" onClick={() => void openSingleFile()} title="独立编辑任意 Markdown 文件并导出 PDF">
          📄 单个文件
        </button>
        <button className="primary" onClick={() => setCreating(true)}>
          + 新建书籍
        </button>
      </div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 13 }}>⚠ {error}</div>}

      {matches !== null && (
        <div style={{ marginBottom: 16 }}>
          <div className="sidebar-title" style={{ padding: '0 0 6px' }}>
            搜索「{searchQ.trim()}」命中 {matches.length} 条{matches.length >= 500 ? '（已达上限）' : ''}
          </div>
          <div className="search-results" style={{ maxHeight: 260 }}>
            {matches.length === 0 && <div className="search-empty">无结果</div>}
            {matches.map((m, i) => (
              <div key={i} className="search-item" onClick={() => onOpenMatch?.(m)}>
                <span className="search-file">
                  {m.bookName} · {m.file}:{m.line}
                </span>
                <span className="search-text">{m.text.trim()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="book-grid">
        {workspace.books.map((name) => (
          <BookCard
            key={name}
            name={name}
            onOpen={() => onOpenBook(join(workspace.root, 'books', name), name)}
            onRename={() => setRenaming(name)}
            onDelete={() => void remove(name)}
            onVersions={() => setVersioning({ dir: join(workspace.root, 'books', name), name })}
          />
        ))}
        {workspace.externalBooks.map((b) => (
          <ExternalCard key={b.dir} name={b.name} dir={b.dir} onOpen={() => onOpenBook(b.dir, b.name)} onRemove={() => void removeExternal(b.dir)} />
        ))}
      </div>

      {workspace.hiddenBooks.length > 0 && (
        <HiddenBooksRow hidden={workspace.hiddenBooks} onUnhide={unhide} />
      )}

      {creating && <NewBookModal onClose={() => setCreating(false)} onSubmit={create} />}
      {renaming && (
        <RenameModal
          title="重命名书籍"
          initial={renaming}
          label="目录名（同时修改书内 book.toml 请在版本管理中调整标题）"
          onClose={() => setRenaming(null)}
          onSubmit={async (v) => {
            await guard(() => api.book.rename(renaming, v))
            setRenaming(null)
          }}
        />
      )}
      {versioning && <VersionModal dir={versioning.dir} name={versioning.name} onClose={() => setVersioning(null)} onChanged={onChanged} />}
    </div>
  )
}

function BookCard({
  name,
  onOpen,
  onRename,
  onDelete,
  onVersions,
}: {
  name: string
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  onVersions: () => void
}) {
  return (
    <div className="book-card" onDoubleClick={onOpen}>
      <div className="book-card-cover" onClick={onOpen}>
        <span className="book-card-glyph">📖</span>
      </div>
      <div className="book-card-title" title={name} onClick={onOpen}>
        {name}
      </div>
      <div className="book-card-actions">
        <button onClick={onOpen}>打开</button>
        <button onClick={onVersions}>版本</button>
        <button onClick={onRename}>重命名</button>
        <button className="danger" onClick={onDelete}>
          删除
        </button>
      </div>
    </div>
  )
}

function ExternalCard({ name, dir, onOpen, onRemove }: { name: string; dir: string; onOpen: () => void; onRemove: () => void }) {
  return (
    <div className="book-card" onDoubleClick={onOpen} title={dir}>
      <div className="book-card-cover" onClick={onOpen}>
        <span className="book-card-glyph">📂</span>
      </div>
      <div className="book-card-title" onClick={onOpen}>
        {name}
        <span className="external-tag">外部</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dir}>
        {dir}
      </div>
      <div className="book-card-actions">
        <button onClick={onOpen}>打开</button>
        <button className="danger" onClick={onRemove}>
          移除
        </button>
      </div>
    </div>
  )
}

/** 已从管理列表移除（仅隐藏、文件保留）的书籍：点击恢复重新显示 */
function HiddenBooksRow({ hidden, onUnhide }: { hidden: string[]; onUnhide: (name: string) => void }) {
  return (
    <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--muted)' }}>
      <span>已移除书籍（文件保留，点击恢复）：</span>
      {hidden.map((name) => (
        <button
          key={name}
          className="small ghost"
          style={{ marginRight: 6 }}
          title={`恢复「${name}」到管理列表`}
          onClick={() => onUnhide(name)}
        >
          ↩ {name}
        </button>
      ))}
    </div>
  )
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function NewBookModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, title: string, authors: string) => void }) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  return (
    <ModalShell title="新建书籍" onClose={onClose}>
      <div className="form-row">
        <label>目录名（字母数字连字符）</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-book" autoFocus />
      </div>
      <div className="form-row">
        <label>书名</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="我的技术手册" />
      </div>
      <div className="form-row">
        <label>作者（逗号分隔）</label>
        <input value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="张三, 李四" />
      </div>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          取消
        </button>
        <button className="primary" disabled={!name.trim()} onClick={() => onSubmit(name.trim(), title.trim() || name.trim(), authors)}>
          创建
        </button>
      </div>
    </ModalShell>
  )
}

function RenameModal({
  title,
  label,
  initial,
  onClose,
  onSubmit,
}: {
  title: string
  label: string
  initial: string
  onClose: () => void
  onSubmit: (v: string) => void | Promise<void>
}) {
  const [v, setV] = useState(initial)
  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="form-row">
        <label>{label}</label>
        <input value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      </div>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          取消
        </button>
        <button className="primary" disabled={!v.trim() || v === initial} onClick={() => void onSubmit(v.trim())}>
          确定
        </button>
      </div>
    </ModalShell>
  )
}

function VersionModal({ dir, name, onClose, onChanged }: { dir: string; name: string; onClose: () => void; onChanged: () => void }) {
  const [book, setBook] = useState<LoadedBook | null>(null)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [versions, setVersions] = useState<{ key: string; name: string; path: string }[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void api.book.load(dir).then((b) => {
      setBook(b)
      setTitle(b.config.title)
      setAuthors(b.config.authors.join(', '))
      setVersions(b.config.versions)
      setActive(b.config.activeVersion)
      setLoaded(true)
    })
  }, [dir])

  const save = async () => {
    try {
      await api.book.writeToml(
        dir,
        title,
        authors.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        versions,
        active,
      )
      onChanged()
      onClose()
    } catch (e) {
      setError(String(e))
    }
  }

  const update = (i: number, patch: Partial<{ key: string; name: string; path: string }>) => {
    setVersions(versions.map((v, k) => (k === i ? { ...v, ...patch } : v)))
  }

  return (
    <ModalShell title={`版本管理 · ${name}`} onClose={onClose}>
      {!loaded ? (
        <p>加载中…</p>
      ) : (
        <>
          <div className="form-row">
            <label>书名</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-row">
            <label>作者（逗号分隔）</label>
            <input value={authors} onChange={(e) => setAuthors(e.target.value)} />
          </div>
          <h3 style={{ margin: '14px 0 6px', fontSize: 13.5 }}>多版本（编译源目录切换）</h3>
          {versions.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>
              暂无版本（使用默认 src/）。添加版本如 v1 → versions/v1，可在多语言/多版次场景切换编译目录。
            </p>
          )}
          {versions.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input type="radio" checked={active === v.key} onChange={() => setActive(v.key)} title="设为编译版本" />
              <input value={v.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="key" style={{ width: 70 }} />
              <input value={v.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="名称" style={{ width: 110 }} />
              <input value={v.path} onChange={(e) => update(i, { path: e.target.value })} placeholder="versions/v1" style={{ flex: 1 }} />
              <button className="small danger-btn" onClick={() => setVersions(versions.filter((_, k) => k !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button
            className="ghost"
            onClick={() => setVersions([...versions, { key: `v${versions.length + 1}`, name: `版本 ${versions.length + 1}`, path: `versions/v${versions.length + 1}` }])}
          >
            + 添加版本
          </button>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            <input type="radio" checked={active === null} onChange={() => setActive(null)} /> 使用默认 src/ 目录
          </p>
          {error && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</p>}
          <div className="modal-actions">
            <button className="ghost" onClick={onClose}>
              取消
            </button>
            <button className="primary" onClick={() => void save()}>
              保存到 book.toml
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}

export { ModalShell, RenameModal }
