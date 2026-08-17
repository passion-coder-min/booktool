# AGENTS.md — BookTool 开发指南

供后续 AI / 开发者在本仓库工作时阅读。只收录「动手前必须知道」的信息；产品设计见
[docs/DESIGN.md](docs/DESIGN.md)，开发记录与已知问题见 [docs/DEVLOG.md](docs/DEVLOG.md)。

## 一句话

本地优先的知识出版 + 工作管理桌面工具（Electron + React + TypeScript + Typst + Mermaid）：
Markdown 所见即所得写作 → Typst 编译高质量 PDF；项目 Wiki / 工作日报 / 任务看板 / 拖拽日历 / 统计。
所有数据为纯文本（Git 友好），`pnpm` monorepo。

## 常用命令（根目录）

```bash
pnpm install     # 安装并自动同步可重建静态资产（vditor 约 24MB / 字体约 21MB，不入 git）
pnpm dev         # 启动 Electron 应用（electron-vite dev）
pnpm test        # vitest 全量（部分用例跑真实 Typst + mmdc + pdftotext，缺工具则跳过）
pnpm typecheck   # 四个子包 tsc --noEmit（shared / mdtypst / desktop / cli）
pnpm build       # 桌面三端构建 + CLI 构建（重建 out/renderer 等产物）
```

本地工具：`.tools/typst`（捆绑 Typst 0.15.1）、`mmdc`（mermaid 导出 SVG）、`pdftotext`（e2e 检测）。

## 架构地图

```
packages/shared   双端共用：types + zod schema + SUMMARY 解析 + dates(ISO 周) + IPC 通道契约(ipc.ts)
packages/mdtypst  核心编译器 mdast → Typst（纯函数，可独立测试）：parse/compile/escape/math/html/
                  table-layout/template(渲染 template.typ + main.typ)/mermaid/slug
packages/cli      mdbook 风格 CLI（独立站点构建/本地服务）
apps/desktop
├── electron/main   主进程：index(窗口+自定义协议) ipc(所有 handler) compiler(编译管线)
│                    books(书籍+原子写 atomicWrite) workspace(工作区扫描) tasks  reports(日报)
│                    typst(引擎管理) menu(菜单+自动化截图钩子) config
├── electron/preload contextBridge 暴露 window.api（与 src/api-types.ts 保持同步）
└── src             React UI：App(活动栏+全局快捷键) book/(出版) work/(工作+日历+统计) components/
                    api.ts(渲染层调用面) styles.css
```

### 数据流要点

- **渲染层 → 主进程**：一律走 IPC。新增一个磁盘/主进程功能需同步改四处：
  1. `packages/shared/src/ipc.ts` 加通道名
  2. `apps/desktop/electron/main/ipc.ts` 注册 handler
  3. `apps/desktop/electron/preload/index.ts` 暴露到 `window.api`
  4. `apps/desktop/src/api-types.ts` 补类型
- **书籍编译管线**：mdast→Typst（mdtypst）→ 章节 `.typ` → mermaid 经 mmdc 出 SVG → `typst compile` 出 PDF。
  章节文件 `#import "../template.typ": *` 使用共享函数；`template.typ` 由 `renderTemplate()` 生成。

### 存储布局（workspace 根）

```
books/<name>/{book.toml, src/SUMMARY.md, src/*.md}    # 出版书籍（mdBook 形态）
projects/<id>/{project.json, wiki/, reports/, tasks/}  # 项目：Wiki 树 / 工作日报 / 任务
```

- Wiki：`wiki/**/*.md`（支持子目录 → 层级树）
- 日报：`reports/<周一日期>-W<ISO周号>.md`（如 `2026-08-17-W34.md`），每周一个文件，按天 `## YYYY-MM-DD 周X`
- 任务：`tasks/<id>.md`（frontmatter + body）

## 关键约定与坑（务必先读）

- **Typst 的 `set/show` 是词法作用域**：写在被 include 的文件里不生效 → 全部样式必须生成在
  `main.typ` 顶部（见 `mdtypst/src/template.ts` 头注释）。
- **SVG 嵌入不能用 `scale(img, x: f*100%)`**：Typst 0.15.1 的 PDF 后端会对 `scale()` 包裹的 SVG 额外乘一层
  缩放（图片被缩成很小）。必须用 `image(src, width: 宽)` 仅指定宽度。回归断言见 `demo-e2e.test.ts`
  （Mermaid 图文字跨度须占内容区宽 >60%）。
- **Typst 里 `type(x) == "str"` 恒为 false**：比较类型要用 `type(x) == str`（无引号）。这是 SVG 被当位图、
  无法放大的隐蔽原因。
- **VditorEditor 只在 `docKey` 变化时重建**，忽略 `value` 变化。程序化更新内容（如日报"今日"追加）必须
  在同一渲染里同时 `setDoc(新内容)` + 自增版本号并拼进 `docKey`，否则编辑区不刷新（见 `ReportsPane.tsx`）。
- **dnd-kit 拖拽元素上 `click` 不可靠**：任务卡片交互用 `onDoubleClick`（记得 `stopPropagation` 挡住日期格
  的双击新建）+ `onMouseEnter/Leave` 做悬停浮层，不要依赖单击。
- **dev 模式渲染层走 Vite 源文件**（`ELECTRON_RENDERER_URL`）；`out/renderer` 只给 `electron-vite preview`
  和打包版用。改了渲染层源码，`pnpm dev` 直接生效，但要用 preview/打包版验证必须 `pnpm build` 重建
  `out/renderer`（历史上出现过"源码修好了、产物是旧的"导致 bug 复现）。
- **本地图片/PDF 预览**走自定义协议 `booktool-file://local/<绝对路径>`（Electron 的 net 模块不支持 file://）。
- **Vditor 仅启用 IR 模式**：切勿对 `.vditor-wysiwyg/.vditor-sv` 强制 `display:flex`（会把隐藏面板一起渲染）。
- **原子写**用 `books.ts` 导出的 `atomicWrite(file, content)`（临时文件 + rename），任务/日报/书籍写盘都用它。
- **工作区刷新**：`scanWorkspace()` 每次全扫磁盘；渲染层 `onChanged()` 会重取 workspace，UI 应"由 id 派生
  当前项目对象"以拿到最新的 `wikiFiles/reportFiles`（见 `WorkActivity.tsx`）。

## 测试与验证

- `pnpm test`：单元 + 集成。`packages/mdtypst/test/demo-e2e.test.ts` 会用**真实 Typst** 编译示例书成 PDF，
  做客观重叠检测与 Mermaid 宽度断言（缺 `typst`/`mmdc`/`pdftotext` 时跳过）。
- 桌面主进程 `compiler.integration.test.ts` 覆盖 compileBook 端到端（含 Mermaid 容错）。
- UI 验证可用无头浏览器 + 注入 mock `window.api`（渲染层是纯 Web，不依赖 Electron）；主进程另有
  `BOOKTOOL_SCREENSHOT` 截图钩子（见 `electron/main/menu.ts`）供真实应用自动化目检。

## 提交规范

- 提交信息沿用 `类型(范围): 中文描述`，如 `fix(mdtypst): ...`、`feat(desktop+core): ...`、`fix(desktop): ...`。
- 静态资产（vditor/字体/typst）、`.tools/`、`out/`、`examples/*/build|output`、`*.pdf` 均不入库。
