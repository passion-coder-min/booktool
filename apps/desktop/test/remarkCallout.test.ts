import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import remarkCallout, { calloutTitle } from '../src/components/remarkCallout'

/** 与 MarkdownPreview 相同的处理链（仅保留 callout/指令渲染，便于断言 HTML） */
function render(md: string): string {
  const p = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkCallout)
    .use(remarkRehype, {
      handlers: {
        containerDirective(state: any, node: any) {
          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['admonition', `admonition-${node.name}`] },
            children: [
              { type: 'element', tagName: 'div', properties: { className: ['admonition-title'] }, children: [{ type: 'text', value: node.attributes?.title || calloutTitle(node.name) }] },
              ...state.all(node),
            ],
          }
        },
      } as never,
    })
    .use(rehypeStringify)
  return String(p.processSync(md))
}

describe('remarkCallout（HTML 预览 callout 三端一致）', () => {
  it('无标题 callout 转成 admonition 并回退默认标题', () => {
    const html = render('> [!Note]\n> 内容')
    expect(html).toContain('class="admonition admonition-note"')
    expect(html).toContain('备注')
    expect(html).toContain('内容')
    expect(html).not.toContain('[!Note]')
  })

  it('带标题 callout 使用标题且正文不含 [!TYPE] 前缀', () => {
    const html = render('> [!WARNING] 注意备份\n> 正文')
    expect(html).toContain('class="admonition admonition-warning"')
    expect(html).toContain('注意备份')
    expect(html).toContain('正文')
    expect(html).not.toContain('[!WARNING]')
  })

  it('大小写不敏感（TIP / CAUTION）', () => {
    expect(render('> [!Tip]\n> x')).toContain('class="admonition admonition-tip"')
    expect(render('> [!Caution]\n> x')).toContain('class="admonition admonition-caution"')
  })

  it('多行正文全部进入 callout', () => {
    const html = render('> [!NOTE] 标题\n> 第一行\n> 第二行')
    expect(html).toContain('第一行')
    expect(html).toContain('第二行')
  })

  it('普通引用块保持不变', () => {
    expect(render('> 普通引用')).toContain('<blockquote>')
  })

  it('::: 指令容器仍正常渲染', () => {
    const html = render(':::tip{title="30 秒上手"}\n打开右侧章节\n:::')
    expect(html).toContain('class="admonition admonition-tip"')
    expect(html).toContain('30 秒上手')
  })

  it('calloutTitle 默认文案', () => {
    expect(calloutTitle('note')).toBe('备注')
    expect(calloutTitle('tip')).toBe('提示')
    expect(calloutTitle('warning')).toBe('注意')
    expect(calloutTitle('danger')).toBe('警告')
    expect(calloutTitle('unknown')).toBe('unknown')
  })
})
