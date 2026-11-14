// Python string formatting: format spec mini-language, %-formatting, str.format.
import { repr, str, int as toInt, KeyError, ValueError, TypeError } from "./index";

const big = (x: any): x is bigint => typeof x === "bigint";

function groupDigits(s: string, sep: string): string {
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [i, f] = body.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? "-" : "") + g + (f !== undefined ? "." + f : "");
}

function fixed(x: number, prec: number): string {
  return x.toFixed(prec);
}

function expo(x: number, prec: number, upper: boolean): string {
  let s = x.toExponential(prec);
  s = s.replace(/e([+-])(\d)$/, "e$10$2");
  return upper ? s.toUpperCase() : s;
}

function general(x: number, prec: number, upper: boolean): string {
  if (prec === 0) prec = 1;
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(x)));
  let s: string;
  if (exp < -4 || exp >= prec) {
    s = expo(x, prec - 1, false).replace(/\.?0+e/, "e");
  } else {
    s = x.toFixed(Math.max(0, prec - 1 - exp));
    if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  }
  return upper ? s.toUpperCase() : s;
}

export function format(v: any, spec: string = ""): string {
  if (spec === "") return str(v);
  const m = /^(?:(.)?([<>=^]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([a-zA-Z%])?$/s.exec(spec);
  if (!m) throw new ValueError(`Invalid format specifier '${spec}'`);
  let [, fill, align, sign, alt, zero, width, group, prec, type] = m;
  const w = width ? parseInt(width, 10) : 0;
  let body: string;
  let numeric = false;
  let neg = false;
  const isNum = typeof v === "number" || big(v) || typeof v === "boolean";
  if (typeof v === "boolean" && (type === undefined || type === "s")) {
    body = str(v);
  } else if (isNum && type !== "s") {
    numeric = true;
    let n: number | bigint = typeof v === "boolean" ? (v ? 1 : 0) : v;
    const t = type ?? (Number.isInteger(n) || big(n) ? "d" : "g");
    if (t === "c") {
      body = String.fromCodePoint(Number(n));
      numeric = false;
    } else if ("dxXobn".includes(t)) {
      if (typeof n === "number" && !Number.isInteger(n)) throw new ValueError(`Unknown format code '${t}' for object of type 'float'`);
      let b = BigInt(n);
      neg = b < 0n;
      if (neg) b = -b;
      const radix = t === "x" || t === "X" ? 16 : t === "o" ? 8 : t === "b" ? 2 : 10;
      body = b.toString(radix);
      if (t === "X") body = body.toUpperCase();
      if (group) body = groupDigits(body, group);
      if (alt && radix !== 10) body = (t === "x" ? "0x" : t === "X" ? "0X" : t === "o" ? "0o" : "0b") + body;
    } else if ("eEfFgG%".includes(t)) {
      let x = Number(n);
      neg = x < 0 || Object.is(x, -0);
      x = Math.abs(x);
      const p = prec !== undefined ? parseInt(prec, 10) : 6;
      if (!isFinite(x)) body = isNaN(x) ? "nan" : "inf";
      else if (t === "f" || t === "F") body = fixed(x, p);
      else if (t === "e" || t === "E") body = expo(x, p, t === "E");
      else if (t === "%") body = fixed(x * 100, p) + "%";
      else body = general(x, prec !== undefined ? p : 6, t === "G");
      if (group) body = groupDigits(body, group);
    } else {
      throw new ValueError(`Unknown format code '${t}' for object of type 'int'`);
    }
    if (numeric) {
      const sg = neg ? "-" : sign === "+" ? "+" : sign === " " ? " " : "";
      if (zero && !align) {
        fill = "0";
        align = "=";
      }
      if ((align ?? ">") === "=") {
        const padn = Math.max(0, w - sg.length - body.length);
        return sg + (fill ?? " ").repeat(padn) + body;
      }
      body = sg + body;
    }
  } else {
    body = str(v);
    if (type !== undefined && type !== "s") throw new ValueError(`Unknown format code '${type}' for object of type 'str'`);
    if (prec !== undefined) body = [...body].slice(0, parseInt(prec, 10)).join("");
  }
  const len = [...body].length;
  if (len >= w) return body;
  const padn = w - len;
  const f = fill ?? " ";
  switch (align ?? (numeric ? ">" : "<")) {
    case "<":
      return body + f.repeat(padn);
    case ">":
      return f.repeat(padn) + body;
    case "^": {
      const l = Math.floor(padn / 2);
      return f.repeat(l) + body + f.repeat(padn - l);
    }
    default:
      return body + f.repeat(padn);
  }
}

/** "..." % args */
export function percent(fmt: string, args: any): string {
  const named = args instanceof Map ? args : null;
  const list: any[] = named ? [] : Array.isArray(args) ? args : [args];
  let ai = 0;
  const out = fmt.replace(/%(?:\(([^)]*)\))?([#0\- +]*)(\*|\d+)?(?:\.(\*|\d+))?[hlL]?([diouxXeEfFgGcrsa%])/g, (_m, key, flags, width, prec, conv) => {
    if (conv === "%") return "%";
    let v: any;
    if (width === "*") width = String(list[ai++]);
    if (prec === "*") prec = String(list[ai++]);
    if (key !== undefined) {
      if (!named || !named.has(key)) throw new KeyError(repr(key));
      v = named.get(key);
    } else {
      if (ai >= list.length) throw new TypeError("not enough arguments for format string");
      v = list[ai++];
    }
    let spec = "";
    const left = flags.includes("-");
    if (flags.includes("+")) spec += "+";
    else if (flags.includes(" ")) spec += " ";
    if (flags.includes("#")) spec += "#";
    if (flags.includes("0") && !left) spec += "0";
    if (width) spec += width;
    let t = conv;
    let s: string;
    switch (conv) {
      case "s":
        s = str(v);
        if (prec !== undefined) s = [...s].slice(0, +prec).join("");
        return pad(s, width, left);
      case "r":
      case "a":
        s = repr(v);
        if (prec !== undefined) s = [...s].slice(0, +prec).join("");
        return pad(s, width, left);
      case "c":
        s = typeof v === "number" ? String.fromCodePoint(v) : String(v);
        return pad(s, width, left);
      case "i":
      case "u":
        t = "d";
      // fallthrough
      case "d":
        if (typeof v !== "bigint") v = toInt(v);
        break;
    }
    if (prec !== undefined && "diouxX".includes(conv)) {
      // precision on ints = minimum digits
      let digits = (typeof v === "bigint" ? (v < 0n ? -v : v) : Math.abs(v)).toString(conv === "x" || conv === "X" ? 16 : conv === "o" ? 8 : 10);
      digits = digits.padStart(+prec, "0");
      const sg = v < 0 ? "-" : flags.includes("+") ? "+" : "";
      return pad(sg + digits, width, left);
    }
    const p = prec !== undefined ? "." + prec : "";
    return format(typeof v === "string" ? Number(v) : v, (left ? "<" : "") + spec + p + t);
  });
  if (!named && ai < list.length) throw new TypeError("not all arguments converted during string formatting");
  return out;
}

function pad(s: string, width: string | undefined, left: boolean): string {
  const w = width ? parseInt(width, 10) : 0;
  const n = [...s].length;
  if (n >= w) return s;
  return left ? s + " ".repeat(w - n) : " ".repeat(w - n) + s;
}

/** "...".format(*args, **kw) */
export function strFormat(fmt: string, args: any[], kw: Record<string, any>): string {
  let auto = 0;
  const get = (field: string): any => {
    const m = /^([^.\[]*)(.*)$/.exec(field)!;
    let base: any;
    if (m[1] === "") base = args[auto++];
    else if (/^\d+$/.test(m[1])) base = args[+m[1]];
    else base = kw[m[1]];
    if (base === undefined && m[1] !== "" && !(m[1] in kw) && !/^\d+$/.test(m[1])) throw new KeyError(repr(m[1]));
    let rest = m[2];
    const re = /\.(\w+)|\[([^\]]*)\]/g;
    let r: RegExpExecArray | null;
    while ((r = re.exec(rest))) {
      if (r[1] !== undefined) base = base[r[1]];
      else base = base instanceof Map ? base.get(r[2]) : base[/^\d+$/.test(r[2]) ? +r[2] : r[2]];
    }
    return base;
  };
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c === "{") {
      if (fmt[i + 1] === "{") {
        out += "{";
        i++;
        continue;
      }
      let depth = 1;
      let j = i + 1;
      while (j < fmt.length && depth > 0) {
        if (fmt[j] === "{") depth++;
        else if (fmt[j] === "}") depth--;
        j++;
      }
      const inner = fmt.slice(i + 1, j - 1);
      const mm = /^([^!:]*)(?:!([rsa]))?(?::(.*))?$/s.exec(inner)!;
      let v = get(mm[1]);
      if (mm[2] === "r" || mm[2] === "a") v = repr(v);
      else if (mm[2] === "s") v = str(v);
      const spec = mm[3] ? strFormat(mm[3], args, kw) : "";
      out += format(v, spec);
      i = j - 1;
    } else if (c === "}") {
      if (fmt[i + 1] === "}") i++;
      out += "}";
    } else out += c;
  }
  return out;
}
