import { app, dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { WorkspaceInfo, Project, ProjectMeta } from '@booktool/shared'

interface ExternalBookRef {
  name: string
  dir: string
}

interface Settings {
  workspaceRoot: string | null
  /** 外部打开的书籍（mdBook 兼容目录，原位置引用） */
  externalBooks?: ExternalBookRef[]
  /** 已从管理列表移除（仅隐藏，目录保留）的内置书籍名 */
  hiddenBooks?: string[]
}

const settingsFile = () => join(app.getPath('userData'), 'settings.json')

export function readSettings(): Settings {
  try {
    const s = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Settings
    return { externalBooks: [], ...s }
  } catch {
    return { workspaceRoot: null, externalBooks: [] }
  }
}

export function writeSettings(s: Settings) {
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2))
}

/** 注册一个外部书籍目录（mdBook 兼容），按目录名去重 */
export function addExternalBook(dir: string): void {
  const s = readSettings()
  const name = basename(dir) || '未命名书籍'
  const list = (s.externalBooks ?? []).filter((b) => b.dir !== dir)
  list.push({ name, dir })
  writeSettings({ ...s, externalBooks: list })
}

/** 移除外部书籍引用（不删目录） */
export function removeExternalBook(dir: string): void {
  const s = readSettings()
  writeSettings({ ...s, externalBooks: (s.externalBooks ?? []).filter((b) => b.dir !== dir) })
}

/** 选择并注册一个外部书籍目录 */
export async function chooseExternalBook(): Promise<WorkspaceInfo | null> {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled || !res.filePaths[0]) return null
  const dir = res.filePaths[0]
  // 目录须是书籍形态：存在 src/SUMMARY.md、src/*.md 或 book.toml 之一
  const isBook = existsSync(join(dir, 'book.toml')) || existsSync(join(dir, 'src', 'SUMMARY.md'))
  if (!isBook) throw new Error('所选目录不是书籍：需包含 book.toml 或 src/SUMMARY.md')
  addExternalBook(dir)
  return scanWorkspace()
}

export function getWorkspaceRoot(): string {
  const s = readSettings()
  if (s.workspaceRoot && existsSync(s.workspaceRoot)) return s.workspaceRoot
  // 首次启动：在用户数据目录创建示例工作区
  const root = join(app.getPath('userData'), 'workspace')
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
    mkdirSync(join(root, 'books'), { recursive: true })
    mkdirSync(join(root, 'projects'), { recursive: true })
    // 示例内容由 workspace:init-demo 按需创建
  }
  writeSettings({ workspaceRoot: root })
  return root
}

export async function chooseWorkspaceRoot(): Promise<string | null> {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled || !res.filePaths[0]) return null
  const root = res.filePaths[0]
  for (const dir of ['books', 'projects']) {
    if (!existsSync(join(root, dir))) mkdirSync(join(root, dir), { recursive: true })
  }
  writeSettings({ workspaceRoot: root })
  return root
}

export function scanWorkspace(): WorkspaceInfo {
  const root = getWorkspaceRoot()
  const booksRoot = join(root, 'books')
  const allBooks = existsSync(booksRoot)
    ? readdirSync(booksRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : []
  // 隐藏名单：仅从管理列表移除（目录保留在 books/ 下），其余照常显示
  const hidden = new Set(readSettings().hiddenBooks ?? [])
  const books = allBooks.filter((n) => !hidden.has(n))
  const hiddenBooks = allBooks.filter((n) => hidden.has(n))
  // 外部书籍：保留仍存在的目录
  const externalBooks = (readSettings().externalBooks ?? []).filter((b) => existsSync(b.dir))

  const projectsRoot = join(root, 'projects')
  const projects: Project[] = []
  if (existsSync(projectsRoot)) {
    for (const d of readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const dir = join(projectsRoot, d.name)
      const meta = readProjectMeta(dir, d.name)
      const wikiDir = join(dir, 'wiki')
      const wikiFiles = listMd(wikiDir)
      const reportFiles = listMd(join(dir, 'reports'))
      const taskCount = existsSync(join(dir, 'tasks'))
        ? readdirSync(join(dir, 'tasks')).filter((f) => f.endsWith('.md')).length
        : 0
      projects.push({ ...meta, dir, wikiFiles, reportFiles, taskCount })
    }
  }
  return { root, books, externalBooks, hiddenBooks, projects }
}

/** 仅从管理列表移除内置书籍（隐藏，不删除 books/ 目录） */
export function hideBook(name: string): WorkspaceInfo {
  const s = readSettings()
  const list = s.hiddenBooks ?? []
  if (!list.includes(name)) list.push(name)
  writeSettings({ ...s, hiddenBooks: list })
  return scanWorkspace()
}

/** 恢复被隐藏的内置书籍 */
export function unhideBook(name: string): WorkspaceInfo {
  const s = readSettings()
  writeSettings({ ...s, hiddenBooks: (s.hiddenBooks ?? []).filter((n) => n !== name) })
  return scanWorkspace()
}

function listMd(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  const walk = (d: string, prefix: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name), `${prefix}${e.name}/`)
      else if (e.name.endsWith('.md')) out.push(prefix + e.name)
    }
  }
  walk(dir, '')
  return out.sort()
}

function readProjectMeta(dir: string, fallbackId: string): ProjectMeta {
  try {
    const meta = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'))
    return {
      id: meta.id ?? fallbackId,
      name: meta.name ?? fallbackId,
      color: meta.color ?? '#4a90d9',
      description: meta.description ?? '',
    }
  } catch {
    return { id: fallbackId, name: fallbackId, color: '#4a90d9', description: '' }
  }
}
