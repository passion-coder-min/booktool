# BookTool 详细设计文档

> 版本：v0.1（对应首轮开发完成态） · 更新：2026-08-16
> 配套文档：[DEVLOG.md](./DEVLOG.md)（开发记录与已知问题）

## 1. 产品定位

本地优先（local-first）的知识出版 + 工作管理桌面工具：

- **出版模式**：Markdown 所见即所得写作 → Typst 编译高质量 PDF（中文排版优化）
- **工作模式**：项目 Wiki + 任务（看板/日历/统计），数据全为纯文本文件，Git 友好

技术底座：Electron + React + TypeScript（pnpm monorepo）+ Typst CLI + Mermaid。

## 2. 信息架构与 UI 设计

### 2.1 全局布局

```
┌──┬─────────────────────────────────────────────────────┐
│  │ 顶栏（文档标题 · 保存状态 · 模式/布局切换 · 编译操作）    │
│活 ├──────────┬──────────────────────┬─────────────────┤
│动 │ 侧栏      │ 编辑区                │ 预览区           │
│栏 │ 248px    │ 格式工具栏 + 编辑器    │ HTML / PDF      │
│52 │ 可折叠    │                      │ 可折叠           │
│px │          │                      │                 │
│  ├──────────┴──────────────────────┴─────────────────┤
│  │ 状态栏（仅编译状态 + 诊断计数）                        │
└──┴───────────────────────────────────────────────────┘
```

- **活动栏**（5 项）：📖 出版 / 💼 工作 / 📅 日历（跨项目聚合）/ 📊 统计（跨项目）/ ⚙ 设置
- **面板管理铁律**：任何可关闭面板的开关常驻可见（侧栏 ☰ 在编辑区顶栏、诊断在状态栏计数），不存在"关闭后找不到入口"
- **布局三态**（Ctrl+\ 循环）：拆分（可拖 6px 分隔条，20%~80%）/ 仅编辑（IR 即所见即所得）/ 仅预览（阅读/审阅）
- **双主题**：浅/深（Ctrl+Shift+L），预览区恒为纸张白；布局/比例/模式全部 localStorage 持久化
- **空状态**：统一 EmptyCard（图标 + 说明 + 主操作），五个活动各有引导

### 2.2 出版活动（两级）

1. **书籍管理页**（默认）：卡片网格；新建（书名/作者/目录名）/ 重命名 / 删除（二次确认）/ **版本管理**（多版本 key-name-path 增删、激活切换，写 book.toml `[versions]`）
2. **书籍工作区**：侧栏 = 返回 + **文档管理**（浏览/管理两模式：✎ 重命名同步文件与 SUMMARY、🗑 删除可选删文件、↑↓ 调序）+ 诊断面板；主区 = 编辑 + 预览

### 2.3 工作活动

侧栏 = 项目管理（新建/重命名〔任务归属自动迁移〕/删除）+ Wiki 文件树（新建/重命名/删除）。
项目内三子页：**✅ 任务管理**（全字段表格 + 搜索 + 状态/优先级筛选 + 行内改状态 + 全字段编辑弹窗）、**📋 看板**（dnd-kit 三列拖拽改状态）、**📄 Wiki**（编辑 + 预览）。

日历活动：周/月视图、跨项目筛选、任务拖拽改 `scheduled`、逾期红边、"未安排"侧池。
统计活动：本周总数/已完成/逾期未完成/完成超期四卡片、项目完成率、近 8 周完成趋势。

## 3. 系统架构

```
pnpm workspaces monorepo
├── packages/shared   类型 + zod schema + SUMMARY 解析 + IPC 通道契约（双端共用）
├── packages/mdtypst  核心编译器（纯函数库，可独立测试）
└── apps/desktop      Electron 应用
    ├── electron/main    主进程（业务后端）
    ├── electron/preload 桥接（contextBridge + webUtils）
    └── src              React 渲染层
```

### 3.1 主进程模块

