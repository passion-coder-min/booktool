# BookTool

本地优先的知识出版 + 工作管理桌面工具（Electron + Typst + Mermaid）。

左手写书：Markdown 所见即所得编辑 → **Typst 编译高质量 PDF**（中英混排优化）；
右手做事：项目 Wiki、任务看板、拖拽日历与统计。

## 快速开始

```bash
pnpm install
pnpm dev          # 启动应用（开发模式）
pnpm test         # 69 个测试（含真实 Typst 编译端到端）
pnpm typecheck
pnpm build        # electron-vite 三端构建
```

首次启动建议点击「初始化示例内容」，会创建示例书籍（涵盖全部排版特性）与示例项目。

## 架构

```
packages/
├── shared/     类型 + zod schema + SUMMARY.md 解析 + IPC 契约
└── mdtypst/    核心编译器：mdast → Typst（转义/LaTeX→Typst 数学/行号映射/模板）
apps/desktop/
├── electron/   主进程：工作区、编译管线（mmdc + Typst CLI）、任务 CRUD、菜单
└── src/        React UI：活动栏布局、双主题、Vditor IR 编辑、看板/日历/统计
examples/demo-book/   全特性示例书籍（e2e 测试产物）
resources/fonts/      内置 Noto Sans SC 400/700 + JetBrains Mono 400/700
```

### 编译管线

```
Markdown ──remark(GFM+数学+指令)──▶ mdast
  ├─ Mermaid 代码块 ──mmdc（内容哈希缓存）──▶ SVG
  └─ mdtypst ──▶ build/{template.typ, main.typ, chapters/*.typ}（含行号映射）
        └─ typst compile --font-path resources/fonts ──▶ PDF
             └─ 诊断（.typ 行号 → .md 源行号 → 编辑器跳转高亮）
```

### 排版特性（均已通过真实编译 + 目检验证）

- **中英混排**：西文/数字 0.85em（show 规则不影响行高），`cjk-latin-spacing: auto`，两端对齐
- **中文强调用半粗体而非斜体**（CJK 字体无斜体，斜体回退会命中系统楷体类"艺术字"）
- **表格**：行边界自动跨页，表头跨页重复
- **图片**：超过页面可用高度/宽度时 `measure+scale` 等比缩小，永不溢出
- **Mermaid**：`htmlLabels: false`（Typst 无法渲染 SVG 的 foreignObject）+ 字体与书籍一致
- **数学**：LaTeX → Typst 数学（分式/上下标/矩阵/cases/对齐环境/黑板粗体）
- 指令容器 `:::note/tip/warning/danger`、脚注、任务清单、图题注中文化（图 1）

## 快捷键

| 类别 | 键 | 功能 |
|---|---|---|
| 格式 | Ctrl+1~6 / Ctrl+0 | 一~六级标题 / 恢复正文（再按取消） |
| 格式 | Ctrl+B / Ctrl+I / Ctrl+K | 加粗 / 斜体 / 链接 |
| 格式 | Ctrl+T | 表格（可选行列） |
| 格式 | Ctrl+Shift+K | 代码块 |
| 格式 | Ctrl+Shift+I | 图片 |
| 格式 | Ctrl+M / Ctrl+Shift+M | 行内 / 块级公式 |
| 格式 | Ctrl+Shift+B | 警告框 |
| 格式 | Ctrl+Shift+U / O / T | 无序 / 有序 / 任务列表 |
| 格式 | Ctrl+Shift+D | 分割线 |
| 格式 | Ctrl+Shift+F | 脚注 |
| 全局 | Ctrl+S | 保存并编译 |
| 全局 | Ctrl+E | 编辑模式切换（所见即所得 ↔ 源码） |
| 全局 | Ctrl+P | 预览切换（HTML ↔ PDF） |
| 全局 | Ctrl+Shift+L | 浅色 / 深色主题 |
| 全局 | F8 / Shift+F8 | 下一个 / 上一个诊断 |
| 全局 | Ctrl+N | 新建章节 / 任务 |
| 全局 | Ctrl+/ | 快捷键帮助 |

行前缀类命令（标题/列表）在源码模式下可精确切换；所见即所得（Vditor IR）模式下建议用工具栏。

## 环境依赖

| 依赖 | 说明 |
|---|---|
| Typst ≥0.13 | 系统未安装时自动下载 v0.15.1；国内网络自动尝试 USTC 镜像，也可用 `BOOKTOOL_TYPST_MIRRORS` 自定义（逗号分隔多源，逐个校验） |
| mmdc | `npm i -g @mermaid-js/mermaid-cli`；或 `BOOKTOOL_MMDC` 指定路径。缺失时 Mermaid 渲染失败会作为**错误级诊断**显示（不再静默空块） |
| 字体 | 已内置（resources/fonts），PDF 跨机器一致 |

## 工作区结构

```
workspace/
├── books/<book>/
│   ├── book.toml          # 标题/作者/多版本（[versions]）
│   └── src/SUMMARY.md     # 章节目录（mdBook 兼容：Part/嵌套/分隔线/裸链接）
└── projects/<proj>/
    ├── project.json
    ├── wiki/*.md          # 项目知识库
    └── tasks/*.md         # 每任务一个文件（YAML frontmatter，Git 友好）
```

任务字段：`status(todo/doing/done)`、`priority`、`due`（逾期判定）、`scheduled`（日历落格）、
`tags`、`links`（关联 wiki）。看板拖拽改状态、日历拖拽改计划日期，均原子写回文件。

## 调试

- `BOOKTOOL_SCREENSHOT=/path.png electron .` —— 启动 5 秒后截图并退出（UI 自动化目检）
- 诊断面板：`.typ` 行号已自动映射回 `.md` 源行号，点击跳转编辑器并高亮
