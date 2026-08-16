/**
 * LaTeX 数学语法 → Typst 数学语法转换器。
 *
 * 策略：符号命令映射到 Typst 原生符号名（渲染质量最好）；
 * 不确定的名字一律使用 Unicode 字符（Typst 数学接受任意 Unicode），
 * 未识别的命令保留原样并记录 warning，由编译报告呈现给用户。
 */

/** 单符号命令 → Typst 表示 */
const SYMBOLS: Record<string, string> = {
  // 希腊字母
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta',
  epsilon: 'epsilon', varepsilon: 'epsilon.alt', zeta: 'zeta', eta: 'eta',
  theta: 'theta', vartheta: 'theta.alt', iota: 'iota', kappa: 'kappa',
  lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi', pi: 'pi', varpi: 'pi.alt',
  rho: 'rho', varrho: 'rho.alt', sigma: 'sigma', varsigma: 'sigma.alt',
  tau: 'tau', upsilon: 'upsilon', phi: 'phi', varphi: 'phi.alt', chi: 'chi',
  psi: 'psi', omega: 'omega',
  Gamma: 'Gamma', Delta: 'Delta', Theta: 'Theta', Lambda: 'Lambda', Xi: 'Xi',
  Pi: 'Pi', Sigma: 'Sigma', Upsilon: 'Upsilon', Phi: 'Phi', Psi: 'Psi',
  Omega: 'Omega',
  // 关系与算子
  leq: '<=', le: '<=', geq: '>=', ge: '>=', neq: '!=', ne: '!=',
  approx: 'approx', equiv: 'equiv', sim: 'tilde.op', simeq: 'tilde.equiv',
  propto: 'prop', ll: '<<', gg: '>>', pm: 'plus.minus', mp: 'minus.plus',
  times: 'times', div: 'div', cdot: 'dot.op', ast: 'ast',
  sum: 'sum', prod: 'product', coprod: 'coprod', int: 'integral',
  iint: 'integral', iiint: 'integral', oint: 'contour.integral',
  infty: 'infinity', partial: 'diff', nabla: 'nabla',
  in: 'in', notin: 'not.in', ni: 'ni',
  subset: 'subset', subseteq: 'subset.eq', supset: 'supset',
  supseteq: 'supset.eq', nsubseteq: 'subset.neq',
  cup: 'union', cap: 'intersect', emptyset: '∅', varnothing: '∅',
  forall: 'forall', exists: 'exists', nexists: 'not.exists',
  land: 'and', wedge: 'and', lor: 'or', vee: 'or', neg: 'not', lnot: 'not',
  to: '->', rightarrow: '->', longrightarrow: '-->',
  leftarrow: '<-', longleftarrow: '<--',
  Rightarrow: '=>', Longrightarrow: '==>', implies: '==>',
  Leftarrow: '<==', Leftrightarrow: '<=>', leftrightarrow: '<->',
  mapsto: '|->', longmapsto: '|-->',
  uparrow: 'up.arrow', downarrow: 'down.arrow', updownarrow: 'up.down.arrow',
  // 常用函数名（Typst 内建）
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
  arcsin: 'arcsin', arccos: 'arccos', arctan: 'arctan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  log: 'log', ln: 'ln', lg: 'log', exp: 'exp', lim: 'lim',
  max: 'max', min: 'min', sup: 'sup', inf: 'inf', det: 'det', arg: 'arg',
  gcd: 'gcd', degree: 'degree',
  // 杂项符号（Unicode 兜底，渲染稳妥）
  oplus: '⊕', ominus: '⊖', otimes: '⊗', oslash: '⊘', odot: '⊙',
  circ: '∘', bullet: '•', star: '⋆', diamond: '⋄',
  perp: '⊥', parallel: '∥',
  ldots: '…', dots: '…', cdots: '…', hdots: '…', vdots: '⋮', ddots: '⋱',
  langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉',
  lfloor: '⌊', rfloor: '⌋',
  vert: '|', Vert: '‖', mid: '|',
  hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wp: '℘',
  quad: 'quad', qquad: 'quad quad',
  ',': ',', ';': ';', ':': ':', '!': '', ' ': ' ',
}

/** 双字母黑板粗体（Typst 内建 RNZQC，其余用 Unicode） */
const BLACKBOARD: Record<string, string> = {
  R: 'RR', N: 'NN', Z: 'ZZ', Q: 'QQ', C: 'CC', E: 'EE',
  P: 'ℙ', H: 'ℍ', A: '𝔸', B: '𝔹', D: '𝔻', F: '𝔽',
}