| 模块 | 职责 |
|---|---|
| `workspace.ts` | 工作区定位/扫描/切换；settings.json 持久化 |
| `books.ts` | 书籍/章节 CRUD（safeJoin 防越界、原子写 tmp+rename） |
| `summaryOps.ts` | SUMMARY.md 结构化编辑（定位/重命名/移除/调序/序列化） |
| `typst.ts` | Typst 二进制管理：PATH ≥0.13 → userData 已下载 → **多源下载**（GitHub→USTC 镜像，`BOOKTOOL_TYPST_MIRRORS` 可配，归档 tar 校验） |
| `compiler.ts` | 编译管线（见 §4）；`outputName` 支持实时预览 `build/preview.pdf` |
| `tasks.ts` | 任务 CRUD（YAML frontmatter + 正文，原子写） |
| `menu.ts` | 应用菜单（registerAccelerator:false 展示快捷键不拦截）+ 截图/滚动自检调试钩子 |
| `ipc.ts` | 全部 handler 装配，compile 事件推送 |

### 3.2 渲染层结构

```
App（活动路由 + 全局快捷键 + 菜单命令分发）
├── theme.tsx                主题（localStorage）
├── edit/formatCommands.ts   格式命令总线（纯函数：模板生成/前缀切换/脚注编号）
├── edit/EditorContext.ts    当前编辑器句柄注入（工具栏/快捷键/菜单共用）
├── components/  ActivityBar·StatusBar·FormatToolbar·HelpModal·ImageDialog·EmptyCard·SplitPane
│                Editor(CodeMirror)·VditorEditor(IR)·MarkdownPreview
└── book/ work/ settings/    各活动视图
```

**命令总线**是编辑交互的核心抽象：`EditorHandle { getValue/apply(cmd)/gotoLine/focus }`，CodeMirror 与 Vditor 各实现一份；工具栏按钮、快捷键、菜单、拖拽图片四处入口全部汇到 `apply(FormatCmd)`，行为一致、模式无关。

## 4. 出版编译管线

```
chokidar 保存防抖(500ms) ─▶ readChapter
  └▶ mdtypst.compileMarkdown(md, { preamble, resolveImage })
       ├ remark-parse + GFM + math + directive + frontmatter → mdast（节点带 position）
       ├ extractMermaid：code(lang=mermaid) → image(url=mermaid:{md5前12位})
       └ Compiler：mdast → Typst 源 + 行号映射（typLine↔mdLine，块级粒度）
  └▶ mmdc 渲染缺失 SVG（p-limit 3 并发；内容哈希缓存 build/assets/mermaid-{hash}.svg）
  └▶ 生成 build/{template.typ(共享函数), main.typ(全部样式), chapters/ch-XX-*.typ}
  └▶ typst compile --root 书籍根 --font-path resources/fonts → PDF
  └▶ 诊断解析（error/warning + ┌─ file:line:col）→ 行号映射回 .md → 侧栏诊断/编辑器跳转高亮
```

关键设计决策与教训：

1. **样式必须生成在 main.typ**：Typst 的 set/show 是词法作用域，写在被 include 的 template.typ 不会作用于后续章节——曾因此导致正文全部回退默认字体（见 DEVLOG 字体事故）
2. **图片路径用 `--root` 绝对路径**：`auto-fit-image` 位于 template.typ，相对路径会以 template.typ 为基准
3. **Mermaid 必须 `htmlLabels:false`**（且需顶层配置，mermaid 11 怪癖）：Typst 不渲染 SVG 的 `<foreignObject>`，否则图变空块
4. **行号映射**：每个块级节点在生成时记录 {typLine, mdLine}；Typst 诊断的 .typ 行号反查 .md 源行，点击跳转

### 4.1 mdtypst 编译器要点

- **转义器**：markup 模式保留字符集 context-aware 转义（`\c` 对任意字符安全）；字符串字面量单独转义 `\ " \n \r \t`
- **数学转换**（LaTeX→Typst）：符号表（确定名优先、Unicode 兜底）；`\frac` 单 token 用 `/`、多 token 用 `frac()`；多 token 上下标用 `attach()`（不产生可视括号）；**相邻字母自动加空格**（Typst 中 `mc` 是未知标识符，`m c` 才是乘积）；环境映射（matrix/cases/aligned→mat）
- **GFM 映射**：表格（auto 列宽 + table.header 跨页重复）、任务清单（模板 `task-item` 函数）、脚注（定义前置收集）、删除线；指令容器 → `admonition()`
- **图片超页**：`auto-fit-image` = `layout+measure` 按可用高/宽 `min(1, …)` 等比 `scale`，永不溢出分页

### 4.2 排版方案（模板）

