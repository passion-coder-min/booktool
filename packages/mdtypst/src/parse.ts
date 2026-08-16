import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkDirective from 'remark-directive'
import remarkFrontmatter from 'remark-frontmatter'
import type { Root } from 'mdast'

/**
 * 出版管线统一的 Markdown 解析配置：
 * GFM（表格/删除线/任务列表/脚注/自动链接）+ 数学 + 指令容器 + frontmatter。
 * 桌面端与测试共用，保证预览与编译同源。
 */
export function createParser() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ['yaml'])
}

export function parseMarkdown(md: string): Root {
  return createParser().parse(md) as Root
}
