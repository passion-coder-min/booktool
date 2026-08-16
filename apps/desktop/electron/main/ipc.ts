import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { join, dirname, extname, basename, relative } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, copyFileSync } from 'node:fs'
import { IPC, type CompileReport, type LoadedBook, type SearchMatch, type Task, type WorkspaceInfo } from '@booktool/shared'
import { getWorkspaceRoot, chooseWorkspaceRoot, scanWorkspace, chooseExternalBook, removeExternalBook } from './workspace'
import {
  loadBook, readChapter, writeChapter, resolveAsset, atomicWrite,
  createBook, renameBook, deleteBook, writeBookToml,
  chapterCreate, chapterRename, chapterDelete, chapterMove,
} from './books'
import { compileBook, pdfPathOf, compileSingleFile } from './compiler'
import { listTasks, createTask, updateTask, deleteTask, type TaskInput } from './tasks'

export function registerIpc() {
  const send = (channel: string, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
  }

  ipcMain.handle(IPC.workspaceGet, (): WorkspaceInfo => scanWorkspace())
  ipcMain.handle(IPC.workspaceChooseRoot, () => chooseWorkspaceRoot().then(() => scanWorkspace()))
  ipcMain.handle(IPC.workspaceInitDemo, () => {
    const root = getWorkspaceRoot()
    initDemoWorkspace(root)
    return scanWorkspace()
  })

  ipcMain.handle(IPC.bookLoad, (_e, bookDir: string): LoadedBook => loadBook(bookDir))
  ipcMain.handle(IPC.bookReadChapter, (_e, bookDir: string, chapterPath: string) =>
    readChapter(bookDir, loadBook(bookDir).config.srcDir, chapterPath),
  )
  ipcMain.handle(IPC.bookWriteChapter, (_e, bookDir: string, chapterPath: string, content: string) => {
    writeChapter(bookDir, loadBook(bookDir).config.srcDir, chapterPath, content)
    return true
  })
  ipcMain.handle(IPC.bookAppendSummary, (_e, bookDir: string, title: string, chapterPath: string) => {
    const srcDir = loadBook(bookDir).config.srcDir
    const summaryPath = join(bookDir, srcDir, 'SUMMARY.md')
    const prev = existsSync(summaryPath) ? readFileSync(summaryPath, 'utf8') : '# Summary\n'
    const line = `- [${title}](${chapterPath.split('/').pop()})`
    if (prev.includes(line)) return false
    writeFileSync(summaryPath, prev.trimEnd() + '\n' + line + '\n')
    return true
  })

  // 书籍管理
  ipcMain.handle(IPC.bookCreate, (_e, name: string, title: string, authors: string[]) => {
    createBook(join(getWorkspaceRoot(), 'books'), name, title, authors)
    return scanWorkspace()
  })
  ipcMain.handle(IPC.bookRename, (_e, oldName: string, newName: string) => {
    renameBook(join(getWorkspaceRoot(), 'books'), oldName, newName)
    return scanWorkspace()
  })
  ipcMain.handle(IPC.bookDelete, (_e, name: string) => {
    deleteBook(join(getWorkspaceRoot(), 'books'), name)
    return scanWorkspace()
  })
  ipcMain.handle(IPC.bookWriteToml, (_e, bookDir: string, title: string, authors: string[], versions, active: string | null) => {
    writeBookToml(bookDir, title, authors, versions, active)
    return true
  })

  // 章节（文档）管理
  ipcMain.handle(IPC.chapterCreate, (_e, bookDir: string, fileName: string, title: string) => {
    chapterCreate(bookDir, loadBook(bookDir).config.srcDir, fileName, title)
    return loadBook(bookDir)
  })
  ipcMain.handle(IPC.chapterRename, (_e, bookDir: string, chapterPath: string, newTitle: string, newFileName?: string) => {
    const finalPath = chapterRename(bookDir, loadBook(bookDir).config.srcDir, chapterPath, newTitle, newFileName)
    return { finalPath, book: loadBook(bookDir) }
  })
  ipcMain.handle(IPC.chapterDelete, (_e, bookDir: string, chapterPath: string, deleteFile: boolean) => {
    chapterDelete(bookDir, loadBook(bookDir).config.srcDir, chapterPath, deleteFile)
    return loadBook(bookDir)
  })
  ipcMain.handle(IPC.chapterMove, (_e, bookDir: string, chapterPath: string, dir: -1 | 1) => {
    chapterMove(bookDir, loadBook(bookDir).config.srcDir, chapterPath, dir)
    return loadBook(bookDir)
  })
  ipcMain.handle(IPC.bookReadAsset, (_e, bookDir: string, relPath: string) =>
    resolveAsset(bookDir, loadBook(bookDir).config.srcDir, relPath),
  )
  ipcMain.handle(IPC.bookCompile, async (_e, bookDir: string, opts?: { outputName?: string }): Promise<CompileReport> => {
    try {
      const report = await compileBook(bookDir, (msg) => send(IPC.compileDiagnostics, { status: msg }), opts)
      send(IPC.compileDiagnostics, { report })
      return report
    } catch (err) {
      const report: CompileReport = {
        ok: false,
        pdfPath: null,
        diagnostics: [
          {
            severity: 'error',
            message: String(err),
            file: '',
            line: 0,
            typFile: '',
            typLine: 0,
          },
        ],
        durationMs: 0,
        mermaidRendered: 0,
        mermaidCached: 0,
      }
      send(IPC.compileDiagnostics, { report })
      return report
    }
  })
  ipcMain.handle(IPC.bookOpenPdf, (_e, bookDir: string, pdfPath?: string) => {
    // 优先使用本次编译的实际产物路径（可能是 output/book.pdf 或实时编译的 build/preview.pdf）；
    // 未提供时回退到默认产物（兼容旧调用方）。
    const p = pdfPath && existsSync(pdfPath) ? pdfPath : pdfPathOf(bookDir)
    if (p) void shell.openPath(p)
    return p
  })

  // 在系统文件管理器中打开目录（当前书籍根 / 单个文件所在目录）
  ipcMain.handle(IPC.bookOpenFolder, (_e, dir: string) => {
    if (dir) void shell.openPath(dir)
    return true
  })

  // 打开外部目录（mdBook 兼容书籍），原位置引用
  ipcMain.handle(IPC.bookOpenDirectory, () => chooseExternalBook())
  ipcMain.handle(IPC.bookRemoveExternal, (_e, dir: string) => {
    removeExternalBook(dir)
    return scanWorkspace()
  })

  // 打开单个 markdown 文件（独立编辑）
  ipcMain.handle(IPC.fileOpen, async (): Promise<{ absPath: string; name: string; content: string } | null> => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (res.canceled || !res.filePaths[0]) return null
    const absPath = res.filePaths[0]
    return { absPath, name: basename(absPath), content: readFileSync(absPath, 'utf8') }
  })
  ipcMain.handle(IPC.fileSave, (_e, absPath: string, content: string) => {
    atomicWrite(absPath, content)
    return true
  })
  // 单个 markdown 文件导出 PDF：先选保存位置，再编译
  ipcMain.handle(
    IPC.fileCompile,
    async (_e, fileAbs: string): Promise<CompileReport | null> => {
      const def = join(dirname(fileAbs), `${basename(fileAbs, extname(fileAbs))}.pdf`)
      const res = await dialog.showSaveDialog({ defaultPath: def, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (res.canceled || !res.filePath) return null
      try {
        const report = await compileSingleFile(fileAbs, res.filePath, (msg) => send(IPC.compileDiagnostics, { status: msg }))
        send(IPC.compileDiagnostics, { report })
        return report
      } catch (err) {
        const report: CompileReport = {
          ok: false,
          pdfPath: null,
          diagnostics: [{ severity: 'error', message: String(err), file: '', line: 0, typFile: '', typLine: 0 }],
          durationMs: 0,
          mermaidRendered: 0,
          mermaidCached: 0,
        }
        send(IPC.compileDiagnostics, { report })
        return report
      }
    },
  )

  /** 全文搜索：在当前书籍全部章节中查找（大小写不敏感子串），返回 {file,line,text} */
  ipcMain.handle(IPC.bookSearch, (_e, bookDir: string, query: string): SearchMatch[] => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return []
    const book = loadBook(bookDir)
    const out: SearchMatch[] = []
    for (const ch of book.chapters) {
      const md = readChapter(bookDir, book.config.srcDir, ch.path)
      md.split(/\r?\n/).forEach((text, idx) => {
        if (text.toLowerCase().includes(q)) {
          out.push({ file: ch.path, line: idx + 1, text })
        }
      })
    }
    return out
  })

  /**
   * 保存书籍图片：统一放到 书籍根/image/<文档名>/image_<时间戳>.<ext>，
   * 返回相对章节所在目录的 markdown 引用（拖拽/本地选择/粘贴共用）。
   */
  function saveBookImage(
    bookDir: string,
    chapterPath: string,
    data: { srcAbs?: string; bytes?: Uint8Array; ext?: string },
  ): string {
    const srcDir = loadBook(bookDir).config.srcDir
    const base = join(bookDir, srcDir)
    const docName = basename(chapterPath, extname(chapterPath)) || 'chapter'
    const imageDir = join(bookDir, 'image', docName)
    mkdirSync(imageDir, { recursive: true })
    const ext = (data.ext ?? (data.srcAbs ? extname(data.srcAbs) : '.png')).toLowerCase() || '.png'
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
    let name = `image_${stamp}${ext}`
    let dest = join(imageDir, name)
    for (let k = 0; existsSync(dest); k++) {
      name = `image_${stamp}-${k}${ext}`
      dest = join(imageDir, name)
    }
    if (data.srcAbs) copyFileSync(data.srcAbs, dest)
    else if (data.bytes) writeFileSync(dest, data.bytes)
    // 相对章节所在目录的引用（src/ 下嵌套章节用 ../ 回溯）
    const chapterDirAbs = join(base, dirname(chapterPath))
    return relative(chapterDirAbs, dest).split('\\').join('/')
  }

  /** 图片导入（拖拽 / 本地选择共用）：保存到 image/<文档名>/ 并返回相对引用 */
  ipcMain.handle(IPC.imageImport, (_e, bookDir: string, srcAbs: string, chapterPath: string) => {
    return saveBookImage(bookDir, chapterPath, { srcAbs })
  })

  /** 图片粘贴（Ctrl+V 截图/图片）：保存到 image/<文档名>/ 并返回相对引用 */
  ipcMain.handle(IPC.imagePaste, (_e, bookDir: string, bytes: Uint8Array, mime: string, chapterPath: string) => {
    const extByMime: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'image/svg+xml': '.svg',
    }
    const ext = extByMime[(mime || '').toLowerCase()] ?? '.png'
    return saveBookImage(bookDir, chapterPath, { bytes, ext })
  })

  /** 图片导入（文件选择对话框版）：返回选中文件的绝对路径 */
  ipcMain.handle('image:pick', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
    })
    if (res.canceled || !res.filePaths[0]) return null
    void basename
    return res.filePaths[0]
  })

  ipcMain.handle(IPC.projectCreate, (_e, name: string) => {
    const root = getWorkspaceRoot()
    const dir = join(root, 'projects', name)
    mkdirSync(join(dir, 'wiki'), { recursive: true })
    mkdirSync(join(dir, 'tasks'), { recursive: true })
    writeFileSync(join(dir, 'project.json'), JSON.stringify({ id: name, name, color: '#4a90d9', description: '' }, null, 2))
    writeFileSync(join(dir, 'wiki', 'home.md'), `# ${name}\n\n项目 wiki 首页。\n`)
    return scanWorkspace()
  })
  ipcMain.handle(IPC.projectRename, (_e, oldId: string, newId: string, newName: string) => {
    const root = getWorkspaceRoot()
    const oldDir = join(root, 'projects', oldId)
    const newDir = join(root, 'projects', newId)
    if (!existsSync(oldDir)) throw new Error(`项目不存在：${oldId}`)
    if (existsSync(newDir)) throw new Error(`目标目录已存在：${newId}`)
    // 目录 + project.json + 任务 frontmatter 的 project 字段全部更新
    renameSync(oldDir, newDir)
    writeFileSync(join(newDir, 'project.json'), JSON.stringify({ id: newId, name: newName, color: '#4a90d9', description: '' }, null, 2))
    for (const t of listTasks(join(root, 'projects'))) {
      if (t.project === oldId) updateTask(join(root, 'projects'), oldId, t.id, { project: newId } as never)
    }
    return scanWorkspace()
  })
  ipcMain.handle(IPC.projectDelete, (_e, id: string) => {
    const dir = join(getWorkspaceRoot(), 'projects', id)
    if (!existsSync(dir)) throw new Error(`项目不存在：${id}`)
    rmSync(dir, { recursive: true, force: true })
    return scanWorkspace()
  })

  // Wiki 文件管理
  ipcMain.handle(IPC.wikiCreate, (_e, project: string, fileName: string, title: string) => {
    const root = getWorkspaceRoot()
    const clean = fileName.endsWith('.md') ? fileName : `${fileName}.md`
    const abs = join(root, 'projects', project, 'wiki', clean)
    if (!abs.startsWith(join(root, 'projects'))) throw new Error('非法路径')
    if (existsSync(abs)) throw new Error(`文件已存在：${clean}`)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, `# ${title}\n\n`)
    return scanWorkspace()
  })
  ipcMain.handle(IPC.wikiRename, (_e, project: string, oldFile: string, newFile: string) => {
    const root = getWorkspaceRoot()
    const base = join(root, 'projects', project, 'wiki')
    const clean = newFile.endsWith('.md') ? newFile : `${newFile}.md`
    const oldAbs = join(base, oldFile)
    const newAbs = join(base, clean)
    if (!oldAbs.startsWith(base) || !newAbs.startsWith(base)) throw new Error('非法路径')
    if (existsSync(newAbs)) throw new Error(`文件已存在：${clean}`)
    renameSync(oldAbs, newAbs)
    return scanWorkspace()
  })
  ipcMain.handle(IPC.wikiDelete, (_e, project: string, file: string) => {
    const root = getWorkspaceRoot()
    const base = join(root, 'projects', project, 'wiki')
    const abs = join(base, file)
    if (!abs.startsWith(base)) throw new Error('非法路径')
    rmSync(abs, { force: true })
    return scanWorkspace()
  })
  ipcMain.handle(IPC.projectWikiRead, (_e, project: string, file: string) => {
    const root = getWorkspaceRoot()
    const abs = join(root, 'projects', project, 'wiki', file)
    if (!abs.startsWith(join(root, 'projects'))) throw new Error('非法路径')
    return { dir: dirname(abs), content: readFileSync(abs, 'utf8') }
  })
  ipcMain.handle(IPC.projectWikiWrite, (_e, project: string, file: string, content: string) => {
    const root = getWorkspaceRoot()
    const abs = join(root, 'projects', project, 'wiki', file)
    if (!abs.startsWith(join(root, 'projects'))) throw new Error('非法路径')
    mkdirSync(dirname(abs), { recursive: true })
    atomicWrite(abs, content)
    return true
  })
  ipcMain.handle(IPC.taskList, (): Task[] => {
    const root = getWorkspaceRoot()
    return listTasks(join(root, 'projects'))
  })
  ipcMain.handle(IPC.taskCreate, (_e, input: TaskInput) => {
    const root = getWorkspaceRoot()
    return createTask(join(root, 'projects'), input)
  })
  ipcMain.handle(IPC.taskUpdate, (_e, project: string, id: string, patch) => {
    const root = getWorkspaceRoot()
    return updateTask(join(root, 'projects'), project, id, patch)
  })
  ipcMain.handle(IPC.taskDelete, (_e, project: string, id: string) => {
    const root = getWorkspaceRoot()
    deleteTask(join(root, 'projects'), project, id)
    return true
  })
}

