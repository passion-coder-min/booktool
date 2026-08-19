import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceInfo } from '@booktool/shared'
import { api } from './api'
import { ThemeProvider, useTheme } from './theme'
import { useEditor } from './edit/EditorContext'
import type { FormatCmd } from './edit/formatCommands'
import ActivityBar, { type Activity } from './components/ActivityBar'
import StatusBar from './components/StatusBar'
import HelpModal from './components/HelpModal'
import PromptHost from './components/PromptHost'
import BookMode, { type BookCommands } from './book/BookMode'
import WorkActivity from './work/WorkActivity'
import CalendarActivity from './work/CalendarActivity'
import StatsActivity from './work/StatsActivity'
import SettingsPage from './settings/SettingsPage'

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}

function AppInner() {
  const { toggle: toggleTheme } = useTheme()
  const editor = useEditor()
  const [activity, setActivity] = useState<Activity>(() => {
    const h = decodeURIComponent(location.hash.slice(1))
    if (h.startsWith('work')) return 'work'
    if (h.startsWith('calendar')) return 'calendar'
    if (h.startsWith('stats')) return 'stats'
    if (h.startsWith('settings')) return 'settings'
    return 'book'
  })
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [bookCommands, setBookCommands] = useState<BookCommands | null>(null)

  const refresh = useCallback(() => void api.workspace.get().then(setWorkspace), [])
  useEffect(refresh, [refresh])

  // 「打开目录」：从任意活动打开外部书籍目录并加载内容。BookMode 可能未挂载，
  // 通过 ref + pending 兜底——挂载后（onRegisterBookOpen）会消费 pending。
  const NOOP_OPEN_BOOK = () => {}
  const bookOpenRef = useRef<(dir: string, name: string) => void>(NOOP_OPEN_BOOK)
  const pendingBookOpen = useRef<{ dir: string; name: string } | null>(null)
  const registerBookOpen = useCallback((fn: (dir: string, name: string) => void) => {
    bookOpenRef.current = fn
    if (pendingBookOpen.current) {
      const p = pendingBookOpen.current
      pendingBookOpen.current = null
      fn(p.dir, p.name)
    }
  }, [])

  const openBookDirectory = useCallback(async () => {
    const prev = new Set((workspace?.externalBooks ?? []).map((b) => b.dir))
    const ws = await api.book.openDirectory()
    if (!ws) return
    refresh()
    const added = ws.externalBooks.find((b) => !prev.has(b.dir))
    if (!added) return
    setActivity('book')
    if (bookOpenRef.current !== NOOP_OPEN_BOOK) bookOpenRef.current(added.dir, added.name)
    else pendingBookOpen.current = { dir: added.dir, name: added.name }
  }, [workspace, refresh])

  // 空工作区判定：外部书籍引用也视为已有内容（打开外部书后不再提示"工作区为空"）
  const empty =
    workspace !== null &&
    workspace.books.length === 0 &&
    workspace.projects.length === 0 &&
    (workspace.externalBooks ?? []).length === 0

  // 全局快捷键（编辑器内的格式快捷键由编辑器自身处理）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault()
        toggleTheme()
      } else if (mod && key === '/') {
        e.preventDefault()
        setHelpOpen((v) => !v)
      } else if (e.key === 'F8') {
        e.preventDefault()
        bookCommands?.jumpDiagnostic(e.shiftKey ? -1 : 1)
      } else if (mod && !e.shiftKey && key === 'p') {
        e.preventDefault()
        bookCommands?.togglePreview()
      } else if (mod && !e.shiftKey && key === 's') {
        e.preventDefault()
        bookCommands?.saveAndCompile()
      } else if (mod && !e.shiftKey && key === 'e') {
        e.preventDefault()
        bookCommands?.toggleEditorMode()
      } else if (mod && !e.shiftKey && key === 'n') {
        e.preventDefault()
        bookCommands?.createNew()
      } else if (mod && e.shiftKey && key === 'e') {
        e.preventDefault()
        bookCommands?.exportPdf()
      } else if (mod && key === '\\') {
        e.preventDefault()
        bookCommands?.cycleLayout()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleTheme, bookCommands])

  // 菜单命令 IPC -> 命令总线
  useEffect(() => {
    const off = api.onMenuCmd((cmd) => {
      const formatMap: Record<string, FormatCmd> = {
        h0: { type: 'heading', level: 0 },
        h1: { type: 'heading', level: 1 },
        h2: { type: 'heading', level: 2 },
        h3: { type: 'heading', level: 3 },
        h4: { type: 'heading', level: 4 },
        h5: { type: 'heading', level: 5 },
        h6: { type: 'heading', level: 6 },
        bold: { type: 'bold' },
        italic: { type: 'italic' },
        link: { type: 'link' },
        'inline-code': { type: 'inlineCode' },
        table: { type: 'table', rows: 3, cols: 3 },
        codeblock: { type: 'codeblock' },
        image: { type: 'image' },
        'math-inline': { type: 'mathInline' },
        'math-block': { type: 'mathBlock' },
        admonition: { type: 'admonition', kind: 'warning' },
        'list-bullet': { type: 'listBullet' },
        'list-ordered': { type: 'listOrdered' },
        'list-task': { type: 'listTask' },
        blockquote: { type: 'blockquote' },
        hr: { type: 'hr' },
        footnote: { type: 'footnote' },
      }
      if (cmd in formatMap) {
        editor?.apply(formatMap[cmd])
        return
      }
      switch (cmd) {
        case 'save-compile':
          bookCommands?.saveAndCompile()
          break
        case 'export-pdf':
          bookCommands?.exportPdf()
          break
        case 'new':
          bookCommands?.createNew()
          break
        case 'open-dir':
          // 打开外部书籍目录并加载其内容（而非打开系统文件管理器）
          void openBookDirectory()
          break
        case 'toggle-editor-mode':
          bookCommands?.toggleEditorMode()
          break
        case 'toggle-preview':
          bookCommands?.togglePreview()
          break
        case 'toggle-sidebar':
          bookCommands?.toggleSidebar()
          break
        case 'cycle-layout':
          bookCommands?.cycleLayout()
          break
        case 'toggle-theme':
          toggleTheme()
          break
        case 'help':
          setHelpOpen(true)
          break
      }
    })
    return off
  }, [editor, bookCommands, toggleTheme, workspace, openBookDirectory, registerBookOpen])

  return (
    <div className="app">
      <ActivityBar active={activity} onSelect={setActivity} />
      <div className="app-main">
        <div className="main-area">
          {empty && activity === 'book' && (
            <div className="empty-hint">
              <p>当前工作区为空。创建一个示例书籍与示例项目开始体验？</p>
              <button onClick={() => void api.workspace.initDemo().then(() => location.reload())}>
                初始化示例内容
              </button>
            </div>
          )}
          {activity === 'book' && (
            <BookMode
              workspace={workspace}
              onChanged={refresh}
              onRegisterCommands={setBookCommands}
              onRegisterBookOpen={registerBookOpen}
            />
          )}
          {activity === 'work' && <WorkActivity workspace={workspace} onChanged={refresh} />}
          {activity === 'calendar' && <CalendarActivity workspace={workspace} />}
          {activity === 'stats' && <StatsActivity workspace={workspace} />}
          {activity === 'settings' && <SettingsPage workspace={workspace} onChanged={refresh} />}
        </div>
        <StatusBar
          compileInfo={bookCommands?.statusBarInfo}
          onOpenDiagnostics={() => bookCommands?.openDiagnostics()}
          onOpenPdf={() => bookCommands?.openPdf()}
          onPreviewPdf={() => bookCommands?.previewPdf()}
        />
      </div>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      <PromptHost />
    </div>
  )
}
