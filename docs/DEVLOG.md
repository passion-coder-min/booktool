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

### 第六阶段：工作区布局重设计（08-16，用户反馈驱动）

用户反馈三点：所见即所得下侧边预览应关闭、所见即所得前「多出两个块」把文档压到下方、界面不够美观。

- **根因定位（DOM 度量）**：`.vditor-wysiwyg` / `.vditor-sv` 被自定义 CSS 强制 display:flex !important，
  覆盖了 Vditor 行内 display:none → 三个模式面板同时渲染、均分高度（795px 被切成 258×3），
  文档只在最底部 1/3 可见。修复：仅 IR 面板可见，其余 display:none !important，正文恢复全高。
- **所见即所得自动收拢**：IR 模式强制「仅编辑」布局并隐藏布局切换；切回源码恢复上次布局；
  cycleLayout 在 IR 下为 no-op（避免切回时布局意外变化）。
- **两块合一**：编辑区「面板头 + 格式工具栏」两层合并为单行统一工具栏（标题/保存 + 格式 + 模式），正文上移一栏。
- **美观**：正文纸张居中列（≤900px）+ 四周面板色衬底（「桌面上的纸张」）、view-tabs 改为分段胶囊控件（全局一致）、
  侧栏新增书籍名头栏、浅深主题均目检通过。
- 验证：CDP 布局度量（编辑器由 258px→833px 全高、滚动 scrollH>clientH、IR 无预览窗、源码恢复拆分）、
  截图像素级核对（纸张列居中、单行工具栏、深色主题对比）。

### 第七阶段：PDF 预览与 GL 异常排查（08-16，用户反馈驱动）

用户反馈：点最右侧「黑框」出现 GetVSyncParametersIfAvailable() 报错、PDF 编译后无法预览、::: 提示块在所见即所得下显示为源码。

- **GL 报错非黑框所致**：GetVSyncParametersIfAvailable() failed 是 Chromium 合成器在无可用 GPU/VSync 环境下的
  stderr 提示（无头/虚拟机/远程桌面常见），任何重绘都会触发计数递增，与黑框无关、不影响功能；真机正常显卡一般不出现。
