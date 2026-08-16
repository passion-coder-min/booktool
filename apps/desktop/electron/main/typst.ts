import { app } from 'electron'
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

export const TYPST_VERSION = '0.15.1'
const MIN_VERSION = 13

/** 捆绑字体目录：开发时在应用根 resources/fonts，打包后经 extraResources 落到 resourcesPath */
export function fontsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'fonts')
    : join(app.getAppPath(), 'resources', 'fonts')
}

/** 应用图标路径：窗口/任务栏图标，打包后经 extraResources 落到 resourcesPath */
export function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

let cachedPath: string | null = null

/** 确保 Typst CLI 可用：优先系统 PATH，其次应用数据目录的自动下载版本 */
export async function ensureTypst(onProgress?: (msg: string) => void): Promise<string> {
  if (cachedPath) return cachedPath

  // 1) 系统 PATH
  const sys = spawnSync('typst', ['--version'], { encoding: 'utf8', timeout: 5000 })
  if (sys.status === 0) {
    const v = parseVersion(sys.stdout)
    if (v !== null && v >= MIN_VERSION) {
      cachedPath = 'typst'
      return cachedPath
    }
  }

  // 2) 已下载的本地版本
  const local = localTypstPath()
  if (existsSync(local)) {
    const res = spawnSync(local, ['--version'], { encoding: 'utf8', timeout: 5000 })
    if (res.status === 0) {
      cachedPath = local
      return local
    }
  }

  // 3) 下载（GitHub 直连 -> 国内镜像依次尝试，校验归档完整性）
  await downloadTypst(local, onProgress)
  cachedPath = local
  return local
}

function localTypstPath(): string {
  const dir = join(app.getPath('userData'), 'binaries')
  mkdirSync(dir, { recursive: true })
  return join(dir, process.platform === 'win32' ? 'typst.exe' : 'typst')
}

function parseVersion(out: string): number | null {
  const m = out.match(/typst\s+(\d+)\./)
  return m ? Number(m[1]) : null
}

interface ReleaseAsset {
  /** GitHub Release 资产文件名 */
  file: string
  archive: 'zip' | 'tar.xz'
  /** 解压后归档内二进制的相对路径 */
  inner: string
}

function releaseAsset(): ReleaseAsset {
  const base = 'typst'
  if (process.platform === 'win32') {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    return { file: `${base}-${arch}-pc-windows-msvc.zip`, archive: 'zip', inner: `typst-${arch}-pc-windows-msvc/typst.exe` }
  }
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    return { file: `${base}-${arch}-apple-darwin.tar.xz`, archive: 'tar.xz', inner: `typst-${arch}-apple-darwin/typst` }
  }
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  return { file: `${base}-${arch}-unknown-linux-musl.tar.xz`, archive: 'tar.xz', inner: `typst-${arch}-unknown-linux-musl/typst` }
}

/**
 * 下载源列表：GitHub 直连 + 国内镜像（USTC 等）。
 * LatestRelease 目录与版本目录内容一致，避免依赖带日期的目录名。
 */
function downloadUrls(asset: ReleaseAsset): string[] {
  const urls = [
    `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/${asset.file}`,
  ]
  const mirrors = (process.env.BOOKTOOL_TYPST_MIRRORS ??
    'https://mirrors.ustc.edu.cn/github-release/typst/typst/LatestRelease')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const m of mirrors) urls.push(`${m}/${asset.file}`)
  return urls
}

async function downloadTypst(dest: string, onProgress?: (msg: string) => void): Promise<void> {
  const asset = releaseAsset()
  const tmpDir = join(app.getPath('userData'), 'binaries', 'dl')
  mkdirSync(tmpDir, { recursive: true })
  const archivePath = join(tmpDir, asset.archive === 'zip' ? 'typst.zip' : 'typst.tar.xz')

  const urls = downloadUrls(asset)
  let lastErr: unknown = null
  for (let k = 0; k < urls.length; k++) {
    const url = urls[k]
    try {
      onProgress?.(`下载 Typst v${TYPST_VERSION}（源 ${k + 1}/${urls.length}）…`)
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(archivePath))
      if (!verifyArchive(archivePath, asset.archive)) throw new Error('归档校验失败')
      break
    } catch (err) {
      lastErr = err
      unlinkSyncQuiet(archivePath)
    }
  }
  if (existsSync(archivePath) === false) {
    throw new Error(`下载 Typst 失败（已尝试 ${urls.length} 个源）：${String(lastErr)}`)
  }

  onProgress?.('解压 Typst …')
  extractArchive(archivePath, tmpDir, asset)
  const extracted = join(tmpDir, asset.inner)
  if (!existsSync(extracted)) throw new Error(`归档中未找到 ${asset.inner}`)
  const { renameSync, copyFileSync } = await import('node:fs')
  try {
    renameSync(extracted, dest)
  } catch {
    copyFileSync(extracted, dest)
    unlinkSync(extracted)
  }
  chmodSync(dest, 0o755)
  unlinkSyncQuiet(archivePath)

  const check = spawnSync(dest, ['--version'], { encoding: 'utf8', timeout: 10_000 })
  if (check.status !== 0) throw new Error('Typst 二进制校验失败：' + (check.stderr || ''))
}

/** 校验归档完整性：zip 用 tar -tf（bsdtar 兼容 zip），tar.xz 用 tar -tJf */
function verifyArchive(file: string, kind: 'zip' | 'tar.xz'): boolean {
  const args = kind === 'zip' ? ['-tf', file] : ['-tJf', file]
  const r = spawnSync('tar', args, { encoding: 'utf8', timeout: 60_000 })
  if (r.status === 0) return true
  // Windows 无 tar 时跳过校验（PowerShell 也可用 tar；新系统自带）
  return process.platform === 'win32'
}

function extractArchive(archivePath: string, destDir: string, asset: ReleaseAsset): void {
  if (asset.archive === 'zip') {
    const r = spawnSync('tar', ['-xf', archivePath, '-C', destDir], { encoding: 'utf8', timeout: 120_000 })
    if (r.status !== 0) throw new Error('解压 Typst 失败：' + r.stderr)
  } else {
    const r = spawnSync('tar', ['-xJf', archivePath, '-C', destDir], { encoding: 'utf8', timeout: 120_000 })
    if (r.status !== 0) throw new Error('解压 Typst 失败：' + r.stderr)
  }
}

function unlinkSyncQuiet(file: string): void {
  try {
    if (existsSync(file)) unlinkSync(file)
  } catch {
    /* 忽略 */
  }
}

/** 运行 typst 命令（Promise 形式） */
export function runTypst(
  typstPath: string,
  args: string[],
  cwd: string,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(typstPath, args, { cwd })
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    p.on('close', (status) => resolve({ status: status ?? -1, stdout, stderr }))
    p.on('error', (err) => resolve({ status: -1, stdout, stderr: String(err) }))
  })
}
