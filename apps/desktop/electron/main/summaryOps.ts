import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSummary, flattenChapters } from '@booktool/shared'
import type { SummaryItem } from '@booktool/shared'

/**
 * SUMMARY.md 结构化编辑：标题重命名 / 移除章节 / 同级调序 / 序列化写回。
 * 保持 Part/分隔线结构；缩进按层级 2 空格重建。
 */

export function readSummary(bookDir: string, srcDir: string): SummaryItem[] {
  return parseSummary(readFileSync(join(bookDir, srcDir, 'SUMMARY.md'), 'utf8'))
}

export function serializeSummary(items: SummaryItem[]): string {
  const lines: string[] = ['# Summary', '']
  const walk = (list: SummaryItem[], depth: number) => {
    for (const it of list) {
      const indent = '  '.repeat(depth)
      if (it.type === 'separator') {
        lines.push(`${indent}- ---`)
      } else if (it.type === 'part') {
        if (depth === 0) lines.push(`# ${it.title}`, '')
        else lines.push(`${indent}- ${it.title}`)
      } else {
        lines.push(`${indent}- [${it.title}](${encode(it.path!)})`)
      }
      if (it.children.length) walk(it.children, depth + 1)
    }
  }
  walk(items, 0)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n'
}

function encode(p: string): string {
  return p.replace(/ /g, '%20')
}

/** 在树中定位章节项（返回其父数组与索引） */
function locate(items: SummaryItem[], path: string): { parent: SummaryItem[]; index: number; item: SummaryItem } | null {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.type === 'chapter' && it.path === path) return { parent: items, index: i, item: it }
    if (it.children.length) {
      const found = locate(it.children, path)
      if (found) return found
    }
  }
  return null
}

export function renameChapter(items: SummaryItem[], path: string, newTitle: string): SummaryItem[] {
  const hit = locate(items, path)
  if (hit) hit.item.title = newTitle
  return items
}

export function removeChapter(items: SummaryItem[], path: string): SummaryItem[] {
  const hit = locate(items, path)
  if (hit) hit.parent.splice(hit.index, 1)
  return items
}

/** 同级上移/下移（dir: -1 | 1），已在边界时返回 false */
export function moveChapter(items: SummaryItem[], path: string, dir: -1 | 1): { items: SummaryItem[]; moved: boolean } {
  const hit = locate(items, path)
  if (!hit) return { items, moved: false }
  const target = hit.index + dir
  if (target < 0 || target >= hit.parent.length) return { items, moved: false }
  const [it] = hit.parent.splice(hit.index, 1)
  hit.parent.splice(target, 0, it)
  return { items, moved: true }
}

/** 更新章节路径（文件重命名后同步） */
export function retitlePath(items: SummaryItem[], oldPath: string, newPath: string): SummaryItem[] {
  const hit = locate(items, oldPath)
  if (hit) hit.item.path = newPath
  return items
}

export { flattenChapters }
