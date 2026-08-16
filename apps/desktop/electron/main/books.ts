import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { parse, stringify } from 'smol-toml'
import { parseSummary, flattenChapters } from '@booktool/shared'
import type { LoadedBook, BookConfig, SummaryItem } from '@booktool/shared'
import { readSummary, serializeSummary, renameChapter, removeChapter, moveChapter, retitlePath } from './summaryOps'

/** 加载书籍：book.toml + 当前版本的 SUMMARY.md */
export function loadBook(bookDir: string): LoadedBook {
  const raw = parse(readFileSync(join(bookDir, 'book.toml'), 'utf8')) as Record<string, any>
  const bookTable: Record<string, any> = raw.book ?? {}
  const versionsTable: Record<string, any> = raw.versions ?? {}

  const versions = ((versionsTable.list ?? []) as Record<string, any>[]).map((v) => ({
    key: String(v.key),
    name: String(v.name),
    path: String(v.path),
  }))
  const activeVersion = versionsTable.active != null ? String(versionsTable.active) : null
  const active = versions.find((v) => v.key === activeVersion)

  const config: BookConfig = {
    title: String(bookTable.title ?? '未命名书籍'),
    authors: (bookTable.authors ?? []) as string[],
    versions,
    activeVersion,
    srcDir: active ? normalize(active.path) : 'src',
  }

  const summaryPath = join(bookDir, config.srcDir, 'SUMMARY.md')
  const summary: SummaryItem[] = existsSync(summaryPath)
    ? parseSummary(readFileSync(summaryPath, 'utf8'))
    : []

  return { dir: bookDir, config, summary, chapters: flattenChapters(summary) }
}

/** 读取章节 markdown（path 相对 srcDir；禁止越界） */
export function readChapter(bookDir: string, srcDir: string, chapterPath: string): string {
  return readFileSync(safeJoin(join(bookDir, srcDir), chapterPath), 'utf8')
}

export function writeChapter(bookDir: string, srcDir: string, chapterPath: string, content: string): void {
  const abs = safeJoin(join(bookDir, srcDir), chapterPath)
  mkdirSync(dirname(abs), { recursive: true })
  atomicWrite(abs, content)
}

/** 书籍内任意资源的绝对路径（预览图片用） */
export function resolveAsset(bookDir: string, srcDir: string, relPath: string): string {
  return safeJoin(join(bookDir, srcDir), relPath)
}

export function atomicWrite(file: string, content: string): void {
  const tmp = file + '.tmp-' + Date.now()
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}

// ---------------- 书籍 CRUD ----------------

export function createBook(booksRoot: string, name: string, title: string, authors: string[]): string {
  const dir = safeJoin(booksRoot, name)
  if (existsSync(dir)) throw new Error(`书籍目录已存在：${name}`)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'book.toml'),
    `[book]\ntitle = ${JSON.stringify(title)}\nauthors = [${authors.map((a) => JSON.stringify(a)).join(', ')}]\n`,
  )
  writeFileSync(join(dir, 'src', 'SUMMARY.md'), `# Summary\n\n- [前言](preface.md)\n`)
  writeFileSync(join(dir, 'src', 'preface.md'), `# 前言\n\n开始写作…\n`)
  return dir
}

export function renameBook(booksRoot: string, oldName: string, newName: string): string {
  const oldDir = safeJoin(booksRoot, oldName)
  const newDir = safeJoin(booksRoot, newName)
  if (!existsSync(oldDir)) throw new Error(`书籍不存在：${oldName}`)
  if (existsSync(newDir)) throw new Error(`目标目录已存在：${newName}`)
  renameSync(oldDir, newDir)
  return newDir
}

export function deleteBook(booksRoot: string, name: string): void {
  const dir = safeJoin(booksRoot, name)
  if (!existsSync(dir)) throw new Error(`书籍不存在：${name}`)
  rmSync(dir, { recursive: true, force: true })
}

/** 写 book.toml（版本管理用）：保留 title/authors，更新 versions */
export function writeBookToml(
  bookDir: string,
  title: string,
  authors: string[],
  versions: { key: string; name: string; path: string }[],
  activeVersion: string | null,
): void {
  let body = `[book]\ntitle = ${JSON.stringify(title)}\nauthors = [${authors.map((a) => JSON.stringify(a)).join(', ')}]\n`
  if (versions.length) {
    body += `\n[versions]\nactive = ${JSON.stringify(activeVersion ?? '')}\n`
    for (const v of versions) {
      body += `\n[[versions.list]]\nkey = ${JSON.stringify(v.key)}\nname = ${JSON.stringify(v.name)}\npath = ${JSON.stringify(v.path)}\n`
    }
  }
  atomicWrite(join(bookDir, 'book.toml'), body)
}

// ---------------- 章节 CRUD（同步 SUMMARY.md） ----------------

export function chapterCreate(bookDir: string, srcDir: string, fileName: string, title: string): void {
  const clean = fileName.endsWith('.md') ? fileName : `${fileName}.md`
  const abs = safeJoin(join(bookDir, srcDir), clean)
  if (existsSync(abs)) throw new Error(`章节文件已存在：${clean}`)
  writeFileSync(abs, `# ${title}\n\n`)
  const items = readSummary(bookDir, srcDir)
  items.push({ type: 'chapter', title, path: clean, children: [] })
  atomicWrite(join(bookDir, srcDir, 'SUMMARY.md'), serializeSummary(items))
}

export function chapterRename(bookDir: string, srcDir: string, chapterPath: string, newTitle: string, newFileName?: string): string {
  let finalPath = chapterPath
  if (newFileName) {
    const clean = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`
    const oldAbs = safeJoin(join(bookDir, srcDir), chapterPath)
    const newAbs = safeJoin(join(bookDir, srcDir), clean)
    if (chapterPath !== clean && existsSync(newAbs)) throw new Error(`目标文件已存在：${clean}`)
    if (chapterPath !== clean) renameSync(oldAbs, newAbs)
    finalPath = clean
  }
  const items = chapterPath !== finalPath
    ? retitlePath(readSummary(bookDir, srcDir), chapterPath, finalPath)
    : readSummary(bookDir, srcDir)
  renameChapter(items, finalPath, newTitle)
  atomicWrite(join(bookDir, srcDir, 'SUMMARY.md'), serializeSummary(items))
  return finalPath
}

export function chapterDelete(bookDir: string, srcDir: string, chapterPath: string, deleteFile: boolean): void {
  const items = removeChapter(readSummary(bookDir, srcDir), chapterPath)
  atomicWrite(join(bookDir, srcDir, 'SUMMARY.md'), serializeSummary(items))
  if (deleteFile) {
    rmSync(safeJoin(join(bookDir, srcDir), chapterPath), { force: true })
  }
}

export function chapterMove(bookDir: string, srcDir: string, chapterPath: string, dir: -1 | 1): boolean {
  const { items, moved } = moveChapter(readSummary(bookDir, srcDir), chapterPath, dir)
  if (moved) atomicWrite(join(bookDir, srcDir, 'SUMMARY.md'), serializeSummary(items))
  return moved
}

function safeJoin(base: string, rel: string): string {
  const abs = normalize(join(base, rel))
  if (!abs.startsWith(normalize(base))) throw new Error(`非法路径：${rel}`)
  return abs
}