| 特性 | 实现 |
|---|---|
| 中英混排 | `cjk-latin-spacing: auto`；西文/数字 `#show regex(...) 0.85em`（show 规则不抬行高，raw 不受影响） |
| 中文强调 | `#show emph: text(weight: 600)` 半粗体——CJK 字体无斜体，斜体回退会命中系统楷体类"艺术字" |
| 字体 | 捆绑 Noto Sans SC 400/700 + JetBrains Mono（`--font-path`），跨机器一致；代码字体栈追加 CJK 兜底（代码内中文） |
| 表格 | 行边界自动跨页 + 表头重复 |
| 图注 | `supplement: [图]` 中文编号 |
| 标题 | `numbering "1.1"`，H1 前弱分页 |

## 5. 数据格式

```
workspace/
├── books/<name>/{book.toml, src/{SUMMARY.md, *.md, assets/}, build/, output/}
└── projects/<id>/{project.json, wiki/*.md, tasks/*.md}
```

- **SUMMARY.md**：mdBook 兼容（Part 标题/嵌套列表/分隔线/顶层裸链接）；`summaryOps` 支持结构化编辑后序列化写回
- **book.toml**：`[book]` title/authors + `[versions]` active/`[[versions.list]]` key/name/path（切换编译源目录）
- **任务 frontmatter**：`id/title/project/status(todo|doing|done)/priority(low|normal|high|urgent)/due/scheduled/tags/links/created/completed` + 正文备注；拖拽 = 原子重写单文件
- settings.json（userData）：`{ workspaceRoot }`

## 6. IPC 契约（shared/ipc.ts 为唯一事实源）

workspace:get/choose-root/init-demo · book:load/read/write-chapter/append-summary/create/rename/delete/write-toml · chapter:create/rename/delete/move · book:compile(opts.outputName)/open-pdf · image:import/pick · project:create/rename/delete · wiki:create/rename/delete/read/write · task:list/create/update/delete · 推送 compile:diagnostics、menu-cmd · preload 另暴露 `filePath(file)`（webUtils 拖拽路径解析）与 `fileUrl(abs)`（booktool-file:// 自定义协议，图片/PDF 预览）。

## 7. 快捷键体系

- **编辑器内（格式 13 类）**：Ctrl+1~6/0 标题、Ctrl+B/I/K、Ctrl+T 表格、Ctrl+Shift+K 代码块、Ctrl+Shift+I 图片、Ctrl+M / Ctrl+Shift+M 公式、Ctrl+Shift+B 警告框、Ctrl+Shift+U/O/T 列表、Ctrl+Shift+D 分割线、Ctrl+Shift+F 脚注（CodeMirror keymap 精确实现；Vditor IR 为插入式）
- **全局**：Ctrl+S 保存编译、Ctrl+Shift+E 导出 PDF、Ctrl+E 模式、Ctrl+P 预览、Ctrl+\ 布局、Ctrl+Shift+L 主题、F8/Shift+F8 诊断、Ctrl+N 新建、Ctrl+/ 帮助
- 菜单展示全部快捷键（`registerAccelerator:false`，键盘由渲染层统一分发，经 `menu-cmd` IPC 汇入命令总线）

## 8. 质量保障

- **69 个 Vitest 用例**：转义/数学（30+ 例）/编译器全节点映射/SUMMARY 解析/模板断言/格式命令纯函数/**真实 Typst 端到端**（示例书全特性 → PDF → pdffonts 纯净断言）/**桌面管线集成**（mock electron 跑 compileBook）
- **运行时自检**：`BOOKTOOL_SCREENSHOT` 启动截图、`BOOKTOOL_CHECK_SCROLL` DOM 滚动断言、`BOOKTOOL_UI_STATE` 指定界面（自动化目检）
- 类型三包全量 noEmit；electron-vite 三端构建

## 9. 环境与分发

- Typst ≥0.13；缺失自动下载 v0.15.1（GitHub → USTC 镜像逐源校验；`BOOKTOOL_TYPST_MIRRORS` 自定义）
- mmdc：`npm i -g @mermaid-js/mermaid-cli` 或 `BOOKTOOL_MMDC`；缺失时 Mermaid 渲染失败以 error 诊断暴露（不静默）
- 静态资产（vditor 离线资源 24MB、字体 21MB）不入 git，`postinstall` 经 `scripts/sync-assets.mjs` 从 npm 依赖同步

## 10. 已知限制与路线图

见 [DEVLOG.md §已知问题](./DEVLOG.md#已知问题与待办)。
