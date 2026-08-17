/**
 * 表格列宽 + 断行共享算法（GFM mdast 表格与 HTML 表格两条编译路径共用）。
 *
 * 两层保障（等价 CSS `table-layout: auto` + `overflow-wrap: break-word`）：
 *
 * 1. min/max 加权列宽：权重 = max(期望宽度^0.75, 最长不可断原子宽度)。
 *    - 期望宽度 = 单元格全部内容宽度（0.75 次幂压缩，防超长列吃光整页）
 *    - 原子宽度兜底：Typst 不会在长 token（代码标识符/常量/URL）内部
 *      断行，列宽必须装得下最长原子，否则 token 溢出单元格、与相邻列
 *      重叠
 *    - 中文/全角字符渲染宽度约 2 倍拉丁，计 2 单位；行内代码（等宽
 *      字体）×1.2
 *    - 每列至少 6% 页宽，短列（序号列）不被压到不可读
 *
 * 2. ZWSP 条件断行：单元格文本里 >14 字符的原子在 `_ - / . )` 之后与
 *    小写→大写驼峰边界插入 U+200B。ZWSP 是"断行机会"而非强制断行：
 *    放得下就不折行（实测 typst 0.15.1：28 字符 token 300pt 宽盒单行
 *    不折；60pt 窄盒正常折行），杜绝溢出/重叠。
 */

export interface CellTextSeg {
  text: string
  /** 行内代码（等宽字体，宽度 ×1.2） */
  code?: boolean
}

const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/
const ZWSP = '\u{200b}'

/** 字符串渲染宽度（拉丁=1，中文/全角=2，代码 ×1.2） */
function units(s: string, code: boolean): number {
  let u = 0
  for (const ch of s) u += CJK.test(ch) ? 2 : 1
  return u * (code ? 1.2 : 1)
}

/** 把一段文本切成"不可再断行的原子"宽度列表。
 *  与 insertBreakOps 的断点规则保持一致（关键！）：空格、下划线/连字符/
 *  斜杠/点/冒号/逗号/右括号之后、驼峰边界、每 maxRun 字符兜底，都是
 *  断点。若此处只按空格分（把 persist.logd.logpersistd.rotate_kbytes
 *  当成 38 字符原子），min-content 会被撑爆 → 该列霸占整行、其它列被
 *  压到比内容还窄而溢出重叠（"number ro" 即此）。 */
function atomWidths(s: string, code: boolean): number[] {
  const out: number[] = []
  const MIN_ATOM = 4
  const MAX_RUN = 5
  for (const w of s.split(/\s+/)) {
    if (!w) continue
    let run = ''
    let runLen = 0
    for (let i = 0; i < w.length; i++) {
      const ch = w[i]!
      const next = w[i + 1] ?? ''
      if (CJK.test(ch)) {
        if (run) out.push(units(run, code))
        out.push(2 * (code ? 1.2 : 1))
        run = ''
        runLen = 0
        continue
      }
      run += ch
      runLen++
      const afterSep = '_-/.):,'.includes(ch) && /[A-Za-z0-9\u4e00-\u9fff]/.test(next)
      const camel = /[a-z0-9]/.test(ch) && /[A-Z]/.test(next)
      const upcoming = w.slice(i + 1, i + 4)
      const boundarySoon =
        /[A-Z]/.test(upcoming) || /[_\-/.):,][A-Za-z0-9\u4e00-\u9fff]/.test(upcoming)
      const shouldBreak = afterSep || camel || (runLen >= MAX_RUN && !boundarySoon)
      // 短段（<=MIN_ATOM）且即将到自然断点 → 并入下一段，避免碎片化
      if (shouldBreak && !(runLen <= MIN_ATOM && (afterSep || camel))) {
        out.push(units(run, code))
        run = ''
        runLen = 0
      }
    }
    if (run) out.push(units(run, code))
  }
  return out
}

