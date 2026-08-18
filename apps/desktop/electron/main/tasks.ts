/**
 * 任务存储（markdown checkbox 模型）：
 * 每项目一个 tasks.md，`- [ ] 标题 (重要) (紧急) @截止 ~计划 #标签` 一行一个任务；
 * 完成项超过阈值自动移入 tasks-done.md 归档。
 * 兼容旧模型：首次读取时把遗留的 tasks/*.md（frontmatter）迁移成 tasks.md。
 */
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { taskFrontmatterSchema, fmtDate, type Task, type TaskStatus, type TaskPriority } from '@booktool/shared'
import { atomicWrite } from './books'

/** 归档阈值：进行中任务超过该数量且存在完成项时，自动把完成行移入 tasks-done.md */
const ARCHIVE_THRESHOLD = 40

const STATUS_MARK: Record<TaskStatus, string> = { todo: ' ', doing: '/', blocked: 'B', done: 'x' }
const MARK_STATUS: Record<string, TaskStatus> = {
  ' ': 'todo',
  '': 'todo',
  '/': 'doing',
  'B': 'blocked',
  'x': 'done',
  'X': 'done',
}

/** 由标题稳定派生任务 id（重名视为同一任务，用于看板/日历引用） */
export function hashTitle(title: string): string {
  let h = 5381
  for (let i = 0; i < title.length; i++) h = ((h << 5) + h + title.charCodeAt(i)) >>> 0
  return `t-${h.toString(36)}`
}

/** checkbox 行 → Task；非任务行返回 null。默认象限：重要 · 不紧急 */
export function parseTaskLine(line: string, project: string): Task | null {
  const m = line.match(/^-\s*\[([^\]\n])\]\s+(.*)$/)
  if (!m) return null
  const status = MARK_STATUS[m[1]!.trim()] ?? 'todo'
  const tags: string[] = []
  let due: string | null = null
  let scheduled: string | null = null
  let importance = true
  let urgent = false
  const titleParts: string[] = []
  for (const w of m[2]!.split(/\s+/)) {
    if (/^#.+/.test(w)) tags.push(w.slice(1))
    else if (/^@\d{4}-\d{2}-\d{2}$/.test(w)) due = w.slice(1)
    else if (/^~\d{4}-\d{2}-\d{2}$/.test(w)) scheduled = w.slice(1)
    else if (w === '(不重要)') importance = false
    else if (w === '(重要)') importance = true
    else if (w === '(紧急)') urgent = true
    else titleParts.push(w)
  }
  const title = titleParts.join(' ').trim()
  if (!title) return null
  return {
    id: hashTitle(title),
    title,
    project,
    status,
    priority: urgent ? 'urgent' : 'normal',
    importance,
    due,
    scheduled,
    tags,
    links: [],
    dependencies: [],
    created: '',
    completed: status === 'done' ? new Date().toISOString() : null,
    body: '',
  }
}

/** Task → checkbox 行（重要为默认，省略；不重要标 `(不重要)`，紧急标 `(紧急)`） */
export function serializeTaskLine(t: Task): string {
  const suffix: string[] = []
  if (!t.importance) suffix.push('(不重要)')
  if (t.priority === 'urgent') suffix.push('(紧急)')
  for (const g of t.tags) suffix.push(`#${g}`)
  if (t.due) suffix.push(`@${t.due}`)
  if (t.scheduled) suffix.push(`~${t.scheduled}`)
  const tail = suffix.length ? ' ' + suffix.join(' ') : ''
  return `- [${STATUS_MARK[t.status]}] ${t.title}${tail}`
}

const tasksFile = (projectsRoot: string, project: string) => join(projectsRoot, project, 'tasks.md')

/** 旧模型 tasks/<id>.md（frontmatter）→ Task；损坏抛错 */
function readLegacyTaskFile(file: string, project: string): Task {
  const raw = readFileSync(file, 'utf8')
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) throw new Error(`任务文件缺少 frontmatter：${file}`)
  const fm = taskFrontmatterSchema.parse({ project, ...parseYaml(m[1]) })
  return { ...fm, body: m[2].trim() }
}

/** 无 tasks.md 但有旧 tasks/*.md 时，迁移生成 tasks.md（旧文件保留） */
function migrateLegacy(projectsRoot: string, project: string, file: string): void {
  if (existsSync(file)) return
  const legacyDir = join(projectsRoot, project, 'tasks')
  if (!existsSync(legacyDir)) return
  const files = readdirSync(legacyDir).filter((f) => f.endsWith('.md'))
  if (files.length === 0) return
  const tasks: Task[] = []
  for (const f of files) {
    try {
      tasks.push(readLegacyTaskFile(join(legacyDir, f), project))
    } catch {
      // 单个损坏文件跳过，不阻塞迁移
    }
  }
  if (tasks.length === 0) return
  mkdirSync(dirname(file), { recursive: true })
  atomicWrite(file, tasks.map(serializeTaskLine).join('\n') + '\n')
}

