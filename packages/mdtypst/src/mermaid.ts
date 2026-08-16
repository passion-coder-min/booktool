import { createHash } from 'node:crypto'
import type { Root } from 'mdast'
import { parseMarkdown } from './parse'
import { compileMdast, collectHeadingLabels } from './compile'
import type { CompileOutput } from './compile'

export interface MermaidDiagram {
  hash: string
  code: string
  /** 代码块在源 markdown 中的起始行（1 基），供诊断回映射 */
  line: number
}

/**
 * 提取 mermaid 代码块并替换为图片引用（原地修改 AST）。
 * 图片 url 使用 `mermaid:{hash}` 协议，由编译选项 resolveImage 映射到
 * 构建目录中的 SVG（assets/mermaid-{hash}.svg）。
 * 内容 MD5 哈希做增量缓存：内容不变不重渲染。
 * 空代码块无法渲染，替换为空段落并记入 skippedLines。
 */
export function extractMermaid(root: Root): MermaidDiagram[] {
  return extractMermaidInternal(root).diagrams
}

function extractMermaidInternal(root: Root): { diagrams: MermaidDiagram[]; skippedLines: number[] } {
  const found = new Map<string, MermaidDiagram>()
  const skippedLines: number[] = []
  const walk = (node: any) => {
    if (node.type === 'code' && (node.lang || '').trim() === 'mermaid') {
      const code: string = node.value
      const line = node.position?.start?.line ?? 0
      if (code.trim() === '') {
        // 空块无法交给 mmdc（必然失败）：替换为空段落，PDF 不渲染
        skippedLines.push(line)
        node.type = 'paragraph'
        node.children = []
        delete node.lang
        delete node.value
        return
      }
      const hash = createHash('md5').update(code).digest('hex').slice(0, 12)
      found.set(hash, { hash, code, line })
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
  return { diagrams: [...found.values()], skippedLines }
}

export interface CompileMarkdownOptions {
  resolveImage?: (url: string) => string
  /** 输出头部附加行（如 `#import "../template.typ": *`） */
  preamble?: string
  /** 全局标题 label 集合（整本书合并编译时跨章节锚点解析；缺省仅本 md 内） */
  knownLabels?: Set<string>
}

/** 单文件便捷编译：md -> typst（含 mermaid 图清单，url 为 mermaid:{hash}） */
export function compileMarkdown(
  md: string,
  opts?: CompileMarkdownOptions,
): CompileOutput & { diagrams: MermaidDiagram[] } {
  const root = parseMarkdown(md)
  const { diagrams, skippedLines } = extractMermaidInternal(root)
  const out = compileMdast(root, opts)
  for (const line of skippedLines) {
    out.warnings.push({ message: '空的 Mermaid 代码块，已跳过渲染', line })
  }
  return { ...out, diagrams }
}

export { compileMdast, collectHeadingLabels }
export type { CompileOutput, CompileOptions, LineMapping, CompileWarning } from './compile'
