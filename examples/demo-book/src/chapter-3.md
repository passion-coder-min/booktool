# 图表与工作流

## 架构图（Mermaid）

```mermaid
graph LR
    A[Markdown 源文件] --> B[remark 解析]
    B --> C{包含 Mermaid?}
    C -- 是 --> D[mmdc 渲染 SVG]
    C -- 否 --> E[mdtypst 编译]
    D --> E
    E --> F[Typst 生成 PDF]
```

## 时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant E as Electron
    participant T as Typst CLI
    U->>E: 点击编译
    E->>T: typst compile
    T-->>E: book.pdf
    E-->>U: 预览 + 诊断
```

## 代码高亮（含中文注释与全角省略号）

```ts
// 编译入口：中文注释不应触发艺术字回退
const compile = async (book: Book) => {
  console.log(`编译 ${book.title} …`)
  return true
}
```

## 警告容器

:::warning
Typst 语法错误会在诊断面板显示，并映射回 Markdown 源文件行号。
:::

:::danger{title="破坏性操作"}
删除 build 目录会清空 Mermaid 缓存，首次编译将重新渲染。
:::
