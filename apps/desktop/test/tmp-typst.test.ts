import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
vi.mock('electron', () => ({
  app: {
    getPath: () => join(tmpdir(), 'booktool-typst-fresh', 'userData'),
    getAppPath: () => join(__dirname, '..'),
  },
}))
describe('typst 解析', () => {
  it('无 userData 二进制时优先使用随包捆绑版本', async () => {
    const { ensureTypst, typstBundledPath } = await import('../electron/main/typst')
    const bundled = typstBundledPath()
    expect(existsSync(bundled)).toBe(true)
    const p = await ensureTypst()
    console.log('ensureTypst 解析到:', p)
    expect(p).toBe(bundled)
  })
})
