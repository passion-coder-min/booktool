# 排版能力

## 中英文混排

本段验证 CJK 与 Latin 的混排：使用 Noto Sans SC 与 Noto Sans 字体，西文自动缩小至 0.85em（例如 English text、数字 2026、标点 like this one）而不撑开行高。两端对齐让版面接近 LaTeX 的观感。

## 数学公式

质能方程 $E=mc^2$ 与欧拉公式 $e^{i\pi} + 1 = 0$：

$$\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$

求和极限与集合：

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}, \quad \lim_{x \to 0} \frac{\sin x}{x} = 1, \quad x \in \mathbb{R}$$

矩阵与分段函数：

$$A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}, \quad f(x) = \begin{cases} x^2 & x \geq 0 \\ -x & x < 0 \end{cases}$$

对齐环境与希腊字母：

$$\begin{aligned} \nabla \cdot \mathbf{E} &= \rho / \epsilon_0 \\ \nabla \times \mathbf{B} &= \mu_0 \mathbf{J} \end{aligned}$$

## 表格

| 特性 | mdBook | BookTool |
|---|:-:|--:|
| PDF 质量 | 一般 | 优秀 |
| 中英混排优化 | ✗ | ✓ |
| Mermaid 图表 | 插件 | 内建 |
| 数学公式 | MathJax | Typst 原生 |

## API 长标识符表格（断行与列宽回归）

| 方法 | 说明 | 值 |
|---|---|---|
| `getPollInterval()` | 获取网络统计数据的轮询间隔时间（毫秒） | 30分钟 |
| `getPollDelay()` | 获取执行轮询的延迟时间（毫秒） | `DEFAULT_PERFORM_POLL_DELAY_MS` |
| `getGlobalAlertBytes(long def)` | 获取全局网络流量警告的字节数，若未设置则返回默认值 | 传入的默认值 def |
| `getSampleEnabled()` | 获取是否启用采样功能, 主要用于上层跟踪 | true |

含不可断长 token（代码标识符/常量）的表格：列宽按 min-content 兜底分配，
超宽时在零宽断行点（下划线/驼峰边界）折行，不溢出单元格、不与相邻列重叠。

## logcat 行格式（7 列宽表缩字号）

| 日期 | 时间 | PID | TID | 级别 | 标签 | 消息 |
|---|---|---|---|---|---|---|
| 08-17 | 11:23:45.123 | 12345 | 678 | V | ActivityManager | Schedule background network policy check for uid=10123 |
| 08-17 | 11:23:46.001 | 12345 | 678 | D | NetworkPolicy | isLoggable POLICY_REJECT_METERED_BACKGROUND uid=10123 |
| 08-17 | 11:24:02.345 | 12346 | 980 | W | TrafficStats | getGlobalAlertBytes DEFAULT_PERFORM_POLL_DELAY_MS exceeded |

## 网络策略 API（HTML 表格，Android 文档抓取形态）

<table>
<tr><th>方法</th><th>说明</th><th>默认值</th></tr>
<tr><td><code>getPollInterval()</code></td><td>获取网络统计数据的轮询间隔时间（毫秒）</td><td>30分钟</td></tr>
<tr><td><code>getPollDelay()</code></td><td>获取执行轮询的延迟时间（毫秒）</td><td><code>DEFAULT_PERFORM_POLL_DELAY_MS</code></td></tr>
<tr><td><code>getGlobalAlertBytes(long def)</code></td><td>获取全局网络流量警告的字节数，若未设置则返回默认值</td><td>传入的默认值 def</td></tr>
<tr><td><code>getSampleEnabled()</code></td><td>获取是否启用采样功能, 主要用于上层跟踪</td><td>true</td></tr>
</table>

HTML 表格与 GFM 表格共用同一套列宽（min/max 加权）与 ZWSP 断行算法。

## 缺格 HTML 表格（抓取常见，验证不错位）

<table>
<tr><th>状态</th><th>number</th><th>说明</th></tr>
<tr><td>ACTIVE</td><td>ro</td></tr>
<tr><td>IDLE</td><td>42</td><td>空闲态，连接池保留 number 条</td></tr>
</table>

第 1 行缺"说明"格：应补空单元格而不是把下一行内容错位填入。

## 删除线与任务

~~旧方案已废弃~~。本周计划：

- [x] 完成编译器核心
- [x] 模板与字体
- [ ] 多版本管理

有序步骤：

1. 解析 Markdown
2. 转换 Typst
3. 编译 PDF
