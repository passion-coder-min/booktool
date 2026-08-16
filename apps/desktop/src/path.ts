/** 渲染进程路径工具（避免直接依赖 node:path 的 web 环境） */
export function join(...parts: string[]): string {
  const joined = parts
    .filter((p) => p !== '' && p !== undefined && p !== null)
    .join('/')
    .replace(/\/+/g, '/')
  return joined
}

/** 取目录部分（兼容 / 与 \ 分隔符） */
export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(0, i) : ''
}

/**
 * 词法解析相对基准目录的路径（不访问文件系统）：
 * 归一化 `.` / `..` / 重复分隔符，返回以 `/` 连接的绝对路径。
 * 越界的 `..` 保留在结果中（与 node:path.posix.normalize 行为一致）。
 */
export function resolveFrom(baseDir: string, rel: string): string {
  const isAbs = /^\//.test(rel) || /^[a-zA-Z]:[\\/]/.test(rel)
  const start = isAbs ? '' : baseDir.replace(/[\/\\]+$/, '')
  const segs: string[] = []
  for (const part of (isAbs ? rel : `${start}/${rel}`).split(/[\/\\]+/)) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (segs.length > 0 && segs[segs.length - 1] !== '..') segs.pop()
      else if (!isAbs) segs.push('..')
      continue
    }
    segs.push(part)
  }
  const joined = segs.join('/')
  // 相对路径输入 + 以 / 开头的 baseDir（或 / 开头的 rel）-> 保持根斜杠；盘符路径不带
  const rooted = isAbs ? rel.startsWith('/') : baseDir.startsWith('/')
  return rooted ? `/${joined}` : joined
}
