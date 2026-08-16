/**
 * 标题锚点 slug：GitHub 风格（拉丁小写、空格转连字符、去标点），
 * 中文等非 ASCII 字母保留，保证 `[标题](#中文锚点)` 可解析。
 * 结果同时用作 Typst `<label>`，因此仅保留字母/数字/连字符/CJK。
 */
export function slugifyHeading(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug
}

/** 为标题生成唯一 label（重复时追加 -2/-3…） */
export function uniqueSlug(base: string, seen: Map<string, number>): string {
  const clean = base || 'sec'
  const n = seen.get(clean) ?? 0
  seen.set(clean, n + 1)
  return n === 0 ? clean : `${clean}-${n + 1}`
}
