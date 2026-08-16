import { describe, expect, it } from 'vitest'
import { tableTemplate, admonitionTemplate, nextFootnoteId, headingPrefix, stripHeading } from '../src/edit/formatCommands'

describe('formatCommands 纯函数', () => {
  it('tableTemplate 生成表头/分隔行/数据行', () => {
    expect(tableTemplate(3, 2)).toBe(['| 列1 | 列2 |', '| --- | --- |', ' 1 | 2 ', ' 2 | 4 '].join('\n'))
  })

  it('admonitionTemplate 用 GitHub callout 语法（Vditor/预览/PDF 三端同源）', () => {
    expect(admonitionTemplate('warning')).toBe('> [!WARNING]\n> 内容')
    expect(admonitionTemplate('note', '快速开始')).toBe('> [!NOTE] 快速开始\n> 内容')
    expect(admonitionTemplate('danger')).toBe('> [!CAUTION]\n> 内容')
  })

  it('nextFootnoteId 递增不冲突', () => {
    expect(nextFootnoteId('无脚注')).toBe(1)
    expect(nextFootnoteId('a[^1] b[^3]')).toBe(4)
    expect(nextFootnoteId('[^2]\n\n[^2]: x')).toBe(3)
  })

  it('headingPrefix 同级返回 null（取消），异级返回新前缀', () => {
    expect(headingPrefix('## 老标题', 2)).toBeNull()
    expect(headingPrefix('## 老标题', 3)).toBe('### ')
    expect(headingPrefix('普通段落', 1)).toBe('# ')
  })

  it('stripHeading 去除标题前缀', () => {
    expect(stripHeading('### 标题')).toBe('标题')
    expect(stripHeading('普通')).toBe('普通')
  })
})
