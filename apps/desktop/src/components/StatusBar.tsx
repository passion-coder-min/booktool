import { useTheme } from '../theme'

export interface StatusBarProps {
  compileInfo?: { compiling: boolean; durationMs?: number; warnings: number; errors: number }
  onOpenDiagnostics?: () => void
}

/** 精简状态栏：只显示保存/编译状态；版本、快捷键、主题等在菜单栏与设置页 */
export default function StatusBar({ compileInfo, onOpenDiagnostics }: StatusBarProps) {
  void useTheme()
  return (
    <footer className="statusbar">
      {compileInfo?.compiling ? (
        <span className="sb-item warn-c">⟳ 编译中…</span>
      ) : compileInfo?.durationMs != null ? (
        <span className={`sb-item ${compileInfo.errors > 0 ? 'err' : 'ok'}`}>
          {compileInfo.errors > 0 ? '✗ 编译失败' : '✓ 编译完成'} {(compileInfo.durationMs / 1000).toFixed(1)}s
        </span>
      ) : null}
      {compileInfo && (compileInfo.errors > 0 || compileInfo.warnings > 0) && (
        <span className="sb-item clickable" onClick={onOpenDiagnostics}>
          {compileInfo.errors > 0 && <span className="err">✗ {compileInfo.errors}</span>}
          {compileInfo.warnings > 0 && <span className="warn-c">⚠ {compileInfo.warnings}</span>}
          <span style={{ opacity: 0.7 }}>诊断</span>
        </span>
      )}
      <span className="spacer" />
    </footer>
  )
}
