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
