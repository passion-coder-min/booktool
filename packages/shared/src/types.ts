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
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

/** 任务（新模型：tasks.md 的 markdown checkbox 行；旧模型 tasks/*.md frontmatter 迁移而来） */
export interface Task {
  id: string
  title: string
  project: string
  status: TaskStatus
  priority: TaskPriority
  /** 是否重要（四象限 Y 轴；行内 `(重要)` 标记） */
  importance: boolean
  /** 截止日 YYYY-MM-DD */
  due: string | null
  /** 计划日（日历落格依据）YYYY-MM-DD */
  scheduled: string | null
  tags: string[]
  /** 关联的 wiki 页面（相对项目根）——新 checkbox 模型不使用，保留兼容旧数据 */
  links: string[]
  /** 依赖的任务 id——新 checkbox 模型不使用，阻塞改为任务自身状态 */
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

/** 应用级配置（持久化 userData/config.json，渲染层可读写；如 Typst 下载镜像） */
export interface AppConfig {
  /** Typst 下载第三方镜像根 URL 列表（官方 GitHub 始终优先）；空则用默认 USTC */
  typstMirrors?: string[]
}

export interface Project extends ProjectMeta {
  dir: string
  wikiFiles: string[]
  /** 工作日报文件（reports/ 下，每周一个，按周一日期+ISO 周号命名） */
  reportFiles: string[]
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

/** 跨书籍全文搜索命中（书籍管理页搜索 → 点击跳到对应书章节行） */
export interface BookSearchAllMatch extends SearchMatch {
  bookDir: string
  bookName: string
}


export interface WorkspaceInfo {
  root: string
  /** 工作区内 books/ 下的书籍名 */
  books: string[]
  /** 外部打开的书籍（mdBook 兼容目录，原位置引用） */
  externalBooks: { name: string; dir: string }[]
  /** 已从管理列表移除（仅隐藏，目录保留在 books/ 下）的内置书籍名 */
  hiddenBooks: string[]
  projects: Project[]
}
