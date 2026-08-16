import { describe, expect, it } from 'vitest'
import { resolveFrom, join, dirname } from '../src/path'

describe('resolveFrom（图片相对路径词法解析）', () => {
  it('相对路径拼接并归一化 ./ 与重复分隔符', () => {
    expect(resolveFrom('/book/src', './img//a.png')).toBe('/book/src/img/a.png')
    expect(resolveFrom('/book/src', 'img/b.png')).toBe('/book/src/img/b.png')
  })

  it('../ 回到上级（书籍 image 目录布局）', () => {
    expect(resolveFrom('/book/src', '../image/ch1/x.png')).toBe('/book/image/ch1/x.png')
    expect(resolveFrom('/book/src/part1', '../../image/ch2/y.png')).toBe('/book/image/ch2/y.png')
  })

  it('反斜杠分隔符按分隔符处理', () => {
    expect(resolveFrom('/book/src', '..\\image\\ch1\\x.png')).toBe('/book/image/ch1/x.png')
  })

  it('绝对路径忽略 baseDir', () => {
    expect(resolveFrom('/book/src', '/abs/path.png')).toBe('/abs/path.png')
  })

  it('越界 .. 保留（与 posix.normalize 一致）', () => {
    expect(resolveFrom('/book/src', '../../../../etc/passwd')).toBe('/../../etc/passwd')
  })

  it('baseDir 尾部斜杠被容忍', () => {
    expect(resolveFrom('/book/src/', 'a.png')).toBe('/book/src/a.png')
  })
})

describe('path 基础工具回归', () => {
  it('join 过滤空段并压缩重复斜杠', () => {
    expect(join('/a', '', '/b//c')).toBe('/a/b/c')
  })
  it('dirname 兼容两种分隔符', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('C:\\a\\b.md')).toBe('C:\\a')
    expect(dirname('x.md')).toBe('')
  })
})
