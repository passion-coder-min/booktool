import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@booktool/shared'

const api = {
  /** 拖拽/文件选择场景：File 对象 -> 绝对路径（Electron 32+ 方式） */
  filePath: (file: File) => webUtils.getPathForFile(file),
  workspace: {
    get: () => ipcRenderer.invoke(IPC.workspaceGet),
    chooseRoot: () => ipcRenderer.invoke(IPC.workspaceChooseRoot),
    initDemo: () => ipcRenderer.invoke(IPC.workspaceInitDemo),
  },
  book: {
    load: (dir: string) => ipcRenderer.invoke(IPC.bookLoad, dir),
    readChapter: (dir: string, path: string) => ipcRenderer.invoke(IPC.bookReadChapter, dir, path),
    writeChapter: (dir: string, path: string, content: string) => ipcRenderer.invoke(IPC.bookWriteChapter, dir, path, content),
    appendSummary: (dir: string, title: string, path: string) => ipcRenderer.invoke(IPC.bookAppendSummary, dir, title, path),
    create: (name: string, title: string, authors: string[]) => ipcRenderer.invoke(IPC.bookCreate, name, title, authors),
    rename: (oldName: string, newName: string) => ipcRenderer.invoke(IPC.bookRename, oldName, newName),
    remove: (name: string) => ipcRenderer.invoke(IPC.bookDelete, name),
    hide: (name: string) => ipcRenderer.invoke(IPC.bookHide, name),
    unhide: (name: string) => ipcRenderer.invoke(IPC.bookUnhide, name),
    writeToml: (dir: string, title: string, authors: string[], versions: unknown, active: string | null) =>
      ipcRenderer.invoke(IPC.bookWriteToml, dir, title, authors, versions, active),
    chapterCreate: (dir: string, fileName: string, title: string) => ipcRenderer.invoke(IPC.chapterCreate, dir, fileName, title),
    chapterRename: (dir: string, path: string, title: string, fileName?: string) =>
      ipcRenderer.invoke(IPC.chapterRename, dir, path, title, fileName),
    chapterDelete: (dir: string, path: string, deleteFile: boolean) => ipcRenderer.invoke(IPC.chapterDelete, dir, path, deleteFile),
    chapterMove: (dir: string, path: string, dirn: number) => ipcRenderer.invoke(IPC.chapterMove, dir, path, dirn),
    readAsset: (dir: string, rel: string) => ipcRenderer.invoke(IPC.bookReadAsset, dir, rel),
    compile: (dir: string, opts?: { outputName?: string }) =>
      ipcRenderer.invoke(IPC.bookCompile, dir, opts),
    openPdf: (dir: string, pdfPath?: string) => ipcRenderer.invoke(IPC.bookOpenPdf, dir, pdfPath),
    search: (dir: string, query: string) => ipcRenderer.invoke(IPC.bookSearch, dir, query),
    searchAll: (query: string) => ipcRenderer.invoke(IPC.bookSearchAll, query),
    openDirectory: () => ipcRenderer.invoke(IPC.bookOpenDirectory),
    removeExternal: (dir: string) => ipcRenderer.invoke(IPC.bookRemoveExternal, dir),
  },
  file: {
    open: () => ipcRenderer.invoke(IPC.fileOpen),
    save: (absPath: string, content: string) => ipcRenderer.invoke(IPC.fileSave, absPath, content),
    compile: (absPath: string) => ipcRenderer.invoke(IPC.fileCompile, absPath),
  },
  image: {
    import: (bookDir: string, srcAbs: string, chapterPath: string) =>
      ipcRenderer.invoke(IPC.imageImport, bookDir, srcAbs, chapterPath),
    paste: (bookDir: string, bytes: ArrayBuffer, mime: string, chapterPath: string) =>
      ipcRenderer.invoke(IPC.imagePaste, bookDir, bytes, mime, chapterPath),
    pick: () => ipcRenderer.invoke('image:pick'),
  },
  work: {
    createProject: (name: string) => ipcRenderer.invoke(IPC.projectCreate, name),
    renameProject: (oldId: string, newId: string, newName: string) => ipcRenderer.invoke(IPC.projectRename, oldId, newId, newName),
    deleteProject: (id: string) => ipcRenderer.invoke(IPC.projectDelete, id),
    wikiCreate: (project: string, fileName: string, title: string) => ipcRenderer.invoke(IPC.wikiCreate, project, fileName, title),
    wikiRename: (project: string, oldFile: string, newFile: string) => ipcRenderer.invoke(IPC.wikiRename, project, oldFile, newFile),
    wikiDelete: (project: string, file: string) => ipcRenderer.invoke(IPC.wikiDelete, project, file),
    wikiRead: (project: string, file: string) => ipcRenderer.invoke(IPC.projectWikiRead, project, file),
    wikiWrite: (project: string, file: string, content: string) => ipcRenderer.invoke(IPC.projectWikiWrite, project, file, content),
    reportEnsureWeek: (project: string) => ipcRenderer.invoke(IPC.reportEnsureWeek, project),
    reportRead: (project: string, file: string) => ipcRenderer.invoke(IPC.reportRead, project, file),
    reportWrite: (project: string, file: string, content: string) => ipcRenderer.invoke(IPC.reportWrite, project, file, content),
    reportAddToday: (project: string) => ipcRenderer.invoke(IPC.reportAddToday, project),
    taskList: () => ipcRenderer.invoke(IPC.taskList),
    taskCreate: (input: unknown) => ipcRenderer.invoke(IPC.taskCreate, input),
    taskUpdate: (project: string, id: string, patch: unknown) => ipcRenderer.invoke(IPC.taskUpdate, project, id, patch),
    taskDelete: (project: string, id: string) => ipcRenderer.invoke(IPC.taskDelete, project, id),
    taskChecklistRead: (project: string) => ipcRenderer.invoke(IPC.taskChecklistRead, project),
    taskChecklistWrite: (project: string, content: string) => ipcRenderer.invoke(IPC.taskChecklistWrite, project, content),
  },
  onCompileStatus: (cb: (payload: unknown) => void) => {
    const listener = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(IPC.compileDiagnostics, listener)
    return () => ipcRenderer.removeListener(IPC.compileDiagnostics, listener)
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.configGet),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.configSet, patch),
  },
  onMenuCmd: (cb: (cmd: string) => void) => {
    const listener = (_e: unknown, cmd: string) => cb(cmd)
    ipcRenderer.on('menu-cmd', listener)
    return () => ipcRenderer.removeListener('menu-cmd', listener)
  },
  /** 本地文件经自定义协议供预览使用：booktool-file://local/<绝对路径>（逐段编码，host 固定 local 以保住路径首段） */
  fileUrl: (absPath: string) => 'booktool-file://local' + absPath.split('/').map(encodeURIComponent).join('/'),
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
