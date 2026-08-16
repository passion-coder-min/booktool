#!/usr/bin/env node
/**
 * 同步可重建的静态资产（不入 git，来源均为 npm 依赖）：
 * 1. vditor 离线资源  -> apps/desktop/src/public/vditor/dist/（所见即所得编辑器，约 24MB）
 * 2. 捆绑字体         -> apps/desktop/resources/fonts/（PDF 渲染确定性，约 21MB）
 * 由 pnpm install 后自动执行（postinstall），也可手动：node scripts/sync-assets.mjs
 */
import { cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkgRoot = join(root, 'node_modules', '.pnpm')

function findPkgDir(name) {
  if (!existsSync(pkgRoot)) return null
  const hit = readdirSync(pkgRoot).find((d) => d.startsWith(name.replace('/', '+') + '@'))
  return hit ? join(pkgRoot, hit, 'node_modules', name) : null
}

// 1) Vditor
const vditorDir = findPkgDir('vditor')
if (vditorDir && existsSync(join(vditorDir, 'dist'))) {
  const dest = join(root, 'apps', 'desktop', 'src', 'public', 'vditor', 'dist')
  mkdirSync(dest, { recursive: true })
  cpSync(join(vditorDir, 'dist'), dest, { recursive: true })
  console.log('[assets] vditor/dist ->', dest)
} else {
  console.warn('[assets] 未找到 vditor 依赖，跳过（pnpm install 后重试）')
}

// 2) 字体（Noto Sans SC + JetBrains Mono，400/700）
const fonts = [
  ['@expo-google-fonts/noto-sans-sc', ['400Regular/NotoSansSC_400Regular.ttf', '700Bold/NotoSansSC_700Bold.ttf']],
  ['@expo-google-fonts/jetbrains-mono', ['400Regular/JetBrainsMono_400Regular.ttf', '700Bold/JetBrainsMono_700Bold.ttf']],
]
const fontsDest = join(root, 'apps', 'desktop', 'resources', 'fonts')
mkdirSync(fontsDest, { recursive: true })
for (const [pkg, files] of fonts) {
  const dir = findPkgDir(pkg)
  if (!dir) {
    console.warn(`[assets] 未找到 ${pkg}，跳过`)
    continue
  }
  for (const f of files) {
    const src = join(dir, f)
    if (existsSync(src)) cpSync(src, join(fontsDest, f.split('/').pop()))
    else console.warn(`[assets] 缺失 ${pkg}/${f}`)
  }
}
console.log('[assets] fonts ->', fontsDest)

// 3) Typst 编译引擎（约 55MB，随安装包分发保证离线一致；缺失时才下载）
//    下载源与主进程 typst.ts 一致（GitHub + USTC 镜像），版本与 TYPST_VERSION 对齐
const TYPST_VERSION = '0.15.1'
const typstAsset = (() => {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return { file: `typst-${arch}-pc-windows-msvc.zip`, kind: 'zip', inner: `typst-${arch}-pc-windows-msvc/typst.exe`, name: 'typst.exe' }
  if (process.platform === 'darwin') return { file: `typst-${arch}-apple-darwin.tar.xz`, kind: 'tar.xz', inner: `typst-${arch}-apple-darwin/typst`, name: 'typst' }
  return { file: `typst-${arch}-unknown-linux-musl.tar.xz`, kind: 'tar.xz', inner: `typst-${arch}-unknown-linux-musl/typst`, name: 'typst' }
})()
const typstDest = join(root, 'apps', 'desktop', 'resources', 'typst')
const typstBin = join(typstDest, typstAsset.name)
if (existsSync(typstBin) && !process.env.BOOKTOOL_FORCE_TYPST) {
  console.log('[assets] typst 已存在 ->', typstBin)
} else {
  mkdirSync(typstDest, { recursive: true })
  const urls = [
    `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/${typstAsset.file}`,
    `https://mirrors.ustc.edu.cn/github-release/typst/typst/LatestRelease/${typstAsset.file}`,
  ]
  const { createWriteStream, rmSync, renameSync, chmodSync } = await import('node:fs')
  const { pipeline } = await import('node:stream/promises')
  const { Readable } = await import('node:stream')
  const { spawnSync } = await import('node:child_process')
  const dl = join(typstDest, 'dl')
  mkdirSync(dl, { recursive: true })
  const archive = join(dl, typstAsset.file)
  let lastErr = '未知错误'
  let ok = false
  for (let k = 0; k < urls.length; k++) {
    try {
      console.log(`[assets] 下载 Typst v${TYPST_VERSION}（源 ${k + 1}/${urls.length}）…`)
      const res = await fetch(urls[k], { redirect: 'follow' })
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status)
      await pipeline(Readable.fromWeb(res.body), createWriteStream(archive))
      const verifyArgs = typstAsset.kind === 'zip' ? ['-tf', archive] : ['-tJf', archive]
      const vr = spawnSync('tar', verifyArgs, { encoding: 'utf8', timeout: 60000 })
      if (vr.status !== 0) throw new Error('归档校验失败')
      ok = true
      break
    } catch (e) {
      lastErr = String(e)
      try { rmSync(archive, { force: true }) } catch { /* 忽略 */ }
    }
  }
  if (!ok) throw new Error(`[assets] 下载 Typst 失败：${lastErr}`)
  const extArgs = typstAsset.kind === 'zip' ? ['-xf', archive, '-C', dl] : ['-xJf', archive, '-C', dl]
  const xr = spawnSync('tar', extArgs, { encoding: 'utf8', timeout: 120000 })
  if (xr.status !== 0) throw new Error('[assets] 解压 Typst 失败：' + xr.stderr)
  const extracted = join(dl, typstAsset.inner)
  if (!existsSync(extracted)) throw new Error('[assets] 归档中未找到 ' + typstAsset.inner)
  renameSync(extracted, typstBin)
  chmodSync(typstBin, 0o755)
  try { rmSync(dl, { recursive: true, force: true }) } catch { /* 忽略 */ }
  console.log('[assets] typst ->', typstBin)
}