/** 项目任务清单原文（tasks.md） */
export function readProjectChecklist(projectsRoot: string, project: string): string {
  const file = tasksFile(projectsRoot, project)
  migrateLegacy(projectsRoot, project, file)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** 写入清单原文，随后触发完成项归档 */
export function writeChecklist(projectsRoot: string, project: string, content: string): void {
  const file = tasksFile(projectsRoot, project)
  mkdirSync(dirname(file), { recursive: true })
  atomicWrite(file, content)
  archiveCompleted(projectsRoot, project)
}

function parseChecklist(content: string, project: string): Task[] {
  const out: Task[] = []
  for (const line of content.split('\n')) {
    const t = parseTaskLine(line, project)
    if (t) out.push(t)
  }
  return out
}

/** 单项目进行中任务（触发迁移/归档） */
export function listProjectTasks(projectsRoot: string, project: string): Task[] {
  const tasks = parseChecklist(readProjectChecklist(projectsRoot, project), project)
  archiveCompleted(projectsRoot, project)
  return tasks.filter((t) => t.status !== 'done')
}

/** 跨项目任务汇总（日历/统计/看板/全局看板用） */
export function listTasks(projectsRoot: string): Task[] {
  if (!existsSync(projectsRoot)) return []
  const out: Task[] = []
  for (const proj of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue
    out.push(...listProjectTasks(projectsRoot, proj.name))
  }
  return out.sort((a, b) => (a.scheduled ?? '9999').localeCompare(b.scheduled ?? '9999'))
}

/** 项目进行中任务数量（工作区扫描用；兼容旧 tasks/ 目录） */
export function countProjectTasks(projectsRoot: string, project: string): number {
  const file = tasksFile(projectsRoot, project)
  if (existsSync(file)) return listProjectTasks(projectsRoot, project).length
  const legacyDir = join(projectsRoot, project, 'tasks')
  return existsSync(legacyDir) ? readdirSync(legacyDir).filter((f) => f.endsWith('.md')).length : 0
}

export interface TaskInput {
  title: string
  project: string
  status?: TaskStatus
  priority?: TaskPriority
  importance?: boolean
  due?: string | null
  scheduled?: string | null
  tags?: string[]
  body?: string
}

export function createTask(projectsRoot: string, input: TaskInput): Task {
  const now = new Date().toISOString()
  const task: Task = {
    id: hashTitle(input.title),
    title: input.title,
    project: input.project,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'normal',
    importance: input.importance ?? true,
    due: input.due ?? null,
    scheduled: input.scheduled ?? null,
    tags: input.tags ?? [],
    links: [],
    dependencies: [],
    created: now,
    completed: input.status === 'done' ? now : null,
    body: input.body ?? '',
  }
  const file = tasksFile(projectsRoot, task.project)
  mkdirSync(dirname(file), { recursive: true })
  const prev = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const next = (prev === '' || prev.endsWith('\n') ? prev : prev + '\n') + serializeTaskLine(task) + '\n'
  atomicWrite(file, next)
  archiveCompleted(projectsRoot, task.project)
  return task
}

export function updateTask(
  projectsRoot: string,
  project: string,
  id: string,
  patch: Partial<Omit<Task, 'id' | 'project'>>,
): Task {
  const file = tasksFile(projectsRoot, project)
  const content = existsSync(file) ? readFileSync(file, 'utf8') : ''
  let updated: Task | null = null
  const next = content
    .split('\n')
    .map((line) => {
      const t = parseTaskLine(line, project)
      if (updated || !t || t.id !== id) return line
      const merged: Task = { ...t, ...patch, id: t.id, project }
      if (patch.status && patch.status !== t.status) {
        merged.completed = patch.status === 'done' ? new Date().toISOString() : null
      }
      updated = merged
      return serializeTaskLine(merged)
    })
    .join('\n')
  if (!updated) throw new Error(`任务不存在：${id}`)
  atomicWrite(file, next)
  archiveCompleted(projectsRoot, project)
  return updated
}

export function deleteTask(projectsRoot: string, project: string, id: string): void {
  const file = tasksFile(projectsRoot, project)
  if (!existsSync(file)) return
  const next = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !(parseTaskLine(line, project)?.id === id))
    .join('\n')
  atomicWrite(file, next)
}

/** 完成项归档：进行中 > 阈值且有完成项时，把 `[x]` 行移入 tasks-done.md */
export function archiveCompleted(projectsRoot: string, project: string): void {
  const file = tasksFile(projectsRoot, project)
  if (!existsSync(file)) return
  const lines = readFileSync(file, 'utf8').split('\n')
  const doneLines = lines.filter((l) => parseTaskLine(l, project)?.status === 'done')
  const activeCount = lines.filter((l) => {
    const t = parseTaskLine(l, project)
    return t && t.status !== 'done'
  }).length
  if (activeCount <= ARCHIVE_THRESHOLD || doneLines.length === 0) return
  const archiveFile = join(dirname(file), 'tasks-done.md')
  const prev = existsSync(archiveFile) ? readFileSync(archiveFile, 'utf8') : ''
  const header = `## ${fmtDate(new Date())}\n\n`
  const merged = (prev === '' || prev.endsWith('\n') ? prev : prev + '\n') + header + doneLines.join('\n') + '\n'
  atomicWrite(archiveFile, merged)
  const kept = lines.filter((l) => parseTaskLine(l, project)?.status !== 'done')
  atomicWrite(file, kept.join('\n'))
}