/** 分隔符环境 → mat 的 delim 参数 */
const MATRIX_ENVS: Record<string, string> = {
  matrix: 'none',
  pmatrix: '(',
  bmatrix: '[',
  Bmatrix: '{',
  vmatrix: '|',
  Vmatrix: '‖',
  smallmatrix: 'none',
}

/** \not 可组合的后续命令 */
const NOT_COMBINABLE = new Set(['in', 'exists', 'subset', 'subseteq', 'ni'])

/** 忽略的修饰命令 */
const IGNORED = new Set([
  'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'relax',
  'bigr', 'Bigr', 'biggr', 'bigl', 'Bigl', 'biggl', 'big', 'Big',
])

export interface MathConvertResult {
  typst: string
  warnings: string[]
}

/**
 * 相邻 token 是否需要空格分隔。
 * Typst 数学中多字母序列（如 `mc`）是未知标识符，必须拆为 `m c`（乘积）；
 * 数字内部（含小数点）不拆分；数字后跟字母 typst 自行切分，无需空格。
 */
function needsSpace(left: string, right: string): boolean {
  return /[A-Za-z)]$/.test(left) && /^[A-Za-z0-9]/.test(right)
}

class Converter {
  private src: string
  private i = 0
  private warns = new Set<string>()

  constructor(src: string) {
    this.src = src
  }

  convert(): string {
    return this.sequence(false).trim()
  }

  warnings(): string[] {
    return [...this.warns]
  }

  private warn(cmd: string) {
    this.warns.add(`未识别的 LaTeX 命令：\\${cmd}`)
  }

  /** 转换直到遇到 `}`（stopAtBrace 时消费它）或结尾 */
  private sequence(stopAtBrace: boolean): string {
    let out = ''
    while (this.i < this.src.length) {
      const c = this.src[this.i]
      if (c === '}') {
        if (stopAtBrace) {
          this.i++
          return out
        }
        this.i++ // 游离的右括号：跳过
        continue
      }
      if (c === '{') {
        this.i++
        const inner = this.sequence(true)
        out += this.wrapGroup(inner)
        continue
      }
      if (c === '^' || c === '_') {
        out = this.scripts(out)
        continue
      }
      if (c === '\\') {
        const r = this.command()
        if (needsSpace(out, r)) out += ' '
        out += r
        continue
      }
      if (c === '&' || c === '~') {
        out += ' '
        this.i++
        continue
      }
      this.i++
      // 相邻标识符拆分（Typst 数学无多字母隐式乘积）
      if (needsSpace(out, c)) out += ' '
      out += c
    }
    return out
  }

  /**
   * 处理连续的 ^/_ 脚本，返回新的完整尾部（可能吞并 out 的最后一个原子）。
   * 全部单 token → `x_1^2` 直接连写；
   * 含多 token → attach(base, t: …, b: …)，不产生可视括号。
   */
  private scripts(out: string): string {
    const parts: { op: '^' | '_'; arg: string }[] = []
    while (this.src[this.i] === '^' || this.src[this.i] === '_') {
      const op = this.src[this.i] as '^' | '_'
      this.i++
      parts.push({ op, arg: this.scriptArg() })
    }
    if (parts.every((p) => isSingleToken(p.arg))) {
      return out + parts.map((p) => p.op + p.arg).join('')
    }
    const trimmed = out.replace(/\s+$/, '')
    const m = trimmed.match(/(\S+)$/)
    const base = m ? m[1] : ''
    const prefix = m ? trimmed.slice(0, trimmed.length - base.length) : trimmed
    const args = parts.map((p) => `${p.op === '^' ? 't' : 'b'}: ${p.arg}`).join(', ')
    return `${prefix}attach(${base}, ${args})`
  }

  /** `^`/`_` 的单个参数（已转换；花括号仅用于分组） */
  private scriptArg(): string {
    if (this.i >= this.src.length) return ''
    const c = this.src[this.i]
    if (c === '{') {
      this.i++
      return this.sequence(true).trim()
    }
    if (c === '\\') return this.command()
    this.i++
    return c
  }

  /**
   * LaTeX 花括号是隐形分组；Typst 中需要可视括号保持结合性时才补 `( )`。
   * 单 token（字母/数字/单一符号）直接透出。
   */
  private wrapGroup(inner: string): string {
    if (isSingleToken(inner)) return inner
    return `(${inner})`
  }

