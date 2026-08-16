import { app, dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { WorkspaceInfo, Project, ProjectMeta } from '@booktool/shared'

interface Settings {
  workspaceRoot: string | null
}

const settingsFile = () => join(app.getPath('userData'), 'settings.json')

export function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    return { workspaceRoot: null }
  }
}

export function writeSettings(s: Settings) {
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2))
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
  const books = existsSync(booksRoot)
    ? readdirSync(booksRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : []

  const projectsRoot = join(root, 'projects')
  const projects: Project[] = []
  if (existsSync(projectsRoot)) {
    for (const d of readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const dir = join(projectsRoot, d.name)
      const meta = readProjectMeta(dir, d.name)
      const wikiDir = join(dir, 'wiki')
      const wikiFiles = listMd(wikiDir)
      const taskCount = existsSync(join(dir, 'tasks'))
        ? readdirSync(join(dir, 'tasks')).filter((f) => f.endsWith('.md')).length
        : 0
      projects.push({ ...meta, dir, wikiFiles, taskCount })
    }
  }
  return { root, books, projects }
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
