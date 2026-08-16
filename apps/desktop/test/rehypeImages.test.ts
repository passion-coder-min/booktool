import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeImages from '../src/components/rehypeImages'

const BASE = '/book/src'
const toUrl = (abs: string) => `booktool-file://local${abs.split('/').map(encodeURIComponent).join('/')}`

function render(md: string): string {
  const p = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeImages, { baseDir: BASE, toUrl } as never)
    .use(rehypeStringify)
  return String(p.processSync(md))
}

describe('rehypeImages（HTML 预览图片改写）', () => {
  it('相对路径基于 baseDir 改写为协议 URL', () => {
    expect(render('![x](img/a.png)')).toContain('src="booktool-file://local/book/src/img/a.png"')
  })

  it('../ 上级路径正确归一化（image 目录布局）', () => {
    expect(render('![x](../image/ch1/b.png)')).toContain('src="booktool-file://local/book/image/ch1/b.png"')
  })

  it('路径中的特殊字符按段编码', () => {
    // 含空格的 dest 需 <> 包裹（CommonMark）；remark 解析后按段编码
    expect(render('![x](<img/我的 图.png>)')).toContain('src="booktool-file://local/book/src/img/%E6%88%91%E7%9A%84%20%E5%9B%BE.png"')
  })

  it('远程/内联/本应用协议不改写', () => {
    const html = render('![a](https://e.com/x.png) ![b](data:image/png;base64,xx) ![c](booktool-file://local/x.png)')
    expect(html).toContain('src="https://e.com/x.png"')
    expect(html).toContain('src="data:image/png;base64,xx"')
    expect(html).toContain('src="booktool-file://local/x.png"')
  })
})
