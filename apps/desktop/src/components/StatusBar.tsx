import { useTheme } from '../theme'

export interface CompileInfo {
  compiling: boolean
  durationMs?: number
  warnings: number
  errors: number
  ok?: boolean
  /** 编译状态文本（含 Mermaid 渲染统计） */
  status?: string
  /** 相对书籍根的产物路径 */
  pdfRel?: string | null
  /** 产物绝对路径 */
  pdfPath?: string | null
}

export interface StatusBarProps {
  compileInfo?: CompileInfo
  onOpenDiagnostics?: () => void
  /** 编译完成后用系统查看器打开 PDF */
  onOpenPdf?: () => void
  /** 编译完成后在应用内预览 PDF */
  onPreviewPdf?: () => void
}

/** 状态栏（底部）：编译状态 + 产物路径 + 打开/预览；诊断计数可点击 */
export default function StatusBar({ compileInfo, onOpenDiagnostics, onOpenPdf, onPreviewPdf }: StatusBarProps) {
  void useTheme()
  const ok = compileInfo?.ok && compileInfo.pdfRel
  return (
    <footer className="statusbar">
      {compileInfo?.compiling ? (
        <span className="sb-item warn-c">⟳ 编译中…</span>
      ) : compileInfo?.durationMs != null ? (
        <span
          className={`sb-item ${compileInfo.errors > 0 ? 'err' : 'ok'}`}
          title={compileInfo.status || compileInfo.pdfPath || ''}
        >
          {compileInfo.errors > 0 ? '✗ 编译失败' : '✓ 编译完成'} {(compileInfo.durationMs / 1000).toFixed(1)}s
          {ok && <span className="sb-path"> · {compileInfo.pdfRel}</span>}
        </span>
      ) : null}
      {ok && (
        <span className="sb-item sb-actions">
          <button className="sb-btn" onClick={onOpenPdf} title={`用系统 PDF 查看器打开\n${compileInfo.pdfPath ?? ''}`}>
            打开
          </button>
          <button className="sb-btn" onClick={onPreviewPdf} title="在应用内预览 PDF">
            预览
          </button>
        </span>
      )}
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
