/**
 * 日期 / ISO 周工具（主进程命名与渲染进程触发共用）。
 * ISO-8601：周一起始，含首个周四（或 1 月 4 日）的周为第 1 周。
 */

/** 本地时区 YYYY-MM-DD */
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 周一为一周开始 */
export function mondayOf(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

const DOW = ['日', '一', '二', '三', '四', '五', '六']

/** 中文星期标签，如「周二」 */
export function weekdayLabel(d: Date): string {
  return `周${DOW[d.getDay()]}`
}

export interface IsoWeek {
  /** ISO 周年（所属年的周，见 ISO-8601） */
  year: number
  /** 周号 1-53 */
  week: number
  /** 本周周一 YYYY-MM-DD */
  monday: string
  /** 本周周日 YYYY-MM-DD */
  sunday: string
}

/** 日期所在 ISO 周 */
export function isoWeekOf(d: Date): IsoWeek {
  const mon = mondayOf(d)
  const thu = new Date(mon)
  thu.setDate(thu.getDate() + 3)
  const year = thu.getFullYear()
  const jan4Mon = mondayOf(new Date(year, 0, 4))
  const week = Math.floor((thu.getTime() - jan4Mon.getTime()) / (7 * 86400000)) + 1
  const sun = new Date(mon)
  sun.setDate(sun.getDate() + 6)
  return { year, week, monday: fmtDate(mon), sunday: fmtDate(sun) }
}

/** 每周日报文件名（不含扩展名）：周一日期 + ISO 周号，如 2026-08-17-W34 */
export function weekFileName(d: Date): string {
  const { week, monday } = isoWeekOf(d)
  return `${monday}-W${String(week).padStart(2, '0')}`
}
