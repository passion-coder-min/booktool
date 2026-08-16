import { describe, expect, it } from 'vitest'
import { escapeTypstText, typstString } from '../src/escape'
import { latexToTypst } from '../src/math'

describe('escapeTypstText', () => {
  it('转义 Typst 标记模式保留字符', () => {
    expect(escapeTypstText('# $ % & * _ ` [ ] < > @ \' " ~ - + = / ^ |')).toBe(
      "\\# \\$ \\% \\& \\* \\_ \\` \\[ \\] \\< \\> \\@ \\' \\\" \\~ \\- \\+ \\= \\/ \\^ \\|",
    )
  })
  it('中文与全角标点不需转义', () => {
    expect(escapeTypstText('你好，世界。「引号」？')).toBe('你好，世界。「引号」？')
  })
})

describe('typstString', () => {
  it('转义字符串字面量', () => {
    expect(typstString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"')
  })
})

describe('latexToTypst', () => {
  const cases: [string, string][] = [
    // 相邻字母必须拆分（Typst 数学中 mc 是未知标识符，m c 才是乘积）
    ['E=mc^2', 'E=m c^2'],
    ['a+b', 'a+b'],
    ['123+45.6', '123+45.6'],
    ['\\frac{a}{b}', 'a/b'],
    ['\\frac{a+b}{c+d}', 'frac(a+b, c+d)'],
    ['\\frac{d}{dx}x^2', 'frac(d, d x) x^2'],
    ['\\frac{\\sin x}{x}', 'frac(sin x, x)'],
    ['\\sqrt{x+1}', 'sqrt(x+1)'],
    ['\\sqrt[n]{x}', 'root(n, x)'],
    // 多 token 脚本 → attach()；单 token 直接连写
    ['\\sum_{i=1}^{n} i', 'attach(sum, b: i=1, t: n) i'],
    ['x^{n+1}', 'attach(x, t: n+1)'],
    ['a_1^2', 'a_1^2'],
    ['\\lim_{x \\to 0} \\frac{\\sin x}{x}', 'attach(lim, b: x -> 0) frac(sin x, x)'],
    ['\\int_0^\\infty e^{-x} dx', 'integral_0^infinity attach(e, t: -x) d x'],
    // 相邻标识符自动加空格
    ['\\alpha\\beta\\gamma', 'alpha beta gamma'],
    ['\\mathbb{R}^n', 'RR^n'],
    ['x \\leq 0 \\Rightarrow x \\not\\in \\mathbb{N}', 'x <= 0 => x not.in NN'],
    ['\\text{total cost}', '"total cost"'],
    ['\\text{if } x \\geq \\epsilon', '"if " x >= epsilon'],
    ['\\vec{v} \\cdot \\hat{n}', 'arrow(v) dot.op hat(n)'],
    ['\\overline{X}_n', 'overline(X)_n'],
    ['f: A \\mapsto B', 'f: A |-> B'],
    ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'mat(a, b; c, d, delim: #"(")'],
    ['\\begin{cases} x & x > 0 \\\\ 0 & \\text{else} \\end{cases}', 'cases(x x > 0, 0 "else")'],
    ['\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}', 'mat(a = b; c = d, delim: #none)'],
  ]
  for (const [latex, expected] of cases) {
    it(`${latex} → ${expected}`, () => {
      expect(latexToTypst(latex).typst).toBe(expected)
    })
  }

  it('未知命令产生 warning 且保留命令名', () => {
    const r = latexToTypst('\\unknowncmd{x}')
    expect(r.warnings.join()).toContain('unknowncmd')
    expect(r.typst).toContain('unknowncmd')
  })
})
