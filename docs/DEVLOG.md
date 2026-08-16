# BookTool 开发记录（DEVLOG）

> 首轮开发：2026-08-15 ~ 08-16 · 详细设计见 [DESIGN.md](./DESIGN.md)

## 时间线

### 第一阶段：编译器核心（08-15 上午）

- 搭建 pnpm monorepo：`packages/shared`（类型/契约）、`packages/mdtypst`(编译器)、`apps/desktop`(Electron)
- **技术选型确认**（用户决策）：React / 任务存 Markdown 文件 / 先出版管线 / Typst CLI 自动下载
- 实现并测试 mdtypst：markup 转义器、mdast→Typst 全节点映射（GFM 表格/任务清单/脚注/删除线、数学、指令容器、Mermaid 提取、行号映射）
- LaTeX→Typst 数学转换器迭代：发现并修复三处正确性问题——相邻字母粘连（`mc` 是 Typst 未知标识符）、多 token 上下标需 `attach()`、`\frac` 多 token 需函数形式
- remark-math 行为发现：单行 `$$…$$` 解析为 inlineMath → 段落级单公式按展示公式输出
- 下载 Typst 0.15.1（国内网络：GitHub 直连慢，改用 **USTC 镜像** `mirrors.ustc.edu.cn/github-release/typst/typst/LatestRelease`；LatestRelease 曾遇损坏，版本目录可靠 → 下载器改为多源逐个校验）
- **端到端验证**：示例书（中英混排/数学矩阵 cases aligned/表格/Mermaid×3/容器/脚注）真实编译出 PDF，渲染 PNG 逐页目检

### 第二阶段：桌面应用骨架（08-15 下午）

- 主进程：workspace/books/typst(多源下载)/compiler(管线)/tasks(CRUD)/ipc；preload 桥接；`booktool-file://` 自定义协议（图片/PDF 预览）
- 渲染层：React + CodeMirror + HTML 预览（remark→rehype + KaTeX + mermaid.js + highlight）；工作模式（看板/日历拖拽/统计）
- Electron 踩坑：pnpm 需 `onlyBuiltDependencies` 放行 electron/esbuild；preload 产物为 `.mjs`；workspace 包必须打包进 bundle（externalizeDepsPlugin exclude）
- 验证：应用真实启动、preload 无错、loadBook 单测

### 第三阶段：排版修复轮（08-15 晚，用户反馈驱动）

用户反馈：表格跨页、图片超页、**Mermaid 空块**、**字体变"艺术字"**。

字体问题根因链（`pdffonts` 逐层定位，三层独立根因）：
1. **样式作用域**：`#include "template.typ"` 里的 set/show 是词法作用域，不作用于后续章节 → 正文一直是 Typst 默认衬线 + 系统艺术字回退。修复：全部样式生成在 main.typ
2. **代码块中文**：等宽栈无 CJK 兜底 → 代码内中文回退汉仪雁翎体。修复：栈尾追加 Noto Sans SC
3. **斜体回退**：`*强调*` 需斜体而 CJK 字体无斜体变体 → 楷体类回退。修复：`#show emph: text(weight: 600)` 半粗体
4. 根治：捆绑 Noto Sans SC/JetBrains Mono（`--font-path`），修复后 `pdffonts` 仅余捆绑家族

其余：表格跨页表头重复（文本层验证）、`auto-fit-image`（measure+scale，600×2400 高图缩至单页目检通过）、Mermaid 空块根因 = SVG `foreignObject`（Typst 不渲染）→ `htmlLabels:false`（需顶层配置的 mermaid 11 怪癖）后标签恢复且文本用捆绑字体。

### 第四阶段：UI 重设计与所见即所得（08-15 深夜 ~ 08-16）

用户要求"先设计后实现"，经三轮设计确认（活动栏布局 / 双主题 / IR 默认）：

