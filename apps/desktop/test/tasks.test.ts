import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseTaskLine, serializeTaskLine, hashTitle, createTask, updateTask, deleteTask, archiveCompleted,
} from '../electron/main/tasks'

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'bt-tasks-'))
  const dir = join(root, 'demo')
  mkdirSync(dir, { recursive: true })
  return { root, dir }
}

describe('任务 checkbox 存储', () => {
  it('parseTaskLine 解析状态/重要/紧急/日期/标签', () => {
    const t = parseTaskLine('- [x] 完成登录 (不重要) (紧急) @2026-08-20 ~2026-08-18 #前端 #auth', 'demo')!
    expect(t.title).toBe('完成登录')
    expect(t.status).toBe('done')
    expect(t.importance).toBe(false)
    expect(t.priority).toBe('urgent')
    expect(t.due).toBe('2026-08-20')
    expect(t.scheduled).toBe('2026-08-18')
    expect(t.tags).toEqual(['前端', 'auth'])
    expect(t.id).toBe(hashTitle('完成登录'))
  })

  it('默认象限：重要 · 不紧急（无标记）', () => {
    const t = parseTaskLine('- [ ] 写周报', 'demo')!
    expect(t.importance).toBe(true)
    expect(t.priority).toBe('normal')
    // 旧格式 (重要) 仍兼容
    expect(parseTaskLine('- [ ] x (重要)', 'demo')!.importance).toBe(true)
  })

  it('中间态 blocked 解析', () => {
    const t = parseTaskLine('- [B] 等第三方回复', 'demo')!
    expect(t.status).toBe('blocked')
    expect(t.title).toBe('等第三方回复')
  })

  it('serialize ↔ parse 往返（重要为默认省略，不重要显式标记）', () => {
    const t = parseTaskLine('- [/] 联调接口 #后端', 'demo')!
    const line = serializeTaskLine(t)
    expect(line).toBe('- [/] 联调接口 #后端')
    const t2 = parseTaskLine(line, 'demo')!
    expect(t2.importance).toBe(true)
    expect(t2.tags).toEqual(['后端'])
    const unimportant = parseTaskLine(serializeTaskLine({ ...t, importance: false }), 'demo')!
    expect(unimportant.importance).toBe(false)
  })

  it('createTask 追加一行，updateTask 改行，deleteTask 删行', () => {
    const { root, dir } = makeProject()
    writeFileSync(join(dir, 'tasks.md'), '# 任务清单\n\n')
    const t = createTask(root, { title: '写周报', project: 'demo', scheduled: '2026-08-19' })
    expect(readFileSync(join(dir, 'tasks.md'), 'utf8')).toContain('- [ ] 写周报 ~2026-08-19')
    const updated = updateTask(root, 'demo', t.id, { status: 'doing', importance: false, priority: 'urgent' })
    expect(updated.status).toBe('doing')
    expect(readFileSync(join(dir, 'tasks.md'), 'utf8')).toContain('- [/] 写周报 (不重要) (紧急)')
    deleteTask(root, 'demo', t.id)
    expect(readFileSync(join(dir, 'tasks.md'), 'utf8')).not.toContain('写周报')
  })

  it('完成项超过阈值自动归档到 tasks-done.md', () => {
    const { root, dir } = makeProject()
    const lines: string[] = ['# 任务清单', '']
    for (let i = 0; i < 45; i++) lines.push(`- [ ] 任务${i}`)
    lines.push('- [x] 已完成任务')
    writeFileSync(join(dir, 'tasks.md'), lines.join('\n') + '\n')
    archiveCompleted(root, 'demo')
    expect(readFileSync(join(dir, 'tasks.md'), 'utf8')).not.toContain('已完成任务')
    expect(readFileSync(join(dir, 'tasks-done.md'), 'utf8')).toContain('- [x] 已完成任务')
    expect(readFileSync(join(dir, 'tasks.md'), 'utf8')).toContain('任务0')
  })

  it('低于阈值不归档', () => {
    const { root, dir } = makeProject()
    writeFileSync(join(dir, 'tasks.md'), '- [ ] a\n- [x] b\n')
    archiveCompleted(root, 'demo')
    expect(readFileSync(join(dir, 'tasks.md'), 'utf8')).toContain('- [x] b')
    expect(existsSync(join(dir, 'tasks-done.md'))).toBe(false)
  })
})