/** 首次启动创建示例工作区（书籍 + 项目 + 跨周任务样例） */
function initDemoWorkspace(root: string) {
  const bookDir = join(root, 'books', 'demo-book')
  if (!existsSync(join(bookDir, 'book.toml'))) {
    mkdirSync(join(bookDir, 'src'), { recursive: true })
    writeFileSync(join(bookDir, 'book.toml'), demoBookToml())
    writeFileSync(join(bookDir, 'src', 'SUMMARY.md'), demoSummary())
    writeFileSync(join(bookDir, 'src', 'chapter-1.md'), demoChapter1())
    writeFileSync(join(bookDir, 'src', 'chapter-2.md'), demoChapter2())
    writeFileSync(join(bookDir, 'src', 'chapter-3.md'), demoChapter3())
  }

  const projDir = join(root, 'projects', 'demo-project')
  if (!existsSync(join(projDir, 'project.json'))) {
    mkdirSync(join(projDir, 'wiki'), { recursive: true })
    mkdirSync(join(projDir, 'tasks'), { recursive: true })
    writeFileSync(
      join(projDir, 'project.json'),
      JSON.stringify({ id: 'demo-project', name: '演示项目', color: '#2e9e5b', description: 'BookTool 工作模式示例' }, null, 2),
    )
    writeFileSync(join(projDir, 'wiki', 'home.md'), demoWikiHome())
    writeFileSync(join(projDir, 'wiki', 'design.md'), demoWikiDesign())
    writeDemoTasks(join(projDir, 'tasks'))
  }
}

function fmtDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function writeDemoTasks(tasksDir: string) {
  const demo: Array<[string, string, string | null, string | null, string, string[]]> = [
    // [标题, 状态, due, scheduled, 优先级, 标签]
    ['完成《第一章》初稿并交付审阅', 'done', fmtDate(-3), fmtDate(-4), 'high', ['writing']],
    ['整理第三章数学公式素材', 'done', fmtDate(-1), fmtDate(-2), 'normal', ['math']],
    ['修复 PDF 中文字体缺失问题', 'done', fmtDate(-1), fmtDate(-1), 'urgent', ['bug', 'pdf']],
    ['撰写第二章「工作模式」章节', 'doing', fmtDate(1), fmtDate(0), 'high', ['writing']],
    ['评审 Mermaid 图表缓存方案', 'doing', fmtDate(2), fmtDate(0), 'normal', ['review']],
    ['调研 typst.ts WASM 预览可行性', 'todo', fmtDate(3), fmtDate(1), 'low', ['research']],
    ['补充示例书籍的表格与脚注用例', 'todo', fmtDate(4), fmtDate(2), 'normal', ['writing']],
    ['逾期示例：整理旧版存档', 'todo', fmtDate(-2), fmtDate(-2), 'low', ['archive']],
    ['统计仪表盘视觉设计', 'todo', fmtDate(5), fmtDate(3), 'normal', ['design']],
    ['发布 v0.1 内测版', 'todo', fmtDate(7), fmtDate(5), 'urgent', ['release']],
  ]
  let i = 0
  for (const [title, status, due, scheduled, priority, tags] of demo) {
    const id = `t-demo-${String(++i).padStart(2, '0')}`
    const fm = {
      id,
      title,
      project: 'demo-project',
      status,
      priority,
      due,
      scheduled,
      tags,
      links: i <= 2 ? ['wiki/design.md'] : [],
      created: new Date(Date.now() - (10 - i) * 86400_000).toISOString(),
      completed: status === 'done' ? new Date(Date.now() - Math.max(0, 4 - i) * 86400_000).toISOString() : null,
    }
    const yaml = Object.entries(fm)
      .map(([k, v]) => `${k}: ${v === null ? 'null' : Array.isArray(v) ? JSON.stringify(v) : JSON.stringify(v)}`)
      .join('\n')
    writeFileSync(join(tasksDir, `${id}.md`), `---\n${yaml}\n---\n\n${title}\n`)
  }
}

