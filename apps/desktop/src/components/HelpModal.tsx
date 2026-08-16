import { useState } from 'react'

const SHORTCUTS: [string, string][] = [
  ['Ctrl+1 ~ Ctrl+6', '一~六级标题（再按取消）'],
  ['Ctrl+0', '恢复正文'],
  ['Ctrl+B / Ctrl+I', '加粗 / 斜体'],
  ['Ctrl+K', '插入链接'],
  ['Ctrl+T', '插入表格（可选行列）'],
  ['Ctrl+Shift+K', '插入代码块'],
  ['Ctrl+Shift+I', '插入图片'],
  ['Ctrl+M', '行内公式'],
  ['Ctrl+Shift+M', '块级公式'],
  ['Ctrl+Shift+B', '插入警告框'],
  ['Ctrl+Shift+U / Ctrl+Shift+O', '无序 / 有序列表'],
  ['Ctrl+Shift+T', '任务列表'],
  ['Ctrl+Shift+D', '分割线'],
  ['Ctrl+Shift+F', '脚注'],
  ['Ctrl+S', '保存并编译'],
  ['Ctrl+Shift+E', '导出 PDF（编译并打开）'],
  ['Ctrl+E', '切换编辑模式（所见即所得 ↔ 源码）'],
  ['Ctrl+P', '切换预览（HTML ↔ PDF）'],
  ['Ctrl+\\', '循环布局（源码模式；所见即所得默认仅编辑铺满，可点「◫ 预览」并排显示）'],
  ['Ctrl+Shift+L', '切换浅色 / 深色主题'],
  ['F8 / Shift+F8', '下一个 / 上一个诊断'],
  ['Ctrl+N', '新建（章节 / 任务）'],
  ['Ctrl+V 粘贴图片', '截图/图片直接粘贴 = 存入 image/<文档名>/ 并插入引用'],
  ['拖拽图片', '拖入编辑区 = 复制到 image/<文档名>/ 并插入引用'],
]

/** 语法支持矩阵：w=所见即所得，h=HTML 预览，p=编译 PDF */
interface SyntaxRow {
  syntax: string
  desc: string
  w: boolean
  h: boolean
  p: boolean
}

const SYNTAX: SyntaxRow[] = [
  { syntax: '# 1~6 级标题', desc: '标题层级', w: true, h: true, p: true },
  { syntax: '- 列表 / 1. 有序 / - [ ] 任务', desc: '列表与任务清单', w: true, h: true, p: true },
  { syntax: '| 列1 | 列2 |', desc: '表格', w: true, h: true, p: true },
  { syntax: '`代码` / ```语言 代码块', desc: '行内 / 块级代码', w: true, h: true, p: true },
  { syntax: '[文字](url) / ![题注](路径)', desc: '链接 / 图片', w: true, h: true, p: true },
  { syntax: '> 引用', desc: '引用块', w: true, h: true, p: true },
  { syntax: '~~删除线~~', desc: '删除线', w: true, h: true, p: true },
  { syntax: '$E=mc^2$ / $$块级公式$$', desc: '数学公式（LaTeX 语法）', w: true, h: true, p: true },
  { syntax: '> [!NOTE/TIP/WARNING/CAUTION]', desc: 'GitHub 提醒框（三端一致，推荐）', w: true, h: true, p: true },
  { syntax: '```mermaid 图表', desc: 'Mermaid 图（流程图/时序/甘特等）', w: true, h: true, p: true },
  { syntax: ':::tip{title="…"} 内容 :::', desc: '指令容器（仅预览 / PDF 生效）', w: false, h: true, p: true },
]

function Cell({ on }: { on: boolean }) {
  return <span className={`syn-check${on ? ' on' : ' off'}`}>{on ? '✓' : '—'}</span>
}

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'shortcuts' | 'syntax'>('shortcuts')
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-tabs">
          <button className={tab === 'shortcuts' ? 'active' : ''} onClick={() => setTab('shortcuts')}>
            ⌨ 快捷键
          </button>
          <button className={tab === 'syntax' ? 'active' : ''} onClick={() => setTab('syntax')}>
            📖 语法支持
          </button>
        </div>

        {tab === 'shortcuts' ? (
          <>
            <h2>快捷键</h2>
            <div className="shortcut-grid">
              {SHORTCUTS.map(([key, desc]) => (
                <div className="sc-row" key={key}>
                  <span>{desc}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p className="help-hint">
              提示：标题/列表等行前缀类命令在源码模式下可精确切换；所见即所得模式下建议使用工具栏按钮。
            </p>
          </>
        ) : (
          <>
            <h2>支持的语法</h2>
            <table className="syn-table">
              <thead>
                <tr>
                  <th>语法</th>
                  <th>说明</th>
                  <th title="所见即所得编辑器（Vditor）">所见即所得</th>
                  <th title="右侧 HTML 预览">HTML 预览</th>
                  <th title="编译生成的 PDF">编译 PDF</th>
                </tr>
              </thead>
              <tbody>
                {SYNTAX.map((s, i) => (
                  <tr key={i}>
                    <td className="syn-code">{s.syntax}</td>
                    <td>{s.desc}</td>
                    <td className="syn-cell">
                      <Cell on={s.w} />
                    </td>
                    <td className="syn-cell">
                      <Cell on={s.h} />
                    </td>
                    <td className="syn-cell">
                      <Cell on={s.p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="syn-note">
              <div className="syn-note-title">⚠️ 关于指令容器「:::」</div>
              <p>
                形如 <code>::::tip{'{title="30 秒上手"}'} 内容 ::::</code> 的指令容器只在
                <b> HTML 预览</b> 与 <b> 编译 PDF</b> 中渲染为提示框；所见即所得编辑器（Vditor）不识别该语法，
                会把 <code>:::</code> 显示为源码。若需要三端所见即所得表现一致，请改用
                <b> GitHub callout</b>：<code>&gt; [!TIP] 标题</code>。
              </p>
            </div>
          </>
        )}

        <button className="primary close-btn" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
