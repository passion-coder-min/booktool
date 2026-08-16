/** 渲染进程路径工具（避免直接依赖 node:path 的 web 环境） */
export function join(...parts: string[]): string {
  const joined = parts
    .filter((p) => p !== '' && p !== undefined && p !== null)
    .join('/')
    .replace(/\/+/g, '/')
  return joined
}
