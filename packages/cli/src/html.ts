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

/** 行内纯文本（用于标题 slug / [TOC] 识别） */
function inlineText(node: any): string {
  if (node.value !== undefined) return String(node.value)
  return (node.children ?? []).map(inlineText).join('')
}

/** 把独立的 `[TOC]` 段落转为 tocMarker 节点（不显示字面文本，渲染时替换为章节目录） */
function remarkTocMarker() {
  return (tree: any) => {
    const transform = (parent: any, index: number) => {
      const node = parent.children?.[index]
      if (!node || typeof node !== 'object') return
      if (node.type === 'paragraph' && /^\[toc\]$/i.test(inlineText(node).trim())) {
        parent.children[index] = { type: 'tocMarker' }
        return
      }
      for (const child of node.children ?? []) transform(node, node.children.indexOf(child))
    }
    for (let i = 0; i < tree.children.length; i++) transform(tree, i)
  }
}

export interface TocHeading {
  id: string
  text: string
  level: number
}

/** GitHub 风格标题 slug（中文保留；重复追加 -2/-3…） */
function slugify(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return base || 'sec'
}

/** 给标题加锚点 id（供章节目录引导；标题列表由 extractHeadings 从 HTML 提取） */
function rehypeHeadingIds() {
  const seen = new Map<string, number>()
  return (tree: any) => {
    const walk = (node: any) => {
      if (node?.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
        const base = slugify(inlineText(node))
        const n = seen.get(base) ?? 0
        seen.set(base, n + 1)
        const id = n === 0 ? base : `${base}-${n + 1}`
        node.properties = { ...(node.properties ?? {}), id }
      }
      for (const c of node?.children ?? []) walk(c)
    }
    walk(tree)
  }
}

function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkCallout as any)
    .use(remarkTocMarker as any)
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
        // [TOC] 标记 → 占位导航，构建阶段注入章节目录
        tocMarker() {
          return {
            type: 'element',
            tagName: 'nav',
            properties: { className: ['toc'], 'data-toc': '' },
            children: [],
          }
        },
      } as never,
    })
    .use(rehypeHeadingIds as any)
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeStringify)
}

export interface RenderedMarkdown {
  html: string
  headings: TocHeading[]
}

/** markdown → HTML 正文（KaTeX / highlight / callout 已处理；[TOC] 替换为占位；mermaid 由前端 JS 渲染） */
export function renderMarkdown(md: string): RenderedMarkdown {
  const html = String(buildProcessor().processSync(md))
  return { html, headings: extractHeadings(html) }
}

/** 从渲染后的 HTML 提取标题（id/文本/级别），用于章节目录 */
function extractHeadings(html: string): TocHeading[] {
  const out: TocHeading[] = []
  const re = /<h([1-6])\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const text = m[3].replace(/<[^>]*>/g, '').trim()
    out.push({ id: m[2], text, level: Number(m[1]) })
  }
  return out
}
