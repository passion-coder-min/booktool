import { useEffect, useState } from 'react'
import type { WorkspaceInfo } from '@booktool/shared'
import { api } from '../api'
import { useTheme } from '../theme'

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
}

export default function SettingsPage({ workspace, onChanged }: Props) {
  const { theme, toggle } = useTheme()
  const [mirrorsText, setMirrorsText] = useState('')
  const [savedTip, setSavedTip] = useState(false)

  useEffect(() => {
    void api.config.get().then((cfg) => setMirrorsText((cfg.typstMirrors ?? []).join('\n')))
  }, [])

  const saveMirrors = async () => {
    const list = mirrorsText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
    await api.config.set({ typstMirrors: list })
    setSavedTip(true)
    setTimeout(() => setSavedTip(false), 2500)
  }

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
            未内置/系统未安装时自动下载 v0.15.1；官方 GitHub 优先，第三方镜像按下列顺序尝试。
            已内置随包引擎，离线可直接编译；「帮助 → 更新 Typst 引擎」走同一套镜像更新。
          </span>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span>Typst 镜像</span>
          <div style={{ flex: 1 }}>
            <textarea
              value={mirrorsText}
              onChange={(e) => setMirrorsText(e.target.value)}
              rows={3}
              placeholder={'每行一个镜像根 URL（官方 GitHub 始终优先）\nhttps://mirrors.ustc.edu.cn/github-release/typst/typst/LatestRelease'}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            />
            <div style={{ marginTop: 6 }}>
              <button className="small" onClick={() => void saveMirrors()}>
                保存镜像
              </button>
              {savedTip && (
                <span style={{ marginLeft: 8, color: 'var(--ok)', fontSize: 12.5 }}>✓ 已保存</span>
              )}
            </div>
          </div>
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
