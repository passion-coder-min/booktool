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
  ['Ctrl+\\', '循环布局（拆分 → 仅编辑 → 仅预览）'],
  ['Ctrl+Shift+L', '切换浅色 / 深色主题'],
  ['F8 / Shift+F8', '下一个 / 上一个诊断'],
  ['Ctrl+N', '新建（章节 / 任务）'],
  ['拖拽图片', '拖入编辑区 = 复制到 assets/ 并插入引用'],
]

export default function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>⌨ 快捷键</h2>
        <div className="shortcut-grid">
          {SHORTCUTS.map(([key, desc]) => (
            <div className="sc-row" key={key}>
              <span>{desc}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
          提示：标题/列表等行前缀类命令在源码模式下可精确切换；所见即所得模式下建议使用工具栏按钮。
        </p>
        <button className="primary close-btn" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