- **v2.1**：活动栏 + 侧栏 + 状态栏骨架；Vditor IR 所见即所得（离线资源）；13 类格式命令总线（工具栏/快捷键/菜单三入口）；实时编译预览（防抖 800ms → build/preview.pdf）
- **v2.2**（用户补充：布局合并/拆分 + 管理体系）：布局三态 + 拖拽分隔条；书籍管理页（卡片 + 版本管理弹窗）；文档管理（✎🗑↑↓ 同步 SUMMARY）；任务管理页（表格/筛选/编辑弹窗）；Wiki/项目管理；EmptyCard 空状态
- **Vditor 404 事故**：资源拷贝少一层目录（`public/vditor/*` vs 期望 `public/vditor/dist/*`），编辑器初始化整体失败 → 修复 + 增加资源自检与失败兜底卡片（重试/切源码）

### 第五阶段：编辑体验修复（08-16，用户反馈驱动）

用户反馈：状态栏参数杂、菜单栏、**编辑区不能滚动**、工具栏显示不全、图片双方式。

- **滚动**：补全 CSS 滚动链（flex/min-height:0/overflow-y:auto），DOM 自检 `scrollable:true`；期间抓到 TDZ 白屏 bug（effect 引用了未初始化的回调）
- **状态栏**：只留编译状态 + 诊断计数；技术参数移入菜单/设置
- **菜单**：文件/编辑/格式/视图/帮助五项齐全；新增 **导出 PDF（Ctrl+Shift+E）** 一键直达
- **工具栏**：收纳为「常用 8 按钮 + 插入▾ 下拉」，单行完整（截图验证）
- **图片**：双模式对话框（图床 URL / 本地自动拷贝 `assets/` + 时间戳防重名）+ **拖拽插入**（`webUtils.getPathForFile` → image:import IPC → 光标插入）

### 收尾（08-16）

- 资产同步脚本（vditor/字体不入 git，postinstall 重建）；DESIGN.md/DEVLOG.md；git 初始化提交

## 验证状态（当前）

| 项 | 结果 |
|---|---|
| Vitest | 69/69（含真实 Typst 端到端 + 桌面管线集成） |
| 类型检查 | 三包 noEmit 全绿 |
| 构建 | electron-vite 三端全过 |
| 运行时 | 启动无错；截图目检：书籍管理页/工作区(IR 渲染)/任务管理页/菜单栏/工具栏单行 |
| 滚动 | DOM 断言 scrollable:true |
| PDF 字体 | pdffonts 仅捆绑家族（无艺术字回退） |

## 已知问题与待办

> 以下为已知未解决项，按影响排序（用户反馈的"其他问题"请补充于此）：

### 体验
- [ ] Vditor IR 模式的行内格式命令（标题/列表切换）为"插入式"而非精确切换——工具栏在 IR 下对这几类不如源码模式精准（帮助弹窗已有提示）
- [ ] 图片**粘贴**（Ctrl+V 截图）未支持，目前仅拖拽与对话框
- [ ] 实时编译在 IR 模式连续输入时频繁触发（防抖 800ms 但无编译排队去重），大书可能连续编译
- [ ] Vditor 深色主题的内容主题固定 light（编辑区深色下 IR 渲染区仍偏亮）
- [ ] 诊断跳转在 IR 模式会强制切到源码模式（IR 无行定位能力）

### 功能缺口
- [ ] 应用打包分发（electron-builder 未配置，Windows/macOS 未测试）
- [ ] 多版本切换后 UI 章节树未提示版本来源；版本目录不存在时编译报错缺引导
- [ ] 全文搜索（跨章节/wiki）未实现
- [ ] SUMMARY 拖拽调序（现为 ↑↓ 按钮）
- [ ] 任务列表批量操作、日历月视图拖拽体验
- [ ] `:::tasks{...}` wiki 内任务聚合指令（mdtypst 已预留，渲染未实现）

### 工程
- [ ] chokidar 文件监听（外部编辑器改动同步）未接入
- [ ] 主进程仅集成测试覆盖 compileBook；IPC handler 无单测
- [ ] mermaid gantt/甘特图中文字体与主题微调
- [ ] 键盘 Ctrl+B 在工作活动兼作侧栏开关、出版活动保留加粗——语义分裂待统一

## 提交说明

初始提交按逻辑拆分：
1. `packages/` —— 编译器与共享库（含测试）
2. `apps/` + 配置 —— 桌面应用
3. `docs/` + README —— 文档

静态资产（vditor 24MB / 字体 21MB）与 `.tools/typst` 不入库，`pnpm install` 自动重建（scripts/sync-assets.mjs）。
