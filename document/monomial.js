class Monomial {
  constructor(expression) {
    this.expression = expression.trim();
  }

  simplify() {
    try {
      const val = this.evalExpression(this.expression);
      return this.valueToString(val);
    } catch (e) {
      return `错误: ${e.message}`;
    }
  }

  // ==================== 静态入口 ====================

  static simplifyExpression(expr) {
    expr = (expr || '').trim();
    if (!expr) return '0';
    return new Monomial(expr).simplify();
  }

  static operate(a, op, b) {
    const ma = new Monomial(String(a));
    const mb = new Monomial(String(b));
    let result;
    if (op === '+') result = ma.add(mb);
    else if (op === '-') result = ma.sub(mb);
    else if (op === '*') result = ma.mul(mb);
    else if (op === '/') result = ma.div(mb);
    else throw new Error('未知运算符：' + op);
    return result.simplify ? result.simplify() : String(result);
  }

  // ==================== 表达式解析工具 ====================

  static isNumber(s) {
    return /^-?\d+$/.test(s);
  }

  // 判断 expr 是否被一对完整包裹的括号包住
  static isWrapped(expr) {
    if (!expr.startsWith('(') || !expr.endsWith(')')) return false;
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') {
        depth--;
        if (depth === 0 && i < expr.length - 1) return false;
      }
    }
    return depth === 0;
  }

  static unwrapOuterParens(expr) {
    while (Monomial.isWrapped(expr)) {
      expr = expr.slice(1, -1).trim();
    }
    return expr;
  }

  // 按顶层运算符切分表达式，返回 [{op, value}, ...]
  static splitTopLevel(expr, ops) {
    const parts = [];
    let depth = 0;
    let start = 0;
    let lastOp = null;

    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth < 0) throw new Error("括号不匹配");
      } else if (depth === 0 && ops.includes(ch)) {
        if ((ch === '+' || ch === '-') &&
            (i === 0 || '+-*/(,'.includes(expr[i - 1]))) {
          continue;
        }
        parts.push({ op: lastOp, value: expr.slice(start, i) });
        lastOp = ch;
        start = i + 1;
      }
    }
    if (depth !== 0) throw new Error("括号不匹配");
    parts.push({ op: lastOp, value: expr.slice(start) });
    return parts;
  }

  // 给定左括号的位置，返回括号内内容（不含括号）
  static extractParenthesesContent(str, openParenIndex) {
    if (str[openParenIndex] !== '(') return null;
    let depth = 0;
    let end = -1;
    for (let i = openParenIndex; i < str.length; i++) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') {
        depth--;
        if (depth < 0) return null;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) return null;
    return str.substring(openParenIndex + 1, end);
  }

  static splitArguments(content) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) {
        parts.push(content.substring(start, i));
        start = i + 1;
      }
    }
    parts.push(content.substring(start));
    return parts;
  }

  // 解析形如 name(args...) 的函数调用；失败返回 null
  static parseFunctionCall(expr) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\(/.exec(expr);
    if (!m) return null;
    const name = m[1];
    const openIdx = name.length;
    const inner = Monomial.extractParenthesesContent(expr, openIdx);
    if (inner === null) return null;
    const closeIdx = openIdx + inner.length + 1;
    if (closeIdx !== expr.length - 1) return null;
    return { name, args: Monomial.splitArguments(inner) };
  }

  // 解析输出语法，返回结构化对象供渲染层使用
  static parseValueString(expr) {
    expr = (expr || '').trim();
    if (!expr) return { type: 'text', value: '' };

    const call = Monomial.parseFunctionCall(expr);
    if (!call) return { type: 'text', value: expr };

    const args = call.args.map(s => s.trim());
    switch (call.name) {
      case 'd':
        if (args.length === 2) {
          return { type: 'fraction', numerator: args[0], denominator: args[1] };
        }
        break;
      case 'p':
        if (args.length === 2) {
          return { type: 'power', base: args[0], exponent: args[1] };
        }
        break;
      case 'r':
        if (args.length === 3) {
          return {
            type: 'radical',
            coef: parseInt(args[0], 10),
            radicand: args[1],
            index: parseInt(args[2], 10)
          };
        }
        break;
      case 'sqrt':
        if (args.length === 1) {
          return { type: 'sqrt', radicand: args[0] };
        }
        break;
      case 'root':
        if (args.length === 2) {
          return { type: 'root', index: args[0], radicand: args[1] };
        }
        break;
    }
    return { type: 'text', value: expr };
  }

  // ==================== 输出语法格式化 ====================

  static formatFraction(num, den) {
    return `d(${num || '0'},${den || '1'})`;
  }

  static formatPower(base, exp) {
    return `p(${base || '0'},${exp || '1'})`;
  }

  static formatSqrt(radicand) {
    return `sqrt(${radicand || '0'})`;
  }

  static formatRoot(index, radicand) {
    return `root(${index || '2'},${radicand || '0'})`;
  }

  // ==================== 多项式基础工具 ====================

  isPoly(v) {
    return v && Array.isArray(v.terms);
  }

  // 【新增】判断是否为"多项式根式"值（根号内含多项式的值）
  isPolyRadical(v) {
    return v && v.polyRadicand !== undefined && v.polyRadicand !== null;
  }

  toTerms(v) {
    if (this.isPolyRadical(v)) return [v];
    return this.isPoly(v) ? v.terms.slice() : [v];
  }

  fromTerms(terms) {
    const nonZero = terms.filter(t => t.coef !== 0);
    if (nonZero.length === 0) return { coef: 0, radicand: 1, index: 1, den: 1 };
    if (nonZero.length === 1) return nonZero[0];
    return { terms: nonZero };
  }

  combineLikeTerms(terms) {
    const map = new Map();
    let polyCounter = 0;
    for (const t of terms) {
      // 【新增】多项式根式无法与其它项合并，按独立项保留
      if (this.isPolyRadical(t)) {
        map.set(`__polyRadical__${polyCounter++}`, t);
        continue;
      }
      const key = `${t.radicand}|${t.index}`;
      if (!map.has(key)) {
        map.set(key, { coef: t.coef, radicand: t.radicand, index: t.index, den: t.den });
      } else {
        const existing = map.get(key);
        const num = existing.coef * t.den + t.coef * existing.den;
        const den = existing.den * t.den;
        map.set(key, this.normalizeValue({
          coef: num, radicand: t.radicand, index: t.index, den
        }));
      }
    }
    return Array.from(map.values());
  }

  negateValue(v) {
    // 【新增】多项式根式：只翻系数，保留 polyRadicand
    if (this.isPolyRadical(v)) {
      return { ...v, coef: -v.coef };
    }
    if (this.isPoly(v)) {
      return {
        terms: v.terms.map(t => ({
          coef: -t.coef, radicand: t.radicand, index: t.index, den: t.den
        }))
      };
    }
    return { coef: -v.coef, radicand: v.radicand, index: v.index, den: v.den };
  }

  // ==================== 求值 ====================

  evalExpression(expr) {
    expr = expr.trim();
    if (expr === '') throw new Error("空表达式");

    expr = Monomial.unwrapOuterParens(expr);

    // ---- 顶层 + / - ----
    const addSub = Monomial.splitTopLevel(expr, ['+', '-']);
    if (addSub.length > 1) {
      let result = this.evalExpression(addSub[0].value);
      for (let i = 1; i < addSub.length; i++) {
        const rv = this.evalExpression(addSub[i].value);
        result = addSub[i].op === '+'
          ? this.addValues(result, rv)
          : this.subValues(result, rv);
      }
      return result;
    }

    // ---- 顶层 * / ----
    const mulDiv = Monomial.splitTopLevel(expr, ['*', '/']);
    if (mulDiv.length > 1) {
      let result = this.evalExpression(mulDiv[0].value);
      for (let i = 1; i < mulDiv.length; i++) {
        const rv = this.evalExpression(mulDiv[i].value);
        result = mulDiv[i].op === '*'
          ? this.multiplyValues(result, rv)
          : this.divideValues(result, rv);
      }
      return result;
    }

    // 一元 + / -
    if (expr.startsWith('+')) return this.evalExpression(expr.substring(1));
    if (expr.startsWith('-')) return this.negateValue(this.evalExpression(expr.substring(1)));

    // 纯整数
    if (Monomial.isNumber(expr)) {
      return { coef: parseInt(expr, 10), radicand: 1, index: 1, den: 1 };
    }

    // 函数调用 r / d / p / sqrt / root
    const call = Monomial.parseFunctionCall(expr);
    if (call) return this.evalFunctionCall(call);

    throw new Error(`无效表达式: ${expr}`);
  }

  evalFunctionCall(call) {
    const { name, args } = call;

    switch (name) {
      case 'r': {
        if (args.length !== 3) throw new Error("r() 需要 3 个参数");
        const coefInt = this.valueToInteger(this.evalExpression(args[0].trim()));
        const radicandInt = this.valueToInteger(this.evalExpression(args[1].trim()));
        const indexInt = this.valueToInteger(this.evalExpression(args[2].trim()));
        if (coefInt === null || radicandInt === null || indexInt === null) {
          throw new Error("r() 的参数必须为整数");
        }
        if (indexInt <= 0) throw new Error("根指数必须为正整数");
        if (radicandInt < 0 && indexInt % 2 === 0) throw new Error("偶次根号负数");
        return this.normalizeValue({
          coef: coefInt, radicand: radicandInt, index: indexInt, den: 1
        });
      }

      case 'd': {
        if (args.length !== 2) throw new Error("d() 需要 2 个参数");
        const a = this.evalExpression(args[0].trim());
        const b = this.evalExpression(args[1].trim());
        return this.divideValues(a, b);
      }

      case 'p': {
        if (args.length !== 2) throw new Error("p() 需要 2 个参数");
        const base = this.evalExpression(args[0].trim());
        const exp = this.evalExpression(args[1].trim());
        return this.powerValues(base, exp);
      }

      case 'sqrt': {
        if (args.length !== 1) throw new Error("sqrt() 需要 1 个参数");
        const inner = this.evalExpression(args[0].trim());
        return this.rootValue(inner, 2);
      }

      case 'root': {
        if (args.length !== 2) throw new Error("root() 需要 2 个参数");
        const kVal = this.evalExpression(args[0].trim());
        const nVal = this.evalExpression(args[1].trim());
        const kInt = this.valueToInteger(kVal);
        if (kInt !== null && kInt > 0) return this.rootValue(nVal, kInt);
        throw new Error("根指数必须为正整数");
      }

      default:
        throw new Error(`未知函数: ${name}`);
    }
  }

  // ==================== 值的四则运算 ====================

  addValues(a, b) {
    const merged = [...this.toTerms(a), ...this.toTerms(b)];
    return this.fromTerms(this.combineLikeTerms(merged));
  }

  subValues(a, b) {
    return this.addValues(a, this.negateValue(b));
  }

  multiplyValues(a, b) {
    const result = [];
    for (const at of this.toTerms(a)) {
      for (const bt of this.toTerms(b)) {
        result.push(this.multiplySingle(at, bt));
      }
    }
    return this.fromTerms(this.combineLikeTerms(result));
  }

  multiplySingle(a, b) {
    // 【新增】多项式根式目前不支持参与乘法
    if (this.isPolyRadical(a) || this.isPolyRadical(b)) {
      throw new Error("暂不支持含多项式根式的乘法");
    }
    const coef = a.coef * b.coef;
    const den = a.den * b.den;

    const aRational = (a.radicand === 1 && a.index === 1);
    const bRational = (b.radicand === 1 && b.index === 1);

    let radicand, index;

    if (aRational) {
      radicand = b.radicand; index = b.index;
    } else if (bRational) {
      radicand = a.radicand; index = a.index;
    } else if (a.index === b.index) {
      radicand = a.radicand * b.radicand;
      index = a.index;
    } else {
      const M = a.index * b.index;
      radicand = Math.pow(a.radicand, b.index) * Math.pow(b.radicand, a.index);
      index = M;
    }

    if (radicand === 1) {
      return this.normalizeValue({ coef, radicand: 1, index: 1, den });
    }
    const simplified = this.rootOfInteger(radicand, index);
    return this.normalizeValue({
      coef: coef * simplified.coef,
      radicand: simplified.radicand,
      index: simplified.index,
      den: den * simplified.den
    });
  }

  divideValues(a, b) {
    const bTerms = this.toTerms(b);

    if (bTerms.length === 1) {
      const bSingle = bTerms[0];
      if (bSingle.coef === 0) throw new Error("除零");
      const result = this.toTerms(a).map(at => this.divideSingle(at, bSingle));
      return this.fromTerms(this.combineLikeTerms(result));
    }

    return this.divideByPolynomial(a, b, 0);
  }

  divideByPolynomial(a, b, depth = 0) {
    if (depth > 10) {
      throw new Error("多项式分母有理化层次过深");
    }

    const bTerms = this.toTerms(b);

    if (bTerms.length === 1) {
      return this.divideValues(a, bTerms[0]);
    }

    const first = bTerms[0];
    const rest = this.fromTerms(bTerms.slice(1));

    const conj = this.subValues(first, rest);

    const newDen = this.multiplyValues(b, conj);
    const newNum = this.multiplyValues(a, conj);

    if (this.valuesEqual(newDen, b)) {
      throw new Error("无法对多项式分母进行有理化");
    }

    return this.divideByPolynomial(newNum, newDen, depth + 1);
  }

  valuesEqual(a, b) {
    const ta = this.toTerms(a).map(t => this.normalizeValue({ ...t }));
    const tb = this.toTerms(b).map(t => this.normalizeValue({ ...t }));

    if (ta.length !== tb.length) return false;

    const key = t => `${t.coef}|${t.radicand}|${t.index}|${t.den}`;
    const ka = ta.map(key).sort();
    const kb = tb.map(key).sort();

    return ka.every((v, i) => v === kb[i]);
  }

  divideSingle(a, b) {
    // 【新增】多项式根式暂不支持除
    if (this.isPolyRadical(a) || this.isPolyRadical(b)) {
      throw new Error("暂不支持含多项式根式的除法");
    }
    if (b.radicand === 1 && b.index === 1) {
      return this.normalizeValue({
        coef: a.coef * b.den,
        radicand: a.radicand,
        index: a.index,
        den: a.den * b.coef
      });
    }
    const k = b.index;
    const r = b.radicand;
    const invB = {
      coef: b.den,
      radicand: Math.pow(r, k - 1),
      index: k,
      den: b.coef * r
    };
    return this.multiplySingle(a, invB);
  }

  powerValues(base, exp) {
    const eInt = this.valueToInteger(exp);
    if (eInt === null) throw new Error("指数必须为整数");

    if (eInt === 0) return { coef: 1, radicand: 1, index: 1, den: 1 };
    if (eInt < 0) {
      const pos = this.powerValues(base, { coef: -eInt, radicand: 1, index: 1, den: 1 });
      return this.divideValues({ coef: 1, radicand: 1, index: 1, den: 1 }, pos);
    }

    if (!this.isPoly(base)) {
      const { coef: c, radicand: n, index: k, den: d } = base;
      const newC = Math.pow(c, eInt);
      const newD = Math.pow(d, eInt);

      if (n === 1) {
        return this.normalizeValue({ coef: newC, radicand: 1, index: 1, den: newD });
      }
      if (eInt % k === 0) {
        const inner = Math.pow(n, eInt / k);
        return this.normalizeValue({ coef: newC * inner, radicand: 1, index: 1, den: newD });
      }
      const newN = Math.pow(n, eInt);
      const simplified = this.rootValue({ coef: 1, radicand: newN, index: 1, den: 1 }, k);
      return this.normalizeValue({
        coef: newC * simplified.coef,
        radicand: simplified.radicand,
        index: simplified.index,
        den: newD
      });
    }

    let result = { coef: 1, radicand: 1, index: 1, den: 1 };
    for (let i = 0; i < eInt; i++) {
      result = this.multiplyValues(result, base);
    }
    return result;
  }

  // ==================== rootValue（关键修改） ====================

  rootValue(v, k) {
    // 【修改】多项式根式原样保留，不再抛错
    if (this.isPoly(v)) {
      // 单项式伪装成多项式 → 走单项式路径
      if (v.terms.length === 1) {
        const single = v.terms[0];
        // 如果这一项已经是多项式根式，避免无限递归
        if (this.isPolyRadical(single)) return single;
        return this.rootValue(single, k);
      }
      // 真正的多项式：原样保留为多项式根式
      return {
        coef: 1,
        radicand: 1,
        index: 1,
        den: 1,
        polyRadicand: v,
        polyRootIndex: k
      };
    }

    const { coef, radicand, index, den } = v;

    if (coef === 0) return { coef: 0, radicand: 1, index: 1, den: 1 };
    if (k <= 0) throw new Error("根指数必须为正整数");

    if (index === 1 && radicand === 1) {
      if (coef < 0 && k % 2 === 0) throw new Error("偶次根号负数");
      const N = coef * Math.pow(den, k - 1);
      const r = this.rootOfInteger(N, k);
      return this.normalizeValue({
        coef: r.coef,
        radicand: r.radicand,
        index: r.index,
        den: r.den * den
      });
    }

    if (coef < 0 && k % 2 === 0) throw new Error("偶次根号负数");
    const sign = coef < 0 ? -1 : 1;
    const absCoef = Math.abs(coef);
    const M = index * k;
    const N2 = Math.pow(absCoef, index) * radicand * Math.pow(den, M - index);

    if (!isFinite(N2) || N2 > Number.MAX_SAFE_INTEGER) {
      throw new Error("根式化简数值溢出");
    }

    const r2 = this.rootOfInteger(N2, M);
    return this.normalizeValue({
      coef: sign * r2.coef,
      radicand: r2.radicand,
      index: r2.index,
      den: r2.den * den
    });
  }

  // ==================== 规范化 / 整数提取 ====================

  normalizeValue(v) {
    // 【新增】多项式根式原样返回
    if (this.isPolyRadical(v)) return v;

    if (v.den !== 1 && v.coef !== 0) {
      const g = this.gcd(Math.abs(v.coef), Math.abs(v.den));
      v.coef /= g;
      v.den /= g;
    }
    if (v.den < 0) { v.coef = -v.coef; v.den = -v.den; }

    if (v.radicand > 1 && v.index > 1) {
      const r = this.rootOfInteger(v.radicand, v.index);
      v.coef *= r.coef;
      v.radicand = r.radicand;
      v.index = r.index;
      v.den *= r.den;

      if (v.den !== 1 && v.coef !== 0) {
        const g = this.gcd(Math.abs(v.coef), Math.abs(v.den));
        v.coef /= g;
        v.den /= g;
      }
      if (v.den < 0) { v.coef = -v.coef; v.den = -v.den; }
    }
    if (v.radicand === 1) v.index = 1;
    if (v.coef === 0) { v.radicand = 1; v.index = 1; v.den = 1; }
    return v;
  }

  valueToInteger(v) {
    // 【新增】多项式根式不是整数
    if (this.isPolyRadical(v)) return null;
    if (this.isPoly(v)) {
      if (v.terms.length === 1) return this.valueToInteger(v.terms[0]);
      return null;
    }
    if (v.radicand === 1 && v.index === 1 && v.den === 1) return v.coef;
    return null;
  }

  // ==================== 字符串化 ====================

  valueToString(v) {
    // 【新增】多项式根式：输出 sqrt(poly) 或 root(k,poly)
    if (this.isPolyRadical(v)) {
      const inner = this.valueToString(v.polyRadicand);
      const k = v.polyRootIndex;
      const body = (k === 2) ? `sqrt(${inner})` : `root(${k},${inner})`;
      if (v.coef === 1 && v.den === 1) return body;
      if (v.coef === -1 && v.den === 1) return `-${body}`;
      return `d(${v.coef * (v.den < 0 ? -1 : 1)})*(${body})`;
    }

    if (this.isPoly(v)) {
      let result = '';
      for (let i = 0; i < v.terms.length; i++) {
        const t = v.terms[i];
        const isNeg = t.coef < 0;
        // 【修改】保留所有字段（包括 polyRadicand）
        const posT = isNeg ? { ...t, coef: -t.coef } : t;
        const s = this.singleValueToString(posT);
        if (i === 0) result += (isNeg ? '-' : '') + s;
        else result += (isNeg ? '-' : '+') + s;
      }
      return result;
    }
    return this.singleValueToString(v);
  }

  singleValueToString(v) {
    // 【新增】多项式根式的单项输出
    if (this.isPolyRadical(v)) {
      const inner = this.valueToString(v.polyRadicand);
      const k = v.polyRootIndex;
      const body = (k === 2) ? `sqrt(${inner})` : `root(${k},${inner})`;
      if (v.coef === 1 && v.den === 1) return body;
      if (v.coef === -1 && v.den === 1) return `-${body}`;
      // 带系数的多项式根式：以乘法形式表达
      return `d(${v.coef},${v.den})*(${body})`;
    }

    v = this.normalizeValue(v);
    if (v.radicand === 1 && v.index === 1) {
      return `d(${v.coef},${v.den})`;
    }
    if (v.den === 1) {
      return `r(${v.coef},${v.radicand},${v.index})`;
    }
    return `d(r(${v.coef},${v.radicand},${v.index}),${v.den})`;
  }

  // ==================== 杂项 ====================

  gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    return b === 0 ? a : this.gcd(b, a % b);
  }

  rootOfInteger(N, k) {
    if (N === 0) return { coef: 0, radicand: 1, index: 1, den: 1 };
    const isNeg = N < 0;
    if (isNeg && k % 2 === 0) throw new Error("偶次根号负数");

    const absN = Math.abs(N);
    const factors = this.factorize(absN);

    let g = k;
    for (const p in factors) g = this.gcd(g, factors[p]);
    if (g > 1) {
      k = k / g;
      for (const p in factors) factors[p] = factors[p] / g;
    }

    let coef = 1, radicand = 1;
    for (const p in factors) {
      const e = factors[p];
      const pi = parseInt(p, 10);
      const full = Math.floor(e / k);
      const rem = e % k;
      coef *= Math.pow(pi, full);
      radicand *= Math.pow(pi, rem);
    }
    if (isNeg) coef = -coef;

    if (radicand === 1) return { coef, radicand: 1, index: 1, den: 1 };
    return { coef, radicand, index: k, den: 1 };
  }

  factorize(n) {
    const factors = {};
    n = Math.abs(n);
    for (let d = 2; d * d <= n; d++) {
      while (n % d === 0) {
        factors[d] = (factors[d] || 0) + 1;
        n /= d;
      }
    }
    if (n > 1) factors[n] = (factors[n] || 0) + 1;
    return factors;
  }

  // ==================== 对外接口 ====================

  add(other) {
    const a = this.evalExpression(this.expression);
    const b = other.evalExpression(other.expression);
    return new Monomial(this.valueToString(this.addValues(a, b)));
  }

  sub(other) {
    const a = this.evalExpression(this.expression);
    const b = other.evalExpression(other.expression);
    return new Monomial(this.valueToString(this.subValues(a, b)));
  }

  mul(other) {
    const a = this.evalExpression(this.expression);
    const b = other.evalExpression(other.expression);
    return new Monomial(this.valueToString(this.multiplyValues(a, b)));
  }

  div(other) {
    const a = this.evalExpression(this.expression);
    const b = other.evalExpression(other.expression);
    return new Monomial(this.valueToString(this.divideValues(a, b)));
  }
}
