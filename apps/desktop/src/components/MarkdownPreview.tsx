import { useEffect, useMemo, useRef, useState } from 'react'
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
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'

let processor: any = null

function getProcessor() {
  if (!processor) {
    processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkDirective)
      .use(remarkRehype, {
        // 指令容器 -> div.admonition（与 PDF 管线同源）
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
                  children: [{ type: 'text', value: node.attributes?.title || defaultTitle(node.name) }],
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
  return processor
}

function defaultTitle(name: string): string {
  const map: Record<string, string> = { note: '备注', tip: '提示', warning: '注意', danger: '警告' }
  return map[name] ?? name
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
  const [renderTick, setRenderTick] = useState(0)

  const html = useMemo(() => {
    try {
      return String(getProcessor().processSync(markdown))
    } catch (err) {
      return `<p style="color:#d94a4a">预览渲染失败：${String(err)}</p>`
    }
  }, [markdown])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 图片相对路径 -> booktool-file 协议
    for (const img of el.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? ''
      if (/^(https?:|data:|booktool-file:)/.test(src)) continue
      const abs = baseDir ? `${baseDir.replace(/\/+$/, '')}/${src.replace(/^\.?\//, '')}` : src
      img.src = api.fileUrl(abs)
    }
    void renderMermaidBlocks(el).then(() => setRenderTick((t) => t + 1))
  }, [html, baseDir])

  return (
    <div ref={ref} className="preview markdown-body" key={renderTick % 2}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
