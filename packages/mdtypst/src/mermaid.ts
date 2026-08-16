import { createHash } from 'node:crypto'
import type { Root } from 'mdast'
import { parseMarkdown } from './parse'
import { compileMdast } from './compile'
import type { CompileOutput } from './compile'

export interface MermaidDiagram {
  hash: string
  code: string
}

/**
 * 提取 mermaid 代码块并替换为图片引用（原地修改 AST）。
 * 图片 url 使用 `mermaid:{hash}` 协议，由编译选项 resolveImage 映射到
 * 构建目录中的 SVG（assets/mermaid-{hash}.svg）。
 * 内容 MD5 哈希做增量缓存：内容不变不重渲染。
 */
export function extractMermaid(root: Root): MermaidDiagram[] {
  const found = new Map<string, string>()
  const walk = (node: any) => {
    if (node.type === 'code' && (node.lang || '').trim() === 'mermaid') {
      const code: string = node.value
      const hash = createHash('md5').update(code).digest('hex').slice(0, 12)
      found.set(hash, code)
      // 用"仅含一张图的段落"替换，编译器据此走 figure 分支
      node.type = 'paragraph'
      node.children = [
        {
          type: 'image',
          url: `mermaid:${hash}`,
          alt: 'Mermaid 图',
          position: node.position,
        } as any,
      ]
      delete node.lang
      delete node.value
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return [...found.entries()].map(([hash, code]) => ({ hash, code }))
}

export interface CompileMarkdownOptions {
  resolveImage?: (url: string) => string
  /** 输出头部附加行（如 `#import "../template.typ": *`） */
  preamble?: string
}

/** 单文件便捷编译：md -> typst（含 mermaid 图清单，url 为 mermaid:{hash}） */
export function compileMarkdown(
  md: string,
  opts?: CompileMarkdownOptions,
): CompileOutput & { diagrams: MermaidDiagram[] } {
  const root = parseMarkdown(md)
  const diagrams = extractMermaid(root)
  const out = compileMdast(root, opts)
  return { ...out, diagrams }
}

export { compileMdast }
export type { CompileOutput, CompileOptions, LineMapping, CompileWarning } from './compile'
