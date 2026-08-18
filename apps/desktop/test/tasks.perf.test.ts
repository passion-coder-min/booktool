import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProjectTasks, countProjectTasks } from '../electron/main/tasks'
import { slicePaged } from '../src/work/usePaged'

/** 生成 n 行 checkbox 任务（约 1/7 完成、1/5 进行中，其余待办；带全量后缀元数据） */
function makeProjectWith(n: number) {
  const root = mkdtempSync(join(tmpdir(), 'bt-perf-'))
  const dir = join(root, 'demo')
  mkdirSync(dir, { recursive: true })
  const lines: string[] = ['# 任务清单', '']
  let done = 0
  for (let i = 0; i < n; i++) {
    const mark = i % 7 === 0 ? 'x' : i % 5 === 0 ? '/' : ' '
    if (mark === 'x') done++
    lines.push(`- [${mark}] 性能测试任务${i} (紧急) @2026-08-20 ~2026-08-19 #bench`)
  }
  writeFileSync(join(dir, 'tasks.md'), lines.join('\n') + '\n')
  return { root, dir, n, done }
}

describe('任务大数据量性能（回归：10w/20w 不崩溃）', () => {
  it('10 万行：解析计数正确、耗时可接受、完成项自动归档', () => {
    const { root, n, done } = makeProjectWith(100_000)
    const t0 = Date.now()
    const tasks = listProjectTasks(root, 'demo')
    const ms = Date.now() - t0
    expect(tasks.length).toBe(n - done)
    expect(tasks[0]!.title).toBe('性能测试任务1')
    expect(tasks[0]!.priority).toBe('urgent')
    // 进行中 >阈值(40) 且有完成项 → 自动归档
    expect(existsSync(join(root, 'demo', 'tasks-done.md'))).toBe(true)
    expect(readFileSync(join(root, 'demo', 'tasks-done.md'), 'utf8')).toContain('- [x] 性能测试任务0')
    expect(ms).toBeLessThan(10_000)
  })

  it('20 万行：解析计数正确、耗时可接受', () => {
    const { root, n, done } = makeProjectWith(200_000)
    const t0 = Date.now()
    const tasks = listProjectTasks(root, 'demo')
    const ms = Date.now() - t0
    expect(tasks.length).toBe(n - done)
    expect(ms).toBeLessThan(20_000)
  })

  it('countProjectTasks 大文件同样可用', () => {
    const { root, n, done } = makeProjectWith(100_000)
    expect(countProjectTasks(root, 'demo')).toBe(n - done)
  })
})

describe('分页纯函数 slicePaged（懒加载渲染上限）', () => {
  it('不足一页：全量返回、无剩余', () => {
    const items = [1, 2, 3]
    expect(slicePaged(items, 50)).toEqual({ visible: items, remaining: 0 })
  })

  it('超出分页：截断到页大小并正确计剩余', () => {
    const items = Array.from({ length: 100_000 }, (_, i) => i)
    const p = slicePaged(items, 50)
    expect(p.visible.length).toBe(50)
    expect(p.visible[0]).toBe(0)
    expect(p.visible[49]).toBe(49)
    expect(p.remaining).toBe(100_000 - 50)
    // 连续 loadMore 两次后 = 150 项
    const p2 = slicePaged(items, 150)
    expect(p2.visible.length).toBe(150)
    expect(p2.remaining).toBe(100_000 - 150)
  })

  it('空列表安全', () => {
    expect(slicePaged([], 50)).toEqual({ visible: [], remaining: 0 })
  })
})
