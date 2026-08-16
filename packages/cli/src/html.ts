import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'

/** GitHub callout 默认标题（与桌面预览一致） */
const CALLOUT_TITLES: Record<string, string> = { note: '备注', tip: '提示', warning: '注意', danger: '警告' }

export function calloutTitle(name: string): string {
  return CALLOUT_TITLES[name] ?? name
}

/** 把 GitHub callout（> [!TYPE]）转成 admonition div，与桌面 HTML 预览同源 */
function remarkCallout() {
  return (tree: any) => {
    const transform = (parent: any, index: number) => {
      const node = parent.children?.[index]
      if (!node || typeof node !== 'object') return
      let target = node
      if (node.type === 'blockquote') {
        const first = node.children?.[0]
        if (first?.type === 'paragraph' && first.children?.[0]?.type === 'text') {
          const t0 = String(first.children[0].value)
          const m = t0.match(/^\[\s*!([A-Za-z]+)\s*\](?:[ \t]+([^\n]*))?/)
          if (m) {
            const title = (m[2] ?? '').trim()
            const rest = t0.replace(/^\[\s*![A-Za-z]+\s*\](?:[ \t]+[^\n]*)?/, '').replace(/^\s+/, '')
            const bodyChildren: any[] = []
            if (rest) {
              bodyChildren.push({ ...first, children: [{ ...first.children[0], value: rest }, ...(first.children ?? []).slice(1)] })
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
          }
        }
      }
      for (const child of target.children ?? []) transform(target, childIndex(target, child))
      parent.children[index] = target
    }
    const childIndex = (parent: any, child: any) => {
      const i = parent.children.indexOf(child)
      return i >= 0 ? i : 0
    }
    for (let i = 0; i < tree.children.length; i++) transform(tree, i)
  }
}

function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkCallout as any)
    .use(remarkRehype, {
      handlers: {
        containerDirective(state: any, node: any) {
          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['admonition', `admonition-${node.name}`] },
            children: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['admonition-title'] },
                children: [{ type: 'text', value: node.attributes?.title || calloutTitle(node.name) }],
              },
              ...state.all(node),
            ],
          }
        },
      } as never,
    })
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeStringify)
}

const processor = buildProcessor()

/** markdown → HTML 正文（KaTeX / highlight / callout 已处理；mermaid 由前端 JS 渲染） */
export function renderMarkdown(md: string): string {
  return String(processor.processSync(md))
}
