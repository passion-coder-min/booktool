import { Menu, BrowserWindow, app, shell, type MenuItemConstructorOptions } from 'electron'

/**
 * 应用菜单：格式类命令仅展示快捷键（registerAccelerator: false，不拦截键盘），
 * 键盘由渲染层统一处理；菜单点击经 'menu-cmd' IPC 转发到渲染层命令总线。
 */
export function setupMenu() {
  const send = (cmd: string) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('menu-cmd', cmd)
  }
  const cmd = (label: string, accelerator: string, id: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(id),
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        cmd('保存并编译', 'Ctrl+S', 'save-compile'),
        cmd('导出 PDF…', 'Ctrl+Shift+E', 'export-pdf'),
        cmd('新建章节 / 任务', 'Ctrl+N', 'new'),
        cmd('打开目录', '', 'open-dir'),
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '格式',
      submenu: [
        cmd('一级标题', 'Ctrl+1', 'h1'),
        cmd('二级标题', 'Ctrl+2', 'h2'),
        cmd('三级标题', 'Ctrl+3', 'h3'),
        cmd('四级标题', 'Ctrl+4', 'h4'),
        cmd('五级标题', 'Ctrl+5', 'h5'),
        cmd('六级标题', 'Ctrl+6', 'h6'),
        cmd('恢复正文', 'Ctrl+0', 'h0'),
        { type: 'separator' },
        cmd('加粗', 'Ctrl+B', 'bold'),
        cmd('斜体', 'Ctrl+I', 'italic'),
        cmd('链接', 'Ctrl+K', 'link'),
        cmd('行内代码', '', 'inline-code'),
        { type: 'separator' },
        cmd('插入图片…', 'Ctrl+Shift+I', 'image'),
        cmd('插入表格…', 'Ctrl+T', 'table'),
        cmd('插入代码块', 'Ctrl+Shift+K', 'codeblock'),
        cmd('行内公式', 'Ctrl+M', 'math-inline'),
        cmd('块级公式', 'Ctrl+Shift+M', 'math-block'),
        { type: 'separator' },
        cmd('警告框', 'Ctrl+Shift+B', 'admonition'),
        cmd('无序列表', 'Ctrl+Shift+U', 'list-bullet'),
        cmd('有序列表', 'Ctrl+Shift+O', 'list-ordered'),
        cmd('任务列表', 'Ctrl+Shift+T', 'list-task'),
        cmd('引用', '', 'blockquote'),
        cmd('分割线', 'Ctrl+Shift+D', 'hr'),
        cmd('脚注', 'Ctrl+Shift+F', 'footnote'),
      ],
    },
    {
      label: '视图',
      submenu: [
        cmd('切换编辑模式（所见即所得 ↔ 源码）', 'Ctrl+E', 'toggle-editor-mode'),
        cmd('切换预览（HTML ↔ PDF）', 'Ctrl+P', 'toggle-preview'),
        cmd('循环布局（拆分 → 仅编辑 → 仅预览）', 'Ctrl+\\', 'cycle-layout'),
        cmd('切换侧栏', '', 'toggle-sidebar'),
        { type: 'separator' },
        cmd('切换浅色 / 深色主题', 'Ctrl+Shift+L', 'toggle-theme'),
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        cmd('快捷键一览', 'Ctrl+/', 'help'),
        {
          label: '关于 BookTool',
          click: () => void shell.openExternal('https://typst.app'),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** 调试辅助：
 *  - BOOKTOOL_SCREENSHOT=/path.png —— 启动后截图并退出（BOOKTOOL_SHOT_DELAY 自定义等待毫秒）
 *  - BOOKTOOL_CHECK_SCROLL=1 —— 输出编辑区滚动自检
 *  - BOOKTOOL_UI_DUMP=1 —— 输出布局度量 + 渲染进程 console
 */
export function setupScreenshotHook(win: BrowserWindow) {
  const target = process.env.BOOKTOOL_SCREENSHOT
  if (!target) return
  const delay = Number(process.env.BOOKTOOL_SHOT_DELAY || 5000)
  setTimeout(async () => {
    try {
      if (process.env.BOOKTOOL_UI_DUMP) {
        win.webContents.on('console-message', (_e, _level, message) => {
          console.log('[renderer-console]', message.slice(0, 300))
        })
      }
      if (process.env.BOOKTOOL_CHECK_SCROLL) {
        const info = await win.webContents.executeJavaScript(`(() => {
          const el = document.querySelector('.vditor-ir pre.vditor-reset') || document.querySelector('.cm-scroller') || document.querySelector('.vditor') || document.querySelector('.editor-host')
          const ctx = {
            hash: location.hash,
            host: !!document.querySelector('.editor-host'),
            empty: !!document.querySelector('.empty-card, .modal'),
            bodySnippet: document.body.innerText.slice(0, 120),
          }
          if (!el) return 'NO_EDITOR_EL ' + JSON.stringify(ctx)
          const cs = getComputedStyle(el)
          return JSON.stringify({
            tag: el.tagName, cls: String(el.className).slice(0, 60),
            overflowY: cs.overflowY, scrollH: el.scrollHeight, clientH: el.clientHeight,
            scrollable: el.scrollHeight > el.clientHeight && cs.overflowY === 'auto',
            ctx,
          })
        })()`)
        console.log('[scroll-check]', info)
      }
      if (process.env.BOOKTOOL_UI_DUMP) {
        const dump = await win.webContents.executeJavaScript(`(() => {
          const r = (sel) => {
            const el = document.querySelector(sel)
            if (!el) return null
            const b = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), fontSize: cs.fontSize, overflowY: cs.overflowY, display: cs.display, padding: cs.padding }
          }
          const eh = document.querySelector('.editor-host')
          const vd = document.querySelector('.vditor')
          return JSON.stringify({
            bodyText: document.body.innerText.slice(0, 160),
            hash: location.hash,
            editorHostHTML: eh ? (eh.className + ' | ' + eh.innerHTML.slice(0, 200)) : null,
            vditorCls: vd ? (String(vd.className) + ' childCount=' + vd.childElementCount) : 'NO .vditor',
            viewport: { w: innerWidth, h: innerHeight },
            sidebar: r('.sidebar'),
            editorToolbar: r('.editor-toolbar'),
            editorHost: r('.editor-host'),
            preview: r('.preview'),
            diagPanel: r('.diag-panel'),
            fontStack: getComputedStyle(document.querySelector('.vditor-ir pre.vditor-reset') || document.body).fontSize,
          })
        })()`)
        console.log('[ui-dump]', dump)
      }
      const img = await win.webContents.capturePage()
      const fs = await import('node:fs')
      fs.writeFileSync(target, img.toPNG())
      console.log(`[screenshot] saved: ${target}`)
    } catch (err) {
      console.error('[screenshot] failed', err)
    }
    app.quit()
  }, delay)
}