const demoBookToml = () => `[book]
title = "BookTool 演示手册"
authors = ["BookTool"]

# 多版本示例：取消注释后可在 versions/ 下放置多版本源码
# [versions]
# active = "v1"
# [[versions.list]]
# key = "v1"
# name = "中文最新版"
# path = "versions/v1"
`

const demoSummary = () => `# Summary

[前言](chapter-1.md)

# 基础篇

- [排版能力一览](chapter-2.md)
- [图表与工作流](chapter-3.md)
`

const demoChapter1 = () => `# 欢迎

BookTool 是一个**本地优先**的知识出版与工作管理工具：左手 \`Markdown\` 书籍，右手任务与日历。

## 它解决什么问题

1. mdBook / GitBook 的 PDF 排版质量不足，尤其中文
2. 中英文混排时西文撑开行高
3. 技术书籍需要 Mermaid 图与数学公式

:::tip{title="30 秒上手"}
打开右侧章节 → 编辑 → 点击「编译 PDF」。首次编译会自动下载 Typst 编译器。
:::

> [!TIP] 30 秒上手
> 打开右侧章节 → 编辑 → 点击「编译 PDF」。首次编译会自动下载 Typst 编译器。

> 好的工具应该让你忘记工具本身，专注于内容。

 footnote 示例[^1]。

[^1]: 这是脚注内容。
`