- **「黑框」= PDF 预览 iframe 空白**：pdf-frame 背景 #525659，PDF 加载失败时即显示为黑框。根因有二：
  1. 自定义协议 handler 用 net.fetch(file://) 读文件——Electron 的 net 模块**不支持 file: 协议**，返回空响应；
  2. fileUrl 把绝对路径整体 encodeURIComponent 放进 URL（booktool-file://%2Fhome...），产生非法 URL
     （无 host、路径首段被吞），Chromium URL 解析即失败。
  修复：handler 改用 fs.readFile + 按扩展名返回 Content-Type（pdf→application/pdf）；fileUrl 改为
  booktool-file://local/<逐段编码绝对路径>（host 固定 local，绝对路径完整保留在 pathname）；PDF 预览改为
  先 fetch 读入 Blob → URL.createObjectURL 再作为 iframe src（与 Chromium 内置 PDF 查看器配合最稳，组件卸载回收 Blob URL）。
- **::: 提示块在所见即所得下为原始源码**：Vditor IR（Lute）不识别自定义 ::: 指令，属编辑器引擎限制；
  HTML 预览与编译 PDF 均正常渲染为提示框（见「已知问题」）。

### 第八阶段：编译诊断 + 所见即所得铺满 + callout 三端统一（08-16，用户反馈驱动）

用户反馈：图片粘贴目录与方式、Vditor callout、所见即所得显示小、编译按钮/输出位置、面板开关、编译问题诊断、错误详情。

- **编译问题诊断（真实编译用户书籍复现）**：
  - 根因一：旧版粘贴残留 `data:image/png;base64,...` 直接进 Markdown → Typst 报 file not found 编译失败。
    修复：compileBook 的 resolveImage 将 data URL 解码落盘 `build/assets/data-<hash>.<ext>`（sha1 去重）。
  - 根因二：字体回退列表（Source Han Sans SC/YaHei/PingFang 等）在部分系统缺失 → 每次编译 6 条
    "unknown font family" 噪音警告。修复：诊断阶段过滤该类别（仅丢弃警告，错误保留）。
  - 根因三：callout 标题正则用 `\s+` 分隔，`> [!NOTE]\n> 内容` 会把正文首行误当标题、正文空。
    修复：mdtypst 与 HTML 预览统一改为 `[ \t]+`（标题须与标签同行）。
- **诊断面板**：选中条目自动展开详情（源码行 + 生成 .typ 片段 + Typst 原始块）；高度可拖拽（160~560px 持久化）；
  状态栏/⚠ 从关闭态打开时自动选中首条错误；默认收起、编译后不自动弹出。
- **所见即所得铺满**：IR 正文 15.5px / 行高 1.8 / 内边距 24 30 40，默认仅编辑占满（工具栏「◫ 预览」可并排预览）。
- **callout 三端统一**：工具栏「警告框」插入 `> [!NOTE/TIP/WARNING/CAUTION]`（Vditor 3.11 原生渲染），
  显式开启 `preview.markdown.callout`；旧 `:::` 指令仍被预览/PDF 兼容。示例书籍迁移到 callout。
- **图片**：粘贴/拖拽/对话框统一存入 `书籍根/image/<文档名>/`，对话框文案同步修正。
- 验证：72/72 测试（新增 callout 编译用例）、typecheck 全绿、真实编译用户书籍 ok=true 零诊断、应用启动无错。

### 第九阶段：编辑区滚动回归修复 + 编译产物路径直达（08-16，用户反馈驱动）

用户反馈：编辑页面无法滚动；编译成功后希望显示输出路径并直接查看。

- **滚动回归根因（长文 DOM 度量复现）**：`.pane` 缺 `min-height: 0`——flex 子项默认 `min-height:auto` 拒绝收缩，
  编辑区随内容被撑到整文高度（长文实测 `.editor-host` 被撑到 16156px，`pre.vditor-reset` 的
  `clientH == scrollH == 16156`，内部 `overflow-y:auto` 无内容可滚）。
  短章节恰好不溢出，此前（第五/六阶段）的滚动自检用的是短示例故未暴露。
  修复：`.pane` 与 SplitPane 左右两栏补 `min-height: 0`；长文实测 `scrollH 16156 > clientH 833`、`scrollable:true`
  （源码 CodeMirror 走同一滚动链，同样受益）。
- **编译产物路径直达**：编译成功后编辑工具栏显示输出路径胶囊（相对路径如 `output/book.pdf`，hover 显示绝对路径），
  「📄 路径」一键用系统 PDF 查看器打开、「预览」切到应用内 PDF 预览并显示预览面板。
  顺带修复 `book:open-pdf` 只认 `output/book.pdf` 的问题：实时编译产物 `build/preview.pdf` 此前无法打开，
  现优先使用本次编译返回的实际 `pdfPath`（无则回退默认产物）。
- 验证：长文滚动自检 `scrollable:true`；真实编译 demo 书后 `.pdf-out` 显示 `output/book.pdf`、
  点「预览」出 PDF iframe（pdfFrame:true）；72/72 测试、typecheck 全绿。

### 第十阶段：HTML 预览 callout 修复 + 帮助弹窗语法支持页（08-16，用户反馈驱动）

用户反馈：`> [!Note]` 在所见即所得正常显示，但 HTML 预览不一致（显示成原始源码）；希望帮助页说明支持的语法，
并澄清 `:::tip{...}` 指令只在编译 PDF 生效、所见即所得不预览。

- **callout 在 HTML 预览失效的根因（AST 定位）**：`remarkCallout` 插件遍历时把「子数组」当 parent 传入
  （`transform(roots, i)` / `transform(kids, i)`），而 `transform` 第一行 `parent.children?.[index]` 取不到节点
  （数组没有 children 字段）→ 每次立即 return，整个插件静默失效，`> [!NOTE]` 在 HTML 预览一直渲染成普通引用块
  （字面 `[!NOTE]` 文本），与所见即所得不一致。
  修复：插件抽出为独立模块 `src/components/remarkCallout.ts`，顶层/递归都改传「节点本身」；
  HTML 预览现与所见即所得/PDF 一致（`:::tip{...}` 与 `> [!NOTE]` 均渲染为提醒框）。
- **帮助弹窗新增「语法支持」页签**：快捷键 / 语法支持两页；语法矩阵表列出各语法在
  「所见即所得 / HTML 预览 / 编译 PDF」三端的支持情况；并用警示框明确说明
  `:::tip{title="…"} … :::` 指令容器只在 HTML 预览与编译 PDF 生效，所见即所得会显示为源码，
  建议改用 GitHub callout（三端一致）。
- 验证：新增 remarkCallout 单测 7 例全过（原 72 → 79 例）；应用内实测 HTML 预览两个提醒框均渲染、
  无字面 `[!` 残留；帮助弹窗两页签 + 11 行语法矩阵 + `:::` 说明正常；typecheck 全绿。

### 第十一阶段：编译显示移到底部状态栏 + 脚注三端一致（08-16，用户反馈驱动）

用户反馈：编译显示应在下方而不是右侧；脚注在所见即所得与 HTML 预览显示不一致。

- **编译显示下移至底部**：移除编辑工具栏右侧的「产物路径 + 打开/预览」胶囊与预览面板内的编译状态条，
  统一收进底部状态栏——编译成功后状态栏显示「✓ 编译完成 X.Xs · 相对产物路径」+「打开（系统查看器）/ 预览（应用内）」按钮，
  完整状态文本（含 Mermaid 统计）放入悬浮提示；状态栏经 `statusBarInfo` 透传 `ok/status/pdfRel/pdfPath`。
  实测：状态栏 `✓ 编译完成 0.9s · output/book.pdf[打开][预览]`，工具栏不再有 `.pdf-out`。
- **脚注 HTML 预览与所见即所得一致**：Vditor IR 脚注引用渲染为 `[1]`（带方括号）+ 底部脚注区块（2px 顶部分隔线）；
  HTML 预览此前引用无括号、`.footnotes` 区块无样式。修复：CSS 给 `sup a[data-footnote-ref]` 加 `::before/::after` 方括号，
  并给 `section.footnotes` 加与 Vditor 一致的顶部分隔线/间距/颜色。
  实测：HTML 预览引用 `::before="["` `::after="]"`、脚注区块 `border-top:2px`，与所见即所得一致。
- 验证：79/79 测试、typecheck 全绿、应用内真实编译后状态栏与脚注渲染均实测通过。

### 第七阶段：整书编译容错 + 图片加载修复（08-16，真实书验证驱动）

用户用 188 章真实书（`mini_doc/android`，808 张图 / 64 个 Mermaid / 中文文件名）编译 PDF 失败，且所见即所得/HTML 预览图片均不显示。逐层定位出 5 个独立根因：

**编译管线（此前任一错误都会中止整书）：**
1. **空 Mermaid 块**：`ams.md` 有空 ` ```mermaid ` 块，mmdc 渲染必败 → `Promise.all` 中止。修复：mdtypst 跳过空块（替换为空段落 + 警告）
2. **单图渲染失败中止全书**：mermaid job 加 try/catch，失败写占位 SVG（红框+错误摘要）+ 警告，编译继续
3. **强调后紧跟括号**：`**协程**(说明)` → `#strong[协程](说明)` 被 Typst 解析为函数调用报错。修复：表达式后文本以 `(`/`{` 开头时转义首字符
4. **悬空锚点**：`[x](#Message)` 无对应标题 → Typst 对缺失 label 报错。修复：prepass 收集标题 label，缺失降级纯文本+警告；整书编译用 `knownLabels` 全局解析（demo 书跨章节锚点）
5. **本地图片缺失 / 远程图不可用 / 扩展名错标**：`android_cts/image.png` 不存在；唯一远程图（byteimg）被 Typst CLI 拒绝（网络取图不支持）；`2016-05-05_....gif` 实为 JPEG。修复：缺失 → 占位 SVG+警告；远程 → 编译前预取到 `build/assets`（失败占位+警告）；魔数嗅探扩展名纠偏（复制到 assets 用正确扩展名）
6. 顺手修复单文件模式 data URL 落盘目录传错（`saveDataImage(fileAbs,…)` → `/../` 逃逸 `--root`）

**图片显示（baseDir 相对路径未解析）：**
7. **HTML 预览**：`MarkdownPreview` 的 `key={renderTick%2}` 翻转导致重挂载、img src 重写被丢弃（mermaid 同样被丢）。修复：改为 rehype 插件在管线内改写 `booktool-file://`（重挂载安全），移除 key 翻转
8. **所见即所得**：Vditor IR 完全无图片路径处理 → 相对路径按 app 源解析 404。修复：Lute 图片 DOM 为 `src`(显示)/`data-src`(真值) 分离、getValue 只读 data-src —— 安全改写 src；MutationObserver 兜底输入后重渲染；三端（书/单文件/wiki）接线 baseDir
9. 新增 `resolveFrom`（词法归一化，越界 `..` 保留）与共享 `imageSrcToUrl`（remark 预编码 → 先解码避免双重编码，中文/空格文件名可用）

验证：真实书端到端编译出 **823 页 A4 PDF**（空块/缺失图/悬空锚点各 1 警告，远程图下载成功无警告）；新增空块/非法图容错集成测试 + path/rehypeImages 单测；全仓 98/98 测试通过。

### 第八阶段：原生 HTML 支持 + 应用图标与打包（08-16，用户反馈驱动）

用户反馈：`<br/>`（换行）未被处理、超链接未正常处理；请求设计图标并打包为可安装。

**原生 HTML**（网络抓取书普遍，如 `android_view.md` 一整张嵌套 HTML 表格）：
- 新增 `mdtypst/src/html.ts`：HTML 片段 → Typst content。`<br>`→`#linebreak()`、`<wbr>/<hr>`→跳过、
  `<a href>`→`#link`（仅 http/https/mailto 可点击，相对 href 渲染文本）、`<code>`→行内代码
  （内层嵌套 `<a>` 时保留链接）、`<b>/<strong>/<i>/<em>`→强调、未知标签剥掉保留文本、实体解码
- **HTML `<table>` 块** → Typst 表格：tr/td/th 解析 + rowspan/colspan 布局（占用列跟踪），thead 转 `table.header`
- **CommonMark 拆节点坑**：`<a …>`、`</a>`、中间文本被拆成独立 mdast 节点——给 `content()` 加
  行内 HTML 开闭标签栈（开标签压栈缓冲、闭标签弹栈封装），而非按单个 html 节点处理
- 效果：用户书 174 条『不支持原生 HTML』警告清零，br/表格/链接正常，PDF 826 页

**图标与打包**（用户确认：图标 + Linux deb/AppImage）：
- 设计 `build/icon.svg`（蓝色 `#3d8bfd` 渐变圆角底 + 打开的书 + markdown 文本行），ImageMagick 转
  512/256 PNG；窗口图标（BrowserWindow icon）
- 配置 electron-builder（`electron-builder.yml`）：appId/productName/artifactName、
  `files: out/**`、extraResources 携带字体与图标（**extraResources 的 `to` 相对 `resources/`**，
  初版写成 `to: resources/fonts` 导致嵌套 `resources/resources/fonts`，修正为 `to: fonts`）
- 打包路径适配：新增 `fontsDir()`/`iconPath()` helper——开发取 `app.getAppPath()`，打包后取
  `process.resourcesPath`（extraResources 落位）
- deb 踩坑：npm 作用域名 `@booktool/desktop` 导致产物路径 `release/@booktool/…` 无法写入 →
  设 `artifactName` 与 `linux.executableName: booktool`；fpm 要求 homepage 元数据 → package.json 补
- 产出：`booktool-0.1.0-amd64.deb`（108MB）+ `booktool-0.1.0-x86_64.AppImage`（177MB），
  应用真实启动无错；deb 含 `/usr/share/applications` 菜单项与 hicolor 图标

## 验证状态（当前）

| 项 | 结果 |
|---|---|
| Vitest | 98/98（含真实 Typst 端到端 + 桌面管线集成 + mermaid 容错 + 图片解析单测） |
| 类型检查 | 三包 noEmit 全绿 |
| 构建 | electron-vite 三端全过 |
| 运行时 | 启动无错；截图目检：书籍管理页/工作区(IR 渲染)/任务管理页/菜单栏/工具栏单行 |
| 编译显示 | 底部状态栏：`✓ 编译完成 Xs · 相对路径` + 打开/预览（工具栏右侧无路径胶囊） |
| 滚动 | 长文 DOM 断言 `scrollable:true`（scrollH 16156 > clientH 833，回归修复后） |
| callout 三端 | 所见即所得 / HTML 预览 / 编译 PDF 均渲染为提醒框（HTML 预览回归修复） |
| 脚注三端 | 引用 `[1]` 方括号 + 底部区块分隔线，所见即所得 / HTML 预览一致 |
| 图片三端 | 所见即所得 / HTML 预览 / 编译 PDF 均加载本地相对路径图（booktool-file 协议） |
| 整书编译 | 188 章真实书端到端出 PDF（823 页 A4；空块/缺图/锚点降级为警告） |
| HTML 标签 | br→换行、a→链接、HTML 表格(rowspan) 均渲染；174 条『不支持原生 HTML』警告清零 |
| PDF 字体 | pdffonts 仅捆绑家族（无艺术字回退） |
| 打包 | electron-builder Linux deb + AppImage 构建通过，应用可启动；图标/字体/Typst 引擎随包，离线自包含 |

## 已知问题与待办

> 以下为已知未解决项，按影响排序（用户反馈的"其他问题"请补充于此）：

### 体验
- [x] 提示容器改为 **GitHub callout**（`> [!NOTE]`）：Vditor 3.11+ 原生渲染（preview.markdown.callout），
      HTML 预览与 Typst PDF 同步支持——三端所见即所得一致；旧的 `:::` 指令仍被预览/PDF 兼容（仅 Vditor 显示源码）
- [x] 图片**粘贴**（Ctrl+V 截图/图片）已支持：保存到 `书籍根/image/<文档名>/image_<时间戳>.png`（拖拽/对话框/粘贴共用目录）；
      历史粘贴残留的 `data:` URL 图片在编译时自动解码落盘 `build/assets`（Typst 无法读取 data URL，此前会导致编译失败）
- [x] 编译失败根因修复：`data:` URL 图片、字体回退噪音警告（unknown font family 过滤）；诊断 detail 追加生成 .typ 片段
- [x] 诊断面板：点击错误展开详细上下文（源码行 + 生成 .typ 片段 + Typst 原始块），面板高度可拖拽，默认收起、编译后不自动弹出
- [ ] Vditor IR 模式的行内格式命令（标题/列表切换）为"插入式"而非精确切换——工具栏在 IR 下对这几类不如源码模式精准（帮助弹窗已有提示）
- [ ] 实时编译在 IR 模式连续输入时频繁触发（防抖 800ms 但无编译排队去重），大书可能连续编译
- [ ] Vditor 深色主题的内容主题固定 light（编辑区深色下 IR 渲染区仍偏亮）
- [ ] 诊断跳转在 IR 模式会强制切到源码模式（IR 无行定位能力）

### 功能缺口
- [x] 应用打包分发（electron-builder：Linux deb + AppImage，图标/字体/Typst 引擎随包，离线自包含；
      「帮助→更新 Typst 引擎」下载到用户目录并优先采用——跨平台更新通道；Windows/macOS 未测试）
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