/** 表格单元格断行激进预设：>4 字符的原子都有断行机会（自然断点优先，
 *  无边界串每 5 字符兜底），保证宽表列被极限压缩时任何 token 都能折行
 *  而不溢出重叠（CSS break-word 语义）。ZWSP 是条件断点，列宽足够时
 *  文本保持原样，无视觉影响。 */
export const TABLE_CELL_BREAK = { minAtom: 4, maxRun: 4 } as const

/** 为长原子插入零宽断行机会 U+200B（只影响可断性，不改可见文本）。
 *  opts.minAtom：参与处理的原子最短长度（默认 14）；opts.maxRun：无自然
 *  断点时兜底插入的间隔（默认 12）。
 *  兜底带前瞻：前方 3 字符内即将出现自然断点（驼峰/分隔符）时让位，
 *  只对毫无边界的连续串（如 number、随机 id）才强制切断。 */
export function insertBreakOps(s: string, opts?: { minAtom?: number; maxRun?: number }): string {
  const minAtom = opts?.minAtom ?? 14
  const maxRun = opts?.maxRun ?? 12
  return s
    .split(/(\s+)/)
    .map((atom) => {
      if (!atom || /^\s+$/.test(atom) || atom.length <= minAtom) return atom
      let out = ''
      let run = 0
      for (let i = 0; i < atom.length; i++) {
        const ch = atom[i]!
        out += ch
        run++
        const next = atom[i + 1] ?? ''
        if (!next) break
        const afterSep = '_-/.):,'.includes(ch) && /[A-Za-z0-9\u4e00-\u9fff]/.test(next)
        const camel = /[a-z0-9]/.test(ch) && /[A-Z]/.test(next)
        // 前方 3 字符内是否有即将到来的自然断点（驼峰或分隔符后随文字）
        const upcoming = atom.slice(i + 1, i + 4)
        const boundarySoon =
          /[A-Z]/.test(upcoming) || /[_\-/.):,][A-Za-z0-9\u4e00-\u9fff]/.test(upcoming)
        if (afterSep || camel || (run >= maxRun && !boundarySoon)) {
          out += ZWSP
          run = 0
        }
      }
      return out
    })
    .join('')
}

/** 由各列的单元格文本集合计算加权 fr 列宽串，如 "2.100fr, 8.500fr, …"。 */
export function weightedColumnSpec(cellsPerCol: CellTextSeg[][], colCount: number): string {
  const desired: number[] = Array.from({ length: colCount }, (): number => 0)
  const minNeed: number[] = Array.from({ length: colCount }, (): number => 0)
  cellsPerCol.forEach((cells, i) => {
    if (i >= colCount) return
    for (const seg of cells) {
      desired[i] = Math.max(desired[i], units(seg.text, seg.code === true))
      for (const a of atomWidths(seg.text, seg.code === true)) {
        minNeed[i] = Math.max(minNeed[i], a)
      }
    }
  })
  // min-content（不可断原子）是硬性下限，权重放大 1.3 让短列也获得足够宽度，
  // 避免长内容列（^0.75 压缩后仍偏大）把短列压到比内容还窄而溢出重叠
  const weights = desired.map((d, i) => Math.max(Math.pow(Math.max(d, 1), 0.75), minNeed[i] * 1.3, 1))
  const total = weights.reduce<number>((a, b) => a + b, 0)
  // 每列至少 10% 页宽（原 6% 过低，API 文档 4 列表的 type/default 短列易被压没）
  const minRatio = 0.1 * total
  return weights.map((w) => `${(Math.max(w, minRatio) / total).toFixed(3)}fr`).join(', ')
}

/** 宽表自动缩字号：列多时每列变窄，缩小字号换可读性。
 *  返回 '' 表示不需要缩。 */
export function wideTableFontSize(colCount: number): string {
  if (colCount >= 7) return '0.75em'
  if (colCount >= 5) return '0.85em'
  return ''
}
