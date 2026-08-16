/** GitHub callout 默认标题（按类型回退显示；与 mdtypst / Vditor 的文案一致） */
const CALLOUT_TITLES: Record<string, string> = { note: '备注', tip: '提示', warning: '注意', danger: '警告' }

export function calloutTitle(name: string): string {
  return CALLOUT_TITLES[name] ?? name
}

/**
 * 把 GitHub callout 引用块（`> [!TYPE] [标题]`）转成 containerDirective 节点，
 * 供 HTML 预览复用提醒框（admonition）渲染，与 mdtypst 编译 / Vditor IR 三端同源。
 *
 * 注意：递归 / 顶层遍历的 `parent` 必须传「节点本身」（含 children 字段），
 * 传子数组（只有 length 无 children）会导致 transform 立即 return，插件静默失效。
 */
export default function remarkCallout() {
  return (tree: any) => {
    const transform = (parent: any, index: number) => {
      const node = parent.children?.[index]
      if (!node || typeof node !== 'object') return
      let target = node
      if (node.type === 'blockquote') {
        const first = node.children?.[0]
        if (first?.type === 'paragraph' && first.children?.[0]?.type === 'text') {
          const t0 = String(first.children[0].value)
          // 标题须与 [!TYPE] 同处一行（仅空格/制表符分隔），换行则视为正文开始
          const m = t0.match(/^\[\s*!([A-Za-z]+)\s*\](?:[ \t]+([^\n]*))?/)
          if (m) {
            const title = (m[2] ?? '').trim()
            const rest = t0.replace(/^\[\s*![A-Za-z]+\s*\](?:[ \t]+[^\n]*)?/, '').replace(/^\s+/, '')
            const bodyChildren: any[] = []
            if (rest) {
              bodyChildren.push({ ...first, children: [{ ...first.children[0], value: rest }, ...first.children.slice(1)] })
            } else {
              bodyChildren.push(...(first.children ?? []).slice(1))
            }
            bodyChildren.push(...(node.children ?? []).slice(1))
            target = {
              type: 'containerDirective',
              name: m[1].toLowerCase(),
              attributes: title ? { title } : {},
              children: bodyChildren,
            }
            parent.children[index] = target
          }
        }
      }
      const kids = target.children ?? []
      for (let i = 0; i < kids.length; i++) {
        if (kids[i] && typeof kids[i] === 'object') transform(target, i)
      }
    }
    const roots = tree.children ?? []
    for (let i = 0; i < roots.length; i++) transform(tree, i)
  }
}