const demoChapter2 = () => `# 排版能力

## 中英文混排

本段验证 CJK 与 Latin 的混排效果：使用 Noto Sans SC 与 Noto Sans 字体，西文自动缩小至 0.85em（例如 English text、数字 2026、标点 like this one）而不撑开行高。两端对齐让版面接近 LaTeX 的观感。

## 数学公式

质能方程 $E=mc^2$ 与欧拉公式 $e^{i\\pi} + 1 = 0$：

$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$

矩阵与分段函数：

$$A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}, \\quad f(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases}$$

## 表格

| 特性 | mdBook | BookTool |
|---|:-:|--:|
| PDF 质量 | 一般 | 优秀 |
| 中英混排优化 | ✗ | ✓ |
| Mermaid 图表 | 插件 | 内建 |

## 删除线与任务

~~旧方案已废弃~~。本周计划：

- [x] 完成编译器核心
- [ ] 多版本管理
`

const demoChapter3 = () => `# 图表与工作流

## 架构图（Mermaid）

\`\`\`mermaid
graph LR
    A[Markdown 源文件] --> B[remark 解析]
    B --> C{包含 Mermaid?}
    C -- 是 --> D[mmdc 渲染 SVG]
    C -- 否 --> E[mdtypst 编译]
    D --> E
    E --> F[Typst 生成 PDF]
\`\`\`

## 时序图

\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    participant E as Electron
    participant T as Typst CLI
    U->>E: 点击编译
    E->>T: typst compile
    T-->>E: book.pdf
    E-->>U: 预览 + 诊断
\`\`\`

## 甘特图

\`\`\`mermaid
gantt
    title 出版计划
    dateFormat YYYY-MM-DD
    section 写作
    初稿      :a1, 2026-08-01, 10d
    修订      :after a1, 7d
    section 出版
    排版      :2026-08-20, 5d
    发布      :2026-08-25, 3d
\`\`\`

## 代码高亮

\`\`\`ts
interface Book { title: string }
const compile = async (book: Book) => {
  console.log(\`编译 \${book.title} …\`)
  return true
}
\`\`\`
`

const demoWikiHome = () => `# 演示项目 Wiki

这是项目的知识库。左侧切换文件，右上角切换到「任务 / 日历 / 统计」视图。

## 项目目标

- 验证工作模式：任务、日历、统计
- 沉淀设计决策（见 [设计笔记](design.md)）

:::note
任务与日历中的卡片可以**拖拽**：看板拖动改状态，日历拖动改计划日期。
:::

> [!NOTE]
> 任务与日历中的卡片可以**拖拽**：看板拖动改状态，日历拖动改计划日期。
`

const demoWikiDesign = () => `# 设计笔记

## 为什么任务存为 Markdown 文件

- 本地优先：用户可读、可 grep、可 Git
- 拖拽改字段 = 重写单个文件的 frontmatter（原子写）
- 千级任务全量扫描 < 50ms，无需数据库

## 数据模型

\`\`\`yaml
id: t-20260815-a1b2
title: 完成第三章初稿
status: todo | doing | done
due: 2026-08-20
scheduled: 2026-08-16
\`\`\`
`
