import type { WorkspaceInfo } from '@booktool/shared'
import { api } from '../api'
import { useTheme } from '../theme'

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
}

export default function SettingsPage({ workspace, onChanged }: Props) {
  const { theme, toggle } = useTheme()

  return (
    <div className="content-area">
      <div className="settings-page">
        <h2>外观</h2>
        <div className="row">
          <span>主题</span>
          <button className="primary" onClick={toggle}>
            切换到{theme === 'light' ? '深色' : '浅色'}（Ctrl+Shift+L）
          </button>
          <span className="desc">当前：{theme === 'light' ? '浅色' : '深色'}（预览区始终保持纸张白）</span>
        </div>

        <h2>工作区</h2>
        <div className="row">
          <span>路径</span>
          <code style={{ fontSize: 12.5 }}>{workspace?.root ?? '-'}</code>
        </div>
        <div className="row">
          <span>切换</span>
          <button
            className="ghost"
            onClick={() => void api.workspace.chooseRoot().then((w) => w && onChanged())}
          >
            选择其他目录…
          </button>
          <span className="desc">结构：books/（书籍）+ projects/（项目：wiki + tasks）</span>
        </div>
        <div className="row">
          <span>示例</span>
          <button className="ghost" onClick={() => void api.workspace.initDemo().then(() => location.reload())}>
            重新初始化示例内容
          </button>
          <span className="desc">仅当对应示例不存在时写入，不会覆盖已有内容</span>
        </div>

        <h2>编译器</h2>
        <div className="row">
          <span>Typst</span>
          <span className="desc">
            系统未安装时自动下载 v0.15.1；国内可用环境变量 <code>BOOKTOOL_TYPST_MIRRORS</code> 指定镜像（默认已含
            USTC）
          </span>
        </div>
        <div className="row">
          <span>Mermaid</span>
          <span className="desc">
            需要系统 <code>mmdc</code>（npm i -g @mermaid-js/mermaid-cli）；也可用 <code>BOOKTOOL_MMDC</code> 指定路径
          </span>
        </div>
        <div className="row">
          <span>字体</span>
          <span className="desc">
            PDF 内置 Noto Sans SC 400/700 + JetBrains Mono（resources/fonts），跨机器一致；中文强调使用半粗体而非斜体
          </span>
        </div>

        <h2>快捷键</h2>
        <div className="row">
          <span className="desc">
            Ctrl+/ 打开完整快捷键列表。标题 Ctrl+1~6、表格 Ctrl+T、代码块 Ctrl+Shift+K、图片 Ctrl+Shift+I、公式
            Ctrl+M/Ctrl+Shift+M、警告框 Ctrl+Shift+B、列表 Ctrl+Shift+U/O/T、分割线 Ctrl+Shift+D、脚注 Ctrl+Shift+F
          </span>
        </div>
      </div>
    </div>
  )
}
