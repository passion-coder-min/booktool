import { useEffect, useMemo, useRef } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import mermaid from 'mermaid'
import { api } from '../api'
import remarkCallout, { calloutTitle } from './remarkCallout'
import rehypeImages from './rehypeImages'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'

function buildProcessor(baseDir: string) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkCallout)
    .use(remarkRehype, {
      // 指令容器 / GitHub callout -> div.admonition（与 PDF 管线同源）
      handlers: {
        containerDirective(state: any, node: any) {
          return {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['admonition', `admonition-${node.name}`],
            },
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
    .use(rehypeImages, { baseDir, toUrl: (abs: string) => api.fileUrl(abs) } as never)
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeStringify)
}

let mermaidSeq = 0
let mermaidReady = false

async function renderMermaidBlocks(container: HTMLElement) {
  const blocks = container.querySelectorAll<HTMLElement>('pre > code.language-mermaid')
  if (blocks.length === 0) return
  if (!mermaidReady) {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' })
    mermaidReady = true
  }
  for (const block of Array.from(blocks)) {
    const code = block.textContent ?? ''
    const id = `mmd-${++mermaidSeq}`
    try {
      const { svg } = await mermaid.render(id, code)
      const figure = document.createElement('figure')
      figure.innerHTML = svg
      block.parentElement?.replaceWith(figure)
    } catch (err) {
      const pre = block.parentElement
      if (pre) {
        pre.setAttribute('style', 'border-color:#d94a4a;color:#d94a4a')
        pre.textContent = `Mermaid 渲染失败：${String(err).slice(0, 200)}`
      }
    }
  }
}

interface Props {
  markdown: string
  /** 图片相对路径的基准绝对目录 */
  baseDir: string
}

export default function MarkdownPreview({ markdown, baseDir }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const processor = useMemo(() => buildProcessor(baseDir), [baseDir])
  const html = useMemo(() => {
    try {
      return String(processor.processSync(markdown))
    } catch (err) {
      return `<p style="color:#d94a4a">预览渲染失败：${String(err)}</p>`
    }
  }, [markdown, processor])

  // 图片路径已在管线内改写（rehypeImages）；此处仅处理 mermaid 块渲染，
  // 它直接替换 DOM 元素，无需 key 翻转强制重挂载
  useEffect(() => {
    const el = ref.current
    if (!el) return
    void renderMermaidBlocks(el)
  }, [html])

  return (
    <div ref={ref} className="preview markdown-body">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
