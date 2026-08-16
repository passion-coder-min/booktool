/** 书籍版本配置（book.toml [versions]） */
export interface BookVersion {
  key: string
  name: string
  path: string
}

/** book.toml 结构 */
export interface BookConfig {
  title: string
  authors: string[]
  /** 多版本列表；无 versions 时书源直接在 srcDir */
  versions: BookVersion[]
  activeVersion: string | null
  /** 当前生效版本的源码目录（相对书籍根目录），由加载时解析 */
  srcDir: string
}

/** SUMMARY.md 解析结果 */
export interface SummaryItem {
  type: 'part' | 'chapter' | 'separator'
  title: string
  /** 相对于 srcDir 的 markdown 路径（chapter 才有） */
  path?: string
  children: SummaryItem[]
}

export interface LoadedBook {
  dir: string
  config: BookConfig
  summary: SummaryItem[]
  chapters: { path: string; title: string; missing: boolean }[]
}

/** 任务状态 */
export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

/** 任务（tasks/*.md 的 frontmatter） */
export interface Task {
  id: string
  title: string
  project: string
  status: TaskStatus
  priority: TaskPriority
  /** 截止日 YYYY-MM-DD */
  due: string | null
  /** 计划日（日历落格依据）YYYY-MM-DD */
  scheduled: string | null
  tags: string[]
  /** 关联的 wiki 页面（相对项目根） */
  links: string[]
  /** 依赖的任务 id（被依赖方未完成 → 本任务视为被阻塞） */
  dependencies: string[]
  created: string
  /** 完成时间 ISO */
  completed: string | null
  /** 正文备注 */
  body: string
}

export interface ProjectMeta {
  id: string
  name: string
  color: string
  description: string
}

export interface Project extends ProjectMeta {
  dir: string
  wikiFiles: string[]
  taskCount: number
}

/** 编译诊断（已映射回 markdown 源） */
export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  /** 源 markdown 文件（相对书籍根） */
  file: string
  line: number
  /** 生成的 .typ 文件与行号（调试用） */
  typFile: string
  typLine: number
  /** 详细上下文：typst 原始错误块 / 源码行片段 / 提示（底部诊断面板展开显示） */
  detail?: string
}

export interface CompileReport {
  ok: boolean
  pdfPath: string | null
  diagnostics: Diagnostic[]
  durationMs: number
  mermaidRendered: number
  mermaidCached: number
}

/** 全文搜索命中 */
export interface SearchMatch {
  /** 源 markdown 文件（相对书籍根） */
  file: string
  line: number
  /** 命中行文本 */
  text: string
}


export interface WorkspaceInfo {
  root: string
  /** 工作区内 books/ 下的书籍名 */
  books: string[]
  /** 外部打开的书籍（mdBook 兼容目录，原位置引用） */
  externalBooks: { name: string; dir: string }[]
  projects: Project[]
}