  /** 解析一个 `\command`，返回 Typst 片段 */
  private command(): string {
    this.i++ // 跳过 \
    const c = this.src[this.i]
    // \+单个非字母（如 \, \; \\ \{ \}）
    if (c !== undefined && !/[a-zA-Z]/.test(c)) {
      this.i++
      switch (c) {
        case '\\': return ' ' // LaTeX 强制换行；Typst 中以空格近似
        case '{': case '}': case '|': case ' ':
        case '%': case '&': case '#': case '$': case '_':
          return c
        default:
          return c
      }
    }
    const m = this.src.slice(this.i).match(/^[a-zA-Z]+/)
    if (!m) return ''
    const name = m[0]
    this.i += name.length

    if (name === 'begin') return this.environment()
    if (name === 'end') {
      this.skipBraceArg()
      return ''
    }
    if (IGNORED.has(name)) return ''
    if (name === 'left' || name === 'right') {
      if (this.src[this.i] === '.') this.i++ // \left. / \right. 隐形定界符
      return ''
    }

    switch (name) {
      case 'not': {
        const rest = this.src.slice(this.i).match(/^\\([a-zA-Z]+)/)
        if (rest && NOT_COMBINABLE.has(rest[1])) {
          this.i += rest[0].length
          return 'not.' + rest[1]
        }
        return 'not'
      }
      case 'frac': case 'dfrac': case 'tfrac': case 'cfrac': {
        const a = this.braceArgOrToken()
        const b = this.braceArgOrToken()
        // 双侧单 token 用 `/`（渲染紧凑）；任一侧多 token 用 frac() 避免优先级歧义
        if (isSingleToken(a) && isSingleToken(b)) return `${a}/${b}`
        return `frac(${a}, ${b})`
      }
      case 'binom': case 'dbinom': case 'tbinom': {
        const a = this.braceArgOrToken()
        const b = this.braceArgOrToken()
        return `binom(${a}, ${b})`
      }
      case 'sqrt': {
        const [opt] = this.tryOptionalArg()
        const a = this.braceArgOrToken()
        return opt !== null ? `root(${opt}, ${a})` : `sqrt(${a})`
      }
      case 'hat': case 'widehat': return `hat(${this.braceArgOrToken()})`
      case 'tilde': case 'widetilde': return `tilde(${this.braceArgOrToken()})`
      case 'bar': case 'overline': return `overline(${this.braceArgOrToken()})`
      case 'underline': return `underline(${this.braceArgOrToken()})`
      case 'vec': return `arrow(${this.braceArgOrToken()})`
      case 'dot': return `dot(${this.braceArgOrToken()})`
      case 'ddot': return `dot.double(${this.braceArgOrToken()})`
      case 'overbrace': return `overbrace(${this.braceArgOrToken()})`
      case 'underbrace': return `underbrace(${this.braceArgOrToken()})`
      case 'text': case 'textrm': case 'mathrm': case 'operatorname': case 'mbox': {
        const a = this.braceArgRaw()
        return `"${a.replace(/"/g, "'")}"`
      }
      case 'textbf': case 'mathbf': case 'bm': case 'boldsymbol':
        return `bold(${this.braceArgOrToken()})`
      case 'textit': case 'mathit': return `italic(${this.braceArgOrToken()})`
      case 'mathcal': case 'cal': return `cal(${this.braceArgOrToken()})`
      case 'mathfrak': case 'frak': return `frak(${this.braceArgOrToken()})`
      case 'mathbb': {
        const a = this.braceArgRaw().trim()
        const mapped = BLACKBOARD[a]
        if (mapped) return mapped
        this.warn('mathbb:' + a)
        return a
      }
      case 'mathsf': case 'textsf': return `upright(${this.braceArgOrToken()})`
      case 'stackrel': case 'overset': {
        const a = this.braceArgOrToken()
        const b = this.braceArgOrToken()
        return `limits(${b})^(${a})`
      }
      case 'underset': {
        const a = this.braceArgOrToken()
        const b = this.braceArgOrToken()
        return `limits(${b})_(${a})`
      }
      default: {
        const sym = SYMBOLS[name]
        if (sym !== undefined) return sym
        this.warn(name)
        return name
      }
    }
  }

