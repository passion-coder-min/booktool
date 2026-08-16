import type { Api } from './api-types'

declare global {
  interface Window {
    api: Api
  }
}

export const api = window.api

/** 本地绝对路径 -> 自定义协议 URL（图片/PDF 预览用） */
export const fileUrl = (absPath: string) => window.api.fileUrl(absPath)
