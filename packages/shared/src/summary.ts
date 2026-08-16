import type { SummaryItem } from './types'

/**
 * 解析 mdBook 风格的 SUMMARY.md：
 *   # Part 标题           → part（其后的顶层章节归入该 part）
 *   [标题](path.md)       → chapter（顶层裸链接）
 *   - [标题](path.md)     → chapter（缩进表达层级）
 *   - ---                 → separator（终止当前 part）
 */
export function parseSummary(content: string): SummaryItem[] {
  const root: SummaryItem[] = []
  const rootFrame = { indent: -1, items: root }
  const stack: { indent: number; items: SummaryItem[] }[] = [rootFrame]
  let currentPart: SummaryItem | null = null
  let sawContent = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ')
    if (!line.trim()) continue
    // 仅跳过首个文档标题（如 `# Summary`），后续 # 为 Part
    if (!sawContent && /^#\s+/.test(line)) continue
    sawContent = true

    const indent = line.match(/^\s*/)![0].length

    // Part 标题（#~######）：回到根层级，后续顶层章节归入
    const part = line.match(/^#{1,6}\s+(.+)$/)
    if (part) {
      stack.length = 1
      currentPart = { type: 'part', title: part[1].trim(), children: [] }
      root.push(currentPart)
      continue
    }

    // 分隔线（裸 --- 或 - ---）：终止当前 part
    const sep = line.match(/^\s*(?:[-*+]\s+)?(---+|\*\*\*+|___+)\s*$/)
    if (sep) {
      stack.length = 1
      currentPart = null
      root.push({ type: 'separator', title: '', children: [] })
      continue
    }

    // 顶层裸链接：[标题](path.md)
    const bare = indent === 0 ? line.match(/^\[(.*)\]\(\s*(.+?)\s*\)$/) : null
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (!bare && !bullet) continue

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    if (bare) {
      pushItem(
        { type: 'chapter', title: bare[1].trim(), path: decodePath(bare[2]), children: [] },
        indent,
      )
      continue
    }
    const rest = bullet![1].trim()
    const link = rest.match(/^\[(.*)\]\(\s*(.+?)\s*\)$/)
    if (link) {
      pushItem(
        { type: 'chapter', title: link[1].trim(), path: decodePath(link[2]), children: [] },
        indent,
      )
    } else {
      // 无链接的列表项：分组标题（自身作为层级容器）
      pushItem({ type: 'part', title: rest, children: [] }, indent)
    }
  }

  function pushItem(item: SummaryItem, indent: number) {
    const top = stack[stack.length - 1]
    const items = top === rootFrame && currentPart ? currentPart.children : top.items
    items.push(item)
    stack.push({ indent, items: item.children })
  }

  return root
}

function decodePath(p: string): string {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}

/** 展平出章节列表（保持阅读顺序） */
export function flattenChapters(items: SummaryItem[]): { path: string; title: string }[] {
  const out: { path: string; title: string }[] = []
  for (const it of items) {
    if (it.type === 'chapter' && it.path) out.push({ path: it.path, title: it.title })
    if (it.children.length) out.push(...flattenChapters(it.children))
  }
  return out
}
