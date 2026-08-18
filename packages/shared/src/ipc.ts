/**
 * IPC 通道契约：主进程与渲染进程共享的通道名与负载类型。
 * invoke<TReq, TRes> 风格，渲染进程经 preload 暴露的 window.api 调用。
 */
export const IPC = {
  // 工作区
  workspaceGet: 'workspace:get',
  workspaceInitDemo: 'workspace:init-demo',
  workspaceChooseRoot: 'workspace:choose-root',

  // 书籍
  bookLoad: 'book:load',
  bookReadChapter: 'book:read-chapter',
  bookWriteChapter: 'book:write-chapter',
  bookAppendSummary: 'book:append-summary',
  bookCreate: 'book:create',
  bookRename: 'book:rename',
  bookDelete: 'book:delete',
  /** 仅从管理列表移除内置书籍（隐藏，保留 books/ 目录不删文件） */
  bookHide: 'book:hide',
  /** 恢复被隐藏的内置书籍到管理列表 */
  bookUnhide: 'book:unhide',
  bookWriteToml: 'book:write-toml',
  chapterCreate: 'chapter:create',
  chapterRename: 'chapter:rename',
  chapterDelete: 'chapter:delete',
  chapterMove: 'chapter:move',
  chapterMoveTo: 'chapter:move-to',
  bookCompile: 'book:compile',
  bookReadAsset: 'book:read-asset',
  bookOpenPdf: 'book:open-pdf',
  bookSearch: 'book:search',
  /** 跨书籍全文搜索（工作区全部书籍） */
  bookSearchAll: 'book:search-all',
  /** 打开外部目录（mdBook 兼容书籍）并注册 */
  bookOpenDirectory: 'book:open-directory',
  /** 从工作区移除外部书籍（仅移除引用，不删目录） */
  bookRemoveExternal: 'book:remove-external',
  /** 打开单个 markdown 文件（独立编辑） */
  fileOpen: 'file:open',
  fileSave: 'file:save',
  /** 单个 markdown 文件导出 PDF */
  fileCompile: 'file:compile',
  imageImport: 'image:import',
  imagePaste: 'image:paste',

  // 应用配置（设置页：如 Typst 镜像）
  configGet: 'config:get',
  configSet: 'config:set',

  // 工作模式
  projectCreate: 'project:create',
  projectRename: 'project:rename',
  projectDelete: 'project:delete',
  wikiCreate: 'wiki:create',
  wikiRename: 'wiki:rename',
  wikiDelete: 'wiki:delete',
  projectWikiList: 'project:wiki-list',
  projectWikiRead: 'project:wiki-read',
  projectWikiWrite: 'project:wiki-write',
  reportEnsureWeek: 'report:ensure-week',
  reportRead: 'report:read',
  reportWrite: 'report:write',
  reportAddToday: 'report:add-today',
  taskList: 'task:list',
  taskCreate: 'task:create',
  taskUpdate: 'task:update',
  taskDelete: 'task:delete',
  /** 项目任务清单原文（tasks.md，markdown checkbox 编辑） */
  taskChecklistRead: 'task:checklist-read',
  taskChecklistWrite: 'task:checklist-write',

  // 推送（主 → 渲染）
  compileDiagnostics: 'compile:diagnostics',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
