/**
 * 渲染进程可见的 window.api 类型（与 electron/preload 的实现保持同步）。
 * 单独成文件避免渲染层直接 import 主进程代码。
 */
export interface Api {
  workspace: {
    get: () => Promise<import('@booktool/shared').WorkspaceInfo>
    chooseRoot: () => Promise<import('@booktool/shared').WorkspaceInfo | null>
    initDemo: () => Promise<import('@booktool/shared').WorkspaceInfo>
  }
  book: {
    load: (dir: string) => Promise<import('@booktool/shared').LoadedBook>
    readChapter: (dir: string, path: string) => Promise<string>
    writeChapter: (dir: string, path: string, content: string) => Promise<boolean>
    appendSummary: (dir: string, title: string, path: string) => Promise<boolean>
    create: (name: string, title: string, authors: string[]) => Promise<import('@booktool/shared').WorkspaceInfo>
    rename: (oldName: string, newName: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    remove: (name: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    writeToml: (
      dir: string,
      title: string,
      authors: string[],
      versions: { key: string; name: string; path: string }[],
      active: string | null,
    ) => Promise<boolean>
    chapterCreate: (dir: string, fileName: string, title: string) => Promise<import('@booktool/shared').LoadedBook>
    chapterRename: (
      dir: string,
      path: string,
      title: string,
      fileName?: string,
    ) => Promise<{ finalPath: string; book: import('@booktool/shared').LoadedBook }>
    chapterDelete: (dir: string, path: string, deleteFile: boolean) => Promise<import('@booktool/shared').LoadedBook>
    chapterMove: (dir: string, path: string, dirn: number) => Promise<import('@booktool/shared').LoadedBook>
    readAsset: (dir: string, rel: string) => Promise<string>
    compile: (dir: string, opts?: { outputName?: string }) => Promise<import('@booktool/shared').CompileReport>
    openPdf: (dir: string, pdfPath?: string) => Promise<string | null>
    search: (dir: string, query: string) => Promise<import('@booktool/shared').SearchMatch[]>
    openDirectory: () => Promise<import('@booktool/shared').WorkspaceInfo | null>
    removeExternal: (dir: string) => Promise<import('@booktool/shared').WorkspaceInfo>
  }
  file: {
    open: () => Promise<{ absPath: string; name: string; content: string } | null>
    save: (absPath: string, content: string) => Promise<boolean>
    compile: (absPath: string) => Promise<import('@booktool/shared').CompileReport | null>
  }
  filePath: (file: File) => string
  image: {
    import: (bookDir: string, srcAbs: string, chapterPath: string) => Promise<string>
    paste: (bookDir: string, bytes: ArrayBuffer, mime: string, chapterPath: string) => Promise<string>
    pick: () => Promise<string | null>
  }
  work: {
    createProject: (name: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    renameProject: (oldId: string, newId: string, newName: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    deleteProject: (id: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    wikiCreate: (project: string, fileName: string, title: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    wikiRename: (project: string, oldFile: string, newFile: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    wikiDelete: (project: string, file: string) => Promise<import('@booktool/shared').WorkspaceInfo>
    wikiRead: (project: string, file: string) => Promise<{ dir: string; content: string }>
    wikiWrite: (project: string, file: string, content: string) => Promise<boolean>
    taskList: () => Promise<import('@booktool/shared').Task[]>
    taskCreate: (input: unknown) => Promise<import('@booktool/shared').Task>
    taskUpdate: (
      project: string,
      id: string,
      patch: unknown,
    ) => Promise<import('@booktool/shared').Task>
    taskDelete: (project: string, id: string) => Promise<boolean>
  }
  onCompileStatus: (cb: (payload: unknown) => void) => () => void
  onMenuCmd: (cb: (cmd: string) => void) => () => void
  config: {
    get: () => Promise<import('@booktool/shared').AppConfig>
    set: (patch: Partial<import('@booktool/shared').AppConfig>) => Promise<import('@booktool/shared').AppConfig>
  }
  fileUrl: (absPath: string) => string
}
