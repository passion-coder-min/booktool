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

## 删除线与任务

~~旧方案已废弃~~。本周计划：

- [x] 完成编译器核心
- [x] 模板与字体
- [ ] 多版本管理

有序步骤：

1. 解析 Markdown
2. 转换 Typst
3. 编译 PDF