  /** 环境体（到对应 \end 之前，容忍嵌套 begin） */
  private environment(): string {
    const env = this.braceArgRaw().trim()
    let body = ''
    while (this.i < this.src.length) {
      const rest = this.src.slice(this.i)
      const endM = rest.match(/^\\end\s*\{([a-zA-Z*]+)\}/)
      if (endM) {
        this.i += endM[0].length
        if (endM[1] === env) break
        body += rest.slice(0, endM[0].length)
        continue
      }
      body += this.src[this.i]
      this.i++
    }

    const rows = splitTopLevel(body, /\\\\/).map((r) =>
      splitTopLevel(r, /&/).map((cell) => convertFragment(cell)),
    )

    if (env === 'cases' || env === 'dcases') {
      // cases 的每个参数是一行；行内单元格以空格连接
      return `cases(${rows.map((r) => r.join(' ')).join(', ')})`
    }
    if (env === 'aligned' || env === 'align' || env === 'align*' ||
        env === 'alignedat' || env === 'split' ||
        env === 'gather' || env === 'gathered' || env === 'equation' || env === 'equation*') {
      // Typst 无原生 aligned；用无边框 mat 保持多行（& 对齐语义降级）
      return `mat(${rows.map((r) => r.join(' ')).join('; ')}, delim: #none)`
    }
    const delim = MATRIX_ENVS[env]
    if (delim !== undefined) {
      return `mat(${rows.map((r) => r.join(', ')).join('; ')}${delim === 'none' ? ', delim: #none' : `, delim: #"${delim}"`})`
    }
    this.warn('begin:' + env)
    return rows.map((r) => r.join(' ')).join('; ')
  }

  /** `{...}` 参数（已转换）；无花括号时取单字符/单命令 */
  private braceArgOrToken(): string {
    if (this.src[this.i] === '{') {
      this.i++
      return this.sequence(true).trim()
    }
    if (this.src[this.i] === '\\') return this.command()
    const c = this.src[this.i] ?? ''
    this.i++
    return c
  }

  /** `{...}` 原文参数（用于 text/mathbb 等需要原文的场合） */
  private braceArgRaw(): string {
    if (this.src[this.i] !== '{') {
      const c = this.src[this.i] ?? ''
      this.i++
      return c
    }
    this.i++
    let depth = 1
    let out = ''
    while (this.i < this.src.length) {
      const c = this.src[this.i]
      if (c === '{') depth++
      if (c === '}') {
        depth--
        if (depth === 0) {
          this.i++
          return out
        }
      }
      out += c
      this.i++
    }
    return out
  }

  private skipBraceArg() {
    this.braceArgRaw()
  }

  /** `[...]` 可选参数 */
  private tryOptionalArg(): [string | null] {
    if (this.src[this.i] !== '[') return [null]
    this.i++
    let out = ''
    while (this.i < this.src.length && this.src[this.i] !== ']') {
      out += this.src[this.i]
      this.i++
    }
    this.i++ // ]
    return [out.trim()]
  }
}

/** 是否为"单 token"：单个字符、纯数字、Typst 符号名或简单符号 */
function isSingleToken(s: string): boolean {
  const t = s.trim()
  if (t.length === 0) return false
  if (t.length === 1) return true
  if (/^[\d.]+$/.test(t)) return true
  if (/^[a-zA-Z][a-zA-Z0-9.]*$/.test(t)) return true
  if (/^(?:[<>=|+-]|->|<-|=>|<==|-->|<--|\|->)$/.test(t)) return true
  return false
}

/** 顶层按分隔符切分（忽略嵌套花括号内的分隔符） */
function splitTopLevel(src: string, sep: RegExp): string[] {
  const sepSource = sep.source
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (let k = 0; k < src.length; k++) {
    const ch = src[k]
    if (ch === '{' || ch === '[') depth++
    if (ch === '}' || ch === ']') depth--
    if (depth === 0) {
      const m = src.slice(k).match(new RegExp(`^(?:${sepSource})`))
      if (m) {
        parts.push(cur)
        cur = ''
        k += m[0].length - 1
        continue
      }
    }
    cur += ch
  }
  parts.push(cur)
  return parts.filter((p) => p.trim() !== '')
}

function convertFragment(src: string): string {
  return new Converter(src).convert()
}

export function latexToTypst(src: string): MathConvertResult {
  const conv = new Converter(src)
  return {
    typst: conv.convert(),
    warnings: conv.warnings(),
  }
}
