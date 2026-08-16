import { resolveFrom } from '../path'

/** 无需改写的图片 src 前缀（远程 / 内联 / 已是本应用协议），Vditor IR 图片改写同样使用 */
export const EXTERNAL_SRC = /^(https?:|data:|blob:|booktool-file:|file:)/i

export interface RehypeImagesOptions {
  /** 图片相对路径的基准绝对目录 */
  baseDir: string
  /** 绝对路径 -> 可加载 URL（注入以保持模块可在 node 测试） */
  toUrl: (absPath: string) => string
}

/**
 * 单个图片 src -> 基于 baseDir 的协议 URL。
 * 返回 null 表示无需改写（远程/内联/本应用协议）。
 * remark/lute 解析时可能已对 URL 百分号编码，先解码避免双重编码
 * （非法编码序列解码失败则保留原值）。
 */
export function imageSrcToUrl(baseDir: string, src: string, toUrl: (absPath: string) => string): string | null {
  if (src === '' || EXTERNAL_SRC.test(src)) return null
  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    /* 保留原值 */
  }
  return toUrl(resolveFrom(baseDir, decoded))
}

/**
 * rehype 插件：把 markdown 中的相对图片路径改写为基于 baseDir 的
 * 自定义协议 URL（booktool-file://）。在 unified 管线内完成，
 * 与 DOM 后处理不同，重挂载/重渲染不会丢失改写结果。
 */
export default function rehypeImages(opts: RehypeImagesOptions) {
  const { baseDir, toUrl } = opts
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'element' && node.tagName === 'img') {
        const src = node.properties?.src
        if (typeof src === 'string') {
          const target = imageSrcToUrl(baseDir, src, toUrl)
          if (target !== null) node.properties.src = target
        }
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}
