/**
 * 工作日报：每项目 reports/ 下每周一个 markdown 文件，按周一日期 + ISO 周号命名
 * （如 2026-08-17-W34.md）；一周过去后打开日报视图时自动创建下一周文件。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fmtDate, isoWeekOf, weekFileName, weekdayLabel } from '@booktool/shared'
import { atomicWrite } from './books'

const reportBase = (projectsRoot: string, projectId: string) => join(projectsRoot, projectId, 'reports')

function safe(base: string, file: string): string {
  const abs = join(base, file)
  if (!abs.startsWith(base)) throw new Error('非法路径')
  return abs
}

/** 当前周文件；不存在则创建（标题 + 今日小节）。返回 { file, created } */
export function ensureWeek(projectsRoot: string, projectId: string, now = new Date()): { file: string; created: boolean } {
  const base = reportBase(projectsRoot, projectId)
  mkdirSync(base, { recursive: true })
  const { week, monday, sunday } = isoWeekOf(now)
  const file = `${weekFileName(now)}.md`
  const abs = join(base, file)
  if (!existsSync(abs)) {
    const today = fmtDate(now)
    const heading = `## ${today} ${weekdayLabel(now)}`
    writeFileSync(abs, `# 第 ${week} 周工作日报（${monday} ~ ${sunday}）\n\n${heading}\n\n`)
    return { file, created: true }
  }
  return { file, created: false }
}

/** 当前周文件补今日小节（若缺）。已存在则原样返回当前内容。 */
export function addToday(projectsRoot: string, projectId: string, now = new Date()): { file: string; content: string } {
  const base = reportBase(projectsRoot, projectId)
  const { file, created } = ensureWeek(projectsRoot, projectId, now)
  const abs = safe(base, file)
  const content = readFileSync(abs, 'utf8')
  const heading = `## ${fmtDate(now)} ${weekdayLabel(now)}`
  if (created || !content.includes(heading)) {
    const next = (content.endsWith('\n') ? content : content + '\n') + `\n${heading}\n\n`
    writeFileSync(abs, next)
    return { file, content: next }
  }
  return { file, content }
}

export function readReport(projectsRoot: string, projectId: string, file: string): { dir: string; content: string } {
  const base = reportBase(projectsRoot, projectId)
  const abs = safe(base, file)
  return { dir: base, content: readFileSync(abs, 'utf8') }
}

export function writeReport(projectsRoot: string, projectId: string, file: string, content: string): boolean {
  const base = reportBase(projectsRoot, projectId)
  const abs = safe(base, file)
  mkdirSync(dirname(abs), { recursive: true })
  atomicWrite(abs, content)
  return true
}
