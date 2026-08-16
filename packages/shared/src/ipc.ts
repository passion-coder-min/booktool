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
  bookWriteToml: 'book:write-toml',
  chapterCreate: 'chapter:create',
  chapterRename: 'chapter:rename',
  chapterDelete: 'chapter:delete',
  chapterMove: 'chapter:move',
  bookCompile: 'book:compile',
  bookReadAsset: 'book:read-asset',
  bookOpenPdf: 'book:open-pdf',
  imageImport: 'image:import',

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
  taskList: 'task:list',
  taskCreate: 'task:create',
  taskUpdate: 'task:update',
  taskDelete: 'task:delete',

  // 推送（主 → 渲染）
  compileDiagnostics: 'compile:diagnostics',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
