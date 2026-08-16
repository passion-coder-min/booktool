import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { AppConfig } from '@booktool/shared'

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function readConfig(): AppConfig {
  try {
    const raw = readFileSync(configPath(), 'utf8')
    const obj = JSON.parse(raw) as AppConfig
    return typeof obj === 'object' && obj !== null ? obj : {}
  } catch {
    return {}
  }
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const cfg = { ...readConfig(), ...patch }
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(cfg, null, 2))
  return cfg
}

/** 生效的 Typst 镜像列表：配置优先，其次环境变量，缺省 USTC */
export function typstMirrorBases(): string[] {
  const fromConfig = (readConfig().typstMirrors ?? []).map((s) => s.trim()).filter(Boolean)
  if (fromConfig.length) return fromConfig
  const fromEnv = (process.env.BOOKTOOL_TYPST_MIRRORS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromEnv.length) return fromEnv
  return ['https://mirrors.ustc.edu.cn/github-release/typst/typst/LatestRelease']
}
