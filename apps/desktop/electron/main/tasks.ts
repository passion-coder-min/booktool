import { existsSync, readFileSync, readdirSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { taskFrontmatterSchema, type Task, type TaskStatus, type TaskPriority } from '@booktool/shared'
import { atomicWrite } from './books'

/** tasks/*.md：frontmatter 元数据 + 正文备注 */

export function listTasks(projectsRoot: string): Task[] {
  const tasks: Task[] = []
  if (!existsSync(projectsRoot)) return tasks
  for (const proj of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue
    const dir = join(projectsRoot, proj.name, 'tasks')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue
      try {
        tasks.push(readTaskFile(join(dir, f), proj.name))
      } catch (e) {
        // 单文件损坏不阻塞整体列表
        tasks.push({
          id: f.replace(/\.md$/, ''),
          title: `⚠ 解析失败：${f}`,
          project: proj.name,
          status: 'todo',
          priority: 'normal',
          due: null,
          scheduled: null,
          tags: [],
          links: [],
          created: new Date().toISOString(),
          completed: null,
          body: String(e),
        })
      }
    }
  }
  return tasks.sort((a, b) => (a.scheduled ?? '9999').localeCompare(b.scheduled ?? '9999'))
}

export function readTaskFile(file: string, project: string): Task {
  const raw = readFileSync(file, 'utf8')
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) throw new Error(`任务文件缺少 frontmatter：${file}`)
  const fm = taskFrontmatterSchema.parse({ project, ...parseYaml(m[1]) })
  return { ...fm, body: m[2].trim() }
}

export function taskFilePath(projectsRoot: string, project: string, id: string): string {
  const dir = join(projectsRoot, project, 'tasks')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${id}.md`)
}

export function writeTask(projectsRoot: string, task: Task): void {
  const fm = {
    id: task.id,
    title: task.title,
    project: task.project,
    status: task.status,
    priority: task.priority,
    due: task.due,
    scheduled: task.scheduled,
    tags: task.tags,
    links: task.links,
    created: task.created,
    completed: task.completed,
  }
  const content = `---\n${stringifyYaml(fm)}---\n\n${task.body}\n`
  atomicWrite(taskFilePath(projectsRoot, task.project, task.id), content)
}

export function deleteTask(projectsRoot: string, project: string, id: string): void {
  unlinkSync(taskFilePath(projectsRoot, project, id))
}

export function newTaskId(): string {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6)
  return `t-${date}-${rand}`
}

export interface TaskInput {
  title: string
  project: string
  status?: TaskStatus
  priority?: TaskPriority
  due?: string | null
  scheduled?: string | null
  tags?: string[]
  links?: string[]
  body?: string
}

export function createTask(projectsRoot: string, input: TaskInput): Task {
  const now = new Date().toISOString()
  const task: Task = {
    id: newTaskId(),
    title: input.title,
    project: input.project,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'normal',
    due: input.due ?? null,
    scheduled: input.scheduled ?? null,
    tags: input.tags ?? [],
    links: input.links ?? [],
    created: now,
    completed: input.status === 'done' ? now : null,
    body: input.body ?? '',
  }
  writeTask(projectsRoot, task)
  return task
}

export function updateTask(
  projectsRoot: string,
  project: string,
  id: string,
  patch: Partial<Omit<Task, 'id' | 'project'>>,
): Task {
  const dir = join(projectsRoot, project, 'tasks')
  const file = join(dir, `${id}.md`)
  const existing = readTaskFile(file, project)
  const next: Task = { ...existing, ...patch, id, project }
  // 状态变化同步 completed 时间
  if (patch.status && patch.status !== existing.status) {
    next.completed = patch.status === 'done' ? new Date().toISOString() : null
  }
  writeTask(projectsRoot, next)
  return next
}
