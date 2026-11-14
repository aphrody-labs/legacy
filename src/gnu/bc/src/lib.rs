//! `bc`: the POSIX arbitrary-precision calculator language with the GNU extensions `print`,
//! `&& || !`, `#` comments, `read()`, `.` (last), `-l` math library (`s c a l e j`), `-q -s -w -i`.
//! Numbers are `BigInt` mantissa plus decimal scale. Unary minus binds below `^` (`-2^2 = -4`).
//! Output wraps at `$BC_LINE_LENGTH` (default 70) with a trailing backslash.

use num_bigint::{BigInt, Sign};
use num_traits::{One, Signed, ToPrimitive, Zero};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::rc::Rc;

fn ipow(b: &BigInt, mut e: u32) -> BigInt {
    let (mut r, mut b) = (BigInt::one(), b.clone());
    while e > 0 {
        if e & 1 == 1 {
            r *= &b;
        }
        e >>= 1;
        if e > 0 {
            b = &b * &b;
        }
    }
    r
}

fn p10(n: u32) -> BigInt {
    ipow(&BigInt::from(10), n)
}

/// `m / 10^s`.
#[derive(Clone, Debug)]
pub struct Num {
    m: BigInt,
    s: u32,
}

impl Num {
    fn int(v: i64) -> Self {
        Self { m: BigInt::from(v), s: 0 }
    }
    fn bool(b: bool) -> Self {
        Self::int(i64::from(b))
    }
    fn is_zero(&self) -> bool {
        self.m.is_zero()
    }
    fn up(&self, s: u32) -> BigInt {
        &self.m * p10(s - self.s)
    }
    fn trunc(&self, s: u32) -> Self {
        if s >= self.s { self.clone() } else { Self { m: &self.m / p10(self.s - s), s } }
    }
    fn add(&self, o: &Self) -> Self {
        let s = self.s.max(o.s);
        Self { m: self.up(s) + o.up(s), s }
    }
    fn sub(&self, o: &Self) -> Self {
        let s = self.s.max(o.s);
        Self { m: self.up(s) - o.up(s), s }
    }
    fn neg(&self) -> Self {
        Self { m: -&self.m, s: self.s }
    }
    fn mulx(&self, o: &Self) -> Self {
        Self { m: &self.m * &o.m, s: self.s + o.s }
    }
    fn mul(&self, o: &Self, scale: u32) -> Self {
        let full = self.mulx(o);
        let rs = full.s.min(scale.max(self.s).max(o.s));
        full.trunc(rs)
    }
    fn div(&self, o: &Self, scale: u32) -> Result<Self, String> {
        if o.is_zero() {
            return Err("Divide by zero".into());
        }
        Ok(Self { m: (&self.m * p10(scale + o.s)) / (&o.m * p10(self.s)), s: scale })
    }
    fn rem(&self, o: &Self, scale: u32) -> Result<Self, String> {
        if o.is_zero() {
            return Err("Modulo by zero".into());
        }
        let q = self.div(o, scale)?;
        Ok(self.sub(&q.mulx(o)))
    }
    fn to_u32(&self) -> Option<u32> {
        self.trunc(0).m.to_u32()
    }
    fn pow(&self, e: &Self, scale: u32) -> Result<Self, String> {
        let n = e.trunc(0).m.to_i64().filter(|n| n.unsigned_abs() <= u64::from(u32::MAX)).ok_or("exponent too large")?;
        let k = u32::try_from(n.unsigned_abs()).map_err(|_| "exponent too large")?;
        let full = Self { m: ipow(&self.m, k), s: self.s * k };
        if n >= 0 {
            let rs = full.s.min(scale.max(self.s));
            Ok(full.trunc(rs))
        } else {
            Self::int(1).div(&full, scale)
        }
    }
    fn sqrt(&self, scale: u32) -> Result<Self, String> {
        if self.m.is_negative() {
            return Err("Square root of a negative number".into());
        }
        if *self == Self::int(1) {
            return Ok(Self::int(1));
        }
        let rs = scale.max(self.s);
        Ok(Self { m: (&self.m * p10(2 * rs - self.s)).sqrt(), s: rs })
    }
    fn len(&self) -> u32 {
        let d = if self.m.is_zero() { 1 } else { self.m.abs().to_string().len() as u32 };
        d.max(self.s)
    }
    fn parse(t: &str, base: u32) -> Self {
        let (ip, fp) = t.split_once('.').unwrap_or((t, ""));
        let dig = |c: char| c.to_digit(36).map_or(base - 1, |d| d.min(base - 1));
        let mut m = BigInt::zero();
        for c in ip.chars() {
            m = m * base + dig(c);
        }
        if fp.is_empty() {
            return Self { m, s: 0 };
        }
        let s = fp.len() as u32;
        if base == 10 {
            for c in fp.chars() {
                m = m * 10 + dig(c);
            }
            return Self { m, s };
        }
        let (mut f, mut d) = (BigInt::zero(), BigInt::one());
        for c in fp.chars() {
            f = f * base + dig(c);
            d *= base;
        }
        let frac = (f * p10(s)) / d;
        Self { m: m * p10(s) + frac, s }
    }
    fn fmt(&self, ob: u32) -> String {
        if self.m.is_zero() {
            return "0".into();
        }
        let neg = self.m.sign() == Sign::Minus;
        let a = self.m.abs();
        let pw = p10(self.s);
        let (ip, fp) = (&a / &pw, &a % &pw);
        let mut o = String::new();
        if neg {
            o.push('-');
        }
        if ob == 10 {
            if !ip.is_zero() {
                o.push_str(&ip.to_string());
            }
            if self.s > 0 {
                o.push('.');
                o.push_str(&format!("{:0>w$}", fp.to_string(), w = self.s as usize));
            }
            return o;
        }
        let dg = |d: u32| if ob <= 16 { format!("{}", char::from_digit(d, 16).unwrap_or('0').to_ascii_uppercase()) } else { format!(" {d:02}") };
        let mut ds = Vec::new();
        let mut v = ip;
        let b = BigInt::from(ob);
        while !v.is_zero() {
            ds.push((&v % &b).to_u32().unwrap_or(0));
            v /= &b;
        }
        ds.iter().rev().for_each(|d| o.push_str(&dg(*d)));
        if self.s > 0 && !fp.is_zero() {
            o.push('.');
            let mut f = fp;
            for _ in 0..self.s {
                f *= &b;
                o.push_str(&dg((&f / &pw).to_u32().unwrap_or(0)));
                f %= &pw;
                if f.is_zero() {
                    break;
                }
            }
        }
        o
    }
}

impl PartialEq for Num {
    fn eq(&self, o: &Self) -> bool {
        self.partial_cmp(o) == Some(std::cmp::Ordering::Equal)
    }
}

impl PartialOrd for Num {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        let s = self.s.max(o.s);
        Some(self.up(s).cmp(&o.up(s)))
    }
}

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(String),
    Id(String),
    Str(String),
    Op(&'static str),
    Nl,
    Eof,
}

const OPS: [&str; 31] = [
    "++", "--", "+=", "-=", "*=", "/=", "%=", "^=", "==", "<=", ">=", "!=", "&&", "||", "+", "-", "*", "/", "%", "^", "=", "<", ">", "!", "(", ")", "[", "]", "{", "}", ",",
];

fn lex(src: &str) -> Result<Vec<(Tok, u32)>, String> {
    let c: Vec<char> = src.chars().collect();
    let (mut i, mut line, mut v) = (0, 1u32, Vec::new());
    while i < c.len() {
        let ch = c[i];
        match ch {
            '\n' => {
                v.push((Tok::Nl, line));
                line += 1;
                i += 1;
            }
            ' ' | '\t' | '\r' => i += 1,
            '\\' if c.get(i + 1) == Some(&'\n') => {
                line += 1;
                i += 2;
            }
            '#' => {
                while i < c.len() && c[i] != '\n' {
                    i += 1;
                }
            }
            '/' if c.get(i + 1) == Some(&'*') => {
                i += 2;
                while i < c.len() && !(c[i] == '*' && c.get(i + 1) == Some(&'/')) {
                    line += u32::from(c[i] == '\n');
                    i += 1;
                }
                i += 2;
            }
            '"' => {
                let s = i + 1;
                i += 1;
                while i < c.len() && c[i] != '"' {
                    line += u32::from(c[i] == '\n');
                    i += 1;
                }
                if i >= c.len() {
                    return Err("unterminated string".into());
                }
                v.push((Tok::Str(c[s..i].iter().collect()), line));
                i += 1;
            }
            ';' => {
                v.push((Tok::Nl, line));
                i += 1;
            }
            d if d.is_ascii_digit() || d == '.' || d.is_ascii_uppercase() => {
                let mut t = String::new();
                while i < c.len() {
                    if c[i].is_ascii_digit() || c[i] == '.' || c[i].is_ascii_uppercase() {
                        t.push(c[i]);
                        i += 1;
                    } else if c[i] == '\\' && c.get(i + 1) == Some(&'\n') {
                        i += 2;
                        line += 1;
                    } else {
                        break;
                    }
                }
                v.push((Tok::Num(t), line));
            }
            a if a.is_ascii_lowercase() => {
                let s = i;
                while i < c.len() && (c[i].is_ascii_lowercase() || c[i].is_ascii_digit() || c[i] == '_') {
                    i += 1;
                }
                v.push((Tok::Id(c[s..i].iter().collect()), line));
            }
            _ => {
                let rest: String = c[i..(i + 2).min(c.len())].iter().collect();
                let op: &'static str = OPS.iter().copied().find(|o| rest.starts_with(*o)).ok_or_else(|| format!("illegal character: {ch}"))?;
                v.push((Tok::Op(op), line));
                i += op.len();
            }
        }
    }
    v.push((Tok::Eof, line));
    Ok(v)
}

#[derive(Clone, Debug)]
enum Lv {
    Var(String),
    Idx(String, Box<Expr>),
    Scale,
    Ibase,
    Obase,
    Last,
}

#[derive(Clone, Debug)]
enum Arg {
    E(Expr),
    A(String),
}

#[derive(Clone, Debug)]
enum Expr {
    Num(Num),
    Get(Lv),
    Neg(Box<Expr>),
    Not(Box<Expr>),
    Bin(&'static str, Box<Expr>, Box<Expr>),
    Assign(Lv, &'static str, Box<Expr>),
    Inc(Lv, i64, bool),
    Call(String, Vec<Arg>),
    Sqrt(Box<Expr>),
    Length(Box<Expr>),
    ScaleOf(Box<Expr>),
    Read,
}

#[derive(Clone, Debug)]
enum Item {
    S(String),
    E(Expr),
}

#[derive(Clone, Debug)]
enum Stmt {
    Expr(Expr),
    Str(String),
    Print(Vec<Item>),
    Block(Vec<Stmt>),
    If(Expr, Box<Stmt>, Option<Box<Stmt>>),
    While(Expr, Box<Stmt>),
    For(Option<Expr>, Option<Expr>, Option<Expr>, Box<Stmt>),
    Break,
    Continue,
    Halt,
    Return(Option<Expr>),
    Limits,
}

struct Func {
    params: Vec<(String, bool)>,
    /// `*a[]`: the callee's array is copied back into the caller's.
    byref: Vec<bool>,
    autos: Vec<(String, bool)>,
    body: Vec<Stmt>,
}

struct P {
    t: Vec<(Tok, u32)>,
    i: usize,
    ibase: u32,
}

type PR<T> = Result<T, String>;

impl P {
    fn peek(&self) -> &Tok {
        &self.t[self.i.min(self.t.len() - 1)].0
    }
    fn line(&self) -> u32 {
        self.t[self.i.min(self.t.len() - 1)].1
    }
    fn adv(&mut self) -> Tok {
        let t = self.peek().clone();
        self.i += 1;
        t
    }
    fn is(&self, op: &str) -> bool {
        matches!(self.peek(), Tok::Op(o) if *o == op)
    }
    fn eat(&mut self, op: &str) -> bool {
        let r = self.is(op);
        self.i += usize::from(r);
        r
    }
    fn kw(&self, k: &str) -> bool {
        matches!(self.peek(), Tok::Id(i) if i == k)
    }
    fn expect(&mut self, op: &str) -> PR<()> {
        if self.eat(op) { Ok(()) } else { Err("syntax error".into()) }
    }
    fn skip_nl(&mut self) {
        while *self.peek() == Tok::Nl {
            self.i += 1;
        }
    }

    fn expr(&mut self) -> PR<Expr> {
        let mut l = self.and()?;
        while self.eat("||") {
            let r = self.and()?;
            l = Expr::Bin("||", Box::new(l), Box::new(r));
        }
        Ok(l)
    }
    fn and(&mut self) -> PR<Expr> {
        let mut l = self.not()?;
        while self.eat("&&") {
            let r = self.not()?;
            l = Expr::Bin("&&", Box::new(l), Box::new(r));
        }
        Ok(l)
    }
    fn not(&mut self) -> PR<Expr> {
        if self.eat("!") { Ok(Expr::Not(Box::new(self.not()?))) } else { self.rel() }
    }
    fn rel(&mut self) -> PR<Expr> {
        let mut l = self.add()?;
        while let Tok::Op(o @ ("==" | "<=" | ">=" | "!=" | "<" | ">")) = *self.peek() {
            self.i += 1;
            let r = self.add()?;
            l = Expr::Bin(o, Box::new(l), Box::new(r));
        }
        Ok(l)
    }
    fn add(&mut self) -> PR<Expr> {
        let mut l = self.mul()?;
        while let Tok::Op(o @ ("+" | "-")) = *self.peek() {
            self.i += 1;
            let r = self.mul()?;
            l = Expr::Bin(o, Box::new(l), Box::new(r));
        }
        Ok(l)
    }
    fn mul(&mut self) -> PR<Expr> {
        let mut l = self.unary()?;
        while let Tok::Op(o @ ("*" | "/" | "%")) = *self.peek() {
            self.i += 1;
            let r = self.unary()?;
            l = Expr::Bin(o, Box::new(l), Box::new(r));
        }
        Ok(l)
    }
    fn unary(&mut self) -> PR<Expr> {
        if self.eat("-") { Ok(Expr::Neg(Box::new(self.unary()?))) } else { self.pow() }
    }
    fn pow(&mut self) -> PR<Expr> {
        let b = self.primary()?;
        if self.eat("^") {
            let e = self.unary()?;
            return Ok(Expr::Bin("^", Box::new(b), Box::new(e)));
        }
        Ok(b)
    }
    fn lv(&mut self, name: String) -> PR<Lv> {
        if self.eat("[") {
            let e = self.expr()?;
            self.expect("]")?;
            return Ok(Lv::Idx(name, Box::new(e)));
        }
        Ok(match name.as_str() {
            "scale" => Lv::Scale,
            "ibase" => Lv::Ibase,
            "obase" => Lv::Obase,
            "last" => Lv::Last,
            _ => Lv::Var(name),
        })
    }
    fn paren(&mut self) -> PR<Expr> {
        self.expect("(")?;
        let e = self.expr()?;
        self.expect(")")?;
        Ok(e)
    }
    fn primary(&mut self) -> PR<Expr> {
        match self.adv() {
            Tok::Num(t) if t == "." => Ok(Expr::Get(Lv::Last)),
            Tok::Num(t) => Ok(Expr::Num(Num::parse(&t, self.ibase))),
            Tok::Op("(") => {
                let e = self.expr()?;
                self.expect(")")?;
                Ok(e)
            }
            Tok::Op(o @ ("++" | "--")) => {
                let Tok::Id(n) = self.adv() else { return Err("syntax error".into()) };
                let lv = self.lv(n)?;
                Ok(Expr::Inc(lv, if o == "++" { 1 } else { -1 }, true))
            }
            Tok::Id(n) => match n.as_str() {
                "sqrt" => Ok(Expr::Sqrt(Box::new(self.paren()?))),
                "length" => Ok(Expr::Length(Box::new(self.paren()?))),
                "scale" if self.is("(") => Ok(Expr::ScaleOf(Box::new(self.paren()?))),
                "read" if self.is("(") => {
                    self.expect("(")?;
                    self.expect(")")?;
                    Ok(Expr::Read)
                }
                _ if self.is("(") => {
                    self.i += 1;
                    let mut a = Vec::new();
                    while !self.is(")") {
                        let at = |k: usize| self.t.get(self.i + k).map(|x| x.0.clone());
                        if let (Some(Tok::Id(x)), Some(Tok::Op("[")), Some(Tok::Op("]"))) = (at(0), at(1), at(2)) {
                            self.i += 3;
                            a.push(Arg::A(x));
                        } else {
                            a.push(Arg::E(self.expr()?));
                        }
                        if !self.eat(",") {
                            break;
                        }
                    }
                    self.expect(")")?;
                    Ok(Expr::Call(n, a))
                }
                _ => {
                    let lv = self.lv(n)?;
                    if let Tok::Op(o @ ("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "^=")) = *self.peek() {
                        self.i += 1;
                        let r = self.assign_rhs()?;
                        return Ok(Expr::Assign(lv, o, Box::new(r)));
                    }
                    if let Tok::Op(o @ ("++" | "--")) = *self.peek() {
                        self.i += 1;
                        return Ok(Expr::Inc(lv, if o == "++" { 1 } else { -1 }, false));
                    }
                    Ok(Expr::Get(lv))
                }
            },
            _ => Err("syntax error".into()),
        }
    }
    fn assign_rhs(&mut self) -> PR<Expr> {
        self.add()
    }

    fn end(&mut self) -> PR<()> {
        match self.peek() {
            Tok::Nl => {
                self.i += 1;
                Ok(())
            }
            Tok::Eof | Tok::Op("}") => Ok(()),
            _ => Err("syntax error".into()),
        }
    }

    fn stmt(&mut self) -> PR<Stmt> {
        self.skip_nl();
        match self.peek().clone() {
            Tok::Op("{") => {
                self.i += 1;
                let mut v = Vec::new();
                loop {
                    self.skip_nl();
                    if self.eat("}") {
                        break;
                    }
                    if *self.peek() == Tok::Eof {
                        return Err("syntax error".into());
                    }
                    v.push(self.stmt()?);
                }
                Ok(Stmt::Block(v))
            }
            Tok::Str(s) => {
                self.i += 1;
                self.end()?;
                Ok(Stmt::Str(s))
            }
            Tok::Id(k) => match k.as_str() {
                "if" => {
                    self.i += 1;
                    let c = self.paren()?;
                    let b = self.stmt()?;
                    let save = self.i;
                    self.skip_nl();
                    if self.kw("else") {
                        self.i += 1;
                        let e = self.stmt()?;
                        return Ok(Stmt::If(c, Box::new(b), Some(Box::new(e))));
                    }
                    self.i = save;
                    Ok(Stmt::If(c, Box::new(b), None))
                }
                "while" => {
                    self.i += 1;
                    let c = self.paren()?;
                    Ok(Stmt::While(c, Box::new(self.stmt()?)))
                }
                "for" => {
                    self.i += 1;
                    self.expect("(")?;
                    let mut p = [None, None, None];
                    for (k, sep) in [";", ";", ")"].iter().enumerate() {
                        let sepok = |s: &mut Self| if *sep == ";" { (*s.peek() == Tok::Nl).then(|| s.i += 1).is_some() } else { s.eat(")") };
                        if !sepok(self) {
                            p[k] = Some(self.expr()?);
                            if !sepok(self) {
                                return Err("syntax error".into());
                            }
                        }
                    }
                    let [a, b, c] = p;
                    Ok(Stmt::For(a, b, c, Box::new(self.stmt()?)))
                }
                "break" | "continue" | "halt" | "limits" | "quit" => {
                    self.i += 1;
                    self.end()?;
                    Ok(match k.as_str() {
                        "break" => Stmt::Break,
                        "continue" => Stmt::Continue,
                        "limits" => Stmt::Limits,
                        _ => Stmt::Halt,
                    })
                }
                "return" => {
                    self.i += 1;
                    let e = if matches!(self.peek(), Tok::Nl | Tok::Eof | Tok::Op("}")) { None } else { Some(self.expr()?) };
                    self.end()?;
                    Ok(Stmt::Return(e))
                }
                "print" => {
                    self.i += 1;
                    let mut v = Vec::new();
                    loop {
                        match self.peek().clone() {
                            Tok::Str(s) => {
                                self.i += 1;
                                v.push(Item::S(s));
                            }
                            _ => v.push(Item::E(self.expr()?)),
                        }
                        if !self.eat(",") {
                            break;
                        }
                    }
                    self.end()?;
                    Ok(Stmt::Print(v))
                }
                _ => self.simple(),
            },
            _ => self.simple(),
        }
    }
    fn simple(&mut self) -> PR<Stmt> {
        let e = self.expr()?;
        self.end()?;
        Ok(Stmt::Expr(e))
    }

    fn define(&mut self) -> PR<(String, Func)> {
        self.i += 1;
        let Tok::Id(name) = self.adv() else { return Err("syntax error".into()) };
        self.expect("(")?;
        let named = self.names(")")?;
        let byref = named.iter().map(|p| p.2).collect();
        let params = named.into_iter().map(|p| (p.0, p.1)).collect();
        self.skip_nl();
        self.expect("{")?;
        self.skip_nl();
        let mut autos = Vec::new();
        if self.kw("auto") {
            self.i += 1;
            autos = self.names("\n")?.into_iter().map(|p| (p.0, p.1)).collect();
        }
        let mut body = Vec::new();
        loop {
            self.skip_nl();
            if self.eat("}") {
                break;
            }
            if *self.peek() == Tok::Eof {
                return Err("syntax error".into());
            }
            body.push(self.stmt()?);
        }
        Ok((name, Func { params, byref, autos, body }))
    }
    /// Identifier list (`a, b[]`) closed by `)` or a newline.
    fn names(&mut self, close: &str) -> PR<Vec<(String, bool, bool)>> {
        let mut v = Vec::new();
        loop {
            if close == ")" && self.eat(")") {
                break;
            }
            if close != ")" && matches!(self.peek(), Tok::Nl | Tok::Eof) {
                self.i += 1;
                break;
            }
            let byref = self.eat("*");
            let Tok::Id(n) = self.adv() else { return Err("syntax error".into()) };
            let arr = self.eat("[");
            if arr {
                self.expect("]")?;
            }
            v.push((n, arr, byref));
            if !self.eat(",") && close == ")" {
                self.expect(")")?;
                break;
            }
        }
        Ok(v)
    }
}

enum Ctl {
    Break,
    Continue,
    Return(Num),
    Halt,
    Err(String),
}

impl From<&str> for Ctl {
    fn from(s: &str) -> Self {
        Ctl::Err(s.to_owned())
    }
}

impl From<String> for Ctl {
    fn from(s: String) -> Self {
        Ctl::Err(s)
    }
}

type ER<T> = Result<T, Ctl>;
type Arr = HashMap<usize, Num>;

enum Val {
    N(Num),
    A(Arr),
}

struct Bc<'a> {
    scale: u32,
    ibase: u32,
    obase: u32,
    last: Num,
    vars: HashMap<String, Vec<Num>>,
    arrs: HashMap<String, Vec<Arr>>,
    funcs: HashMap<String, Rc<Func>>,
    out: &'a mut dyn Write,
    err: &'a mut dyn Write,
    col: usize,
    width: usize,
    depth: usize,
    stdin: &'a mut dyn Read,
    cur: String,
}

impl Bc<'_> {
    fn put(&mut self, s: &str, wrap: bool) {
        for ch in s.chars() {
            if wrap && self.width > 2 && self.col == self.width - 2 {
                let _ = self.out.write_all(b"\\\n");
                self.col = 0;
            }
            let mut b = [0; 4];
            let _ = self.out.write_all(ch.encode_utf8(&mut b).as_bytes());
            self.col = if ch == '\n' { 0 } else { self.col + 1 };
        }
    }

    fn get(&mut self, lv: &Lv) -> ER<Num> {
        Ok(match lv {
            Lv::Scale => Num::int(i64::from(self.scale)),
            Lv::Ibase => Num::int(i64::from(self.ibase)),
            Lv::Obase => Num::int(i64::from(self.obase)),
            Lv::Last => self.last.clone(),
            Lv::Var(n) => self.vars.get(n).and_then(|s| s.last()).cloned().unwrap_or_else(|| Num::int(0)),
            Lv::Idx(n, i) => {
                let i = self.index(i)?;
                self.arrs.get(n).and_then(|s| s.last()).and_then(|a| a.get(&i)).cloned().unwrap_or_else(|| Num::int(0))
            }
        })
    }
    fn index(&mut self, e: &Expr) -> ER<usize> {
        let v = self.eval(e)?;
        v.to_u32().filter(|_| !v.m.is_negative()).map(|x| x as usize).ok_or_else(|| Ctl::Err("Array index out of range".into()))
    }
    fn set(&mut self, lv: &Lv, v: Num) -> ER<()> {
        match lv {
            Lv::Scale => self.scale = v.to_u32().filter(|_| !v.m.is_negative()).ok_or("Invalid scale")?,
            Lv::Ibase => self.ibase = v.to_u32().filter(|b| (2..=16).contains(b)).ok_or("Invalid ibase, must be [2,16]")?,
            Lv::Obase => self.obase = v.to_u32().filter(|b| *b >= 2).ok_or("Invalid obase, must be [2,999]")?,
            Lv::Last => self.last = v,
            Lv::Var(n) => {
                let st = self.vars.entry(n.clone()).or_default();
                match st.last_mut() {
                    Some(t) => *t = v,
                    None => st.push(v),
                }
            }
            Lv::Idx(n, i) => {
                let i = self.index(i)?;
                let st = self.arrs.entry(n.clone()).or_default();
                if st.is_empty() {
                    st.push(Arr::new());
                }
                if let Some(a) = st.last_mut() {
                    a.insert(i, v);
                }
            }
        }
        Ok(())
    }

    fn arith(&self, op: &str, a: &Num, b: &Num) -> Result<Num, String> {
        Ok(match op {
            "+" => a.add(b),
            "-" => a.sub(b),
            "*" => a.mul(b, self.scale),
            "/" => a.div(b, self.scale)?,
            "%" => a.rem(b, self.scale)?,
            "^" => a.pow(b, self.scale)?,
            _ => return Err(format!("bad operator {op}")),
        })
    }

    fn eval(&mut self, e: &Expr) -> ER<Num> {
        Ok(match e {
            Expr::Num(n) => n.clone(),
            Expr::Get(lv) => self.get(lv)?,
            Expr::Neg(x) => self.eval(x)?.neg(),
            Expr::Not(x) => Num::bool(self.eval(x)?.is_zero()),
            Expr::Bin("&&", l, r) => Num::bool(!self.eval(l)?.is_zero() && !self.eval(r)?.is_zero()),
            Expr::Bin("||", l, r) => Num::bool(!self.eval(l)?.is_zero() || !self.eval(r)?.is_zero()),
            Expr::Bin(op, l, r) => {
                let (a, b) = (self.eval(l)?, self.eval(r)?);
                match *op {
                    "==" => Num::bool(a == b),
                    "!=" => Num::bool(a != b),
                    "<" => Num::bool(a < b),
                    ">" => Num::bool(a > b),
                    "<=" => Num::bool(a <= b),
                    ">=" => Num::bool(a >= b),
                    _ => self.arith(op, &a, &b)?,
                }
            }
            Expr::Assign(lv, op, r) => {
                let mut v = self.eval(r)?;
                if *op != "=" {
                    let cur = self.get(lv)?;
                    v = self.arith(&op[..1], &cur, &v)?;
                }
                self.set(lv, v.clone())?;
                v
            }
            Expr::Inc(lv, d, pre) => {
                let old = self.get(lv)?;
                let new = old.add(&Num::int(*d));
                self.set(lv, new.clone())?;
                if *pre { new } else { old }
            }
            Expr::Sqrt(x) => {
                let v = self.eval(x)?;
                v.sqrt(self.scale)?
            }
            Expr::Length(x) => Num::int(i64::from(self.eval(x)?.len())),
            Expr::ScaleOf(x) => Num::int(i64::from(self.eval(x)?.s)),
            Expr::Read => {
                let mut b = [0u8; 1];
                let mut l = String::new();
                while self.stdin.read(&mut b).unwrap_or(0) == 1 && b[0] != b'\n' {
                    l.push(b[0] as char);
                }
                Num::parse(l.trim(), self.ibase)
            }
            Expr::Call(n, a) => self.call(n, a)?,
        })
    }

    fn call(&mut self, name: &str, args: &[Arg]) -> ER<Num> {
        let f = self.funcs.get(name).cloned().ok_or_else(|| format!("Function {name} not defined"))?;
        if f.params.len() != args.len() {
            return Err(Ctl::Err("Parameter number mismatch".into()));
        }
        let mut vals = Vec::new();
        for (a, (_, arr)) in args.iter().zip(&f.params) {
            vals.push(match (a, arr) {
                (Arg::E(e), false) => Val::N(self.eval(e)?),
                (Arg::A(n), true) => Val::A(self.arrs.get(n).and_then(|s| s.last()).cloned().unwrap_or_default()),
                _ => return Err(Ctl::Err("Parameter type mismatch".into())),
            });
        }
        if self.depth > 8000 {
            return Err(Ctl::Err("Function call nesting too deep".into()));
        }
        self.depth += 1;
        for ((n, _), v) in f.params.iter().zip(vals) {
            match v {
                Val::N(x) => self.vars.entry(n.clone()).or_default().push(x),
                Val::A(x) => self.arrs.entry(n.clone()).or_default().push(x),
            }
        }
        for (n, arr) in &f.autos {
            if *arr {
                self.arrs.entry(n.clone()).or_default().push(Arr::new());
            } else {
                self.vars.entry(n.clone()).or_default().push(Num::int(0));
            }
        }
        let mut ret = Ok(Num::int(0));
        for s in &f.body {
            match self.exec(s) {
                Ok(()) => {}
                Err(Ctl::Return(v)) => {
                    ret = Ok(v);
                    break;
                }
                Err(c) => {
                    ret = Err(c);
                    break;
                }
            }
        }
        let mut back = Vec::new();
        for (i, (p, a)) in f.params.iter().zip(args).enumerate() {
            if let (true, true, Arg::A(caller)) = (f.byref[i], p.1, a) {
                if let Some(v) = self.arrs.get(&p.0).and_then(|s| s.last()) {
                    back.push((caller.clone(), v.clone()));
                }
            }
        }
        for (n, arr) in f.params.iter().chain(&f.autos) {
            if *arr {
                if let Some(s) = self.arrs.get_mut(n) {
                    s.pop();
                }
            } else if let Some(s) = self.vars.get_mut(n) {
                s.pop();
            }
        }
        self.depth -= 1;
        for (n, v) in back {
            let st = self.arrs.entry(n).or_default();
            match st.last_mut() {
                Some(t) => *t = v,
                None => st.push(v),
            }
        }
        ret
    }

    fn exec(&mut self, s: &Stmt) -> ER<()> {
        match s {
            Stmt::Expr(e) => {
                let v = self.eval(e)?;
                if !matches!(e, Expr::Assign(..)) {
                    let t = v.fmt(self.obase);
                    self.put(&t, true);
                    self.put("\n", false);
                    self.last = v;
                }
            }
            Stmt::Str(t) => self.put(t, false),
            Stmt::Print(items) => {
                for it in items {
                    match it {
                        Item::S(t) => {
                            let t = unescape(t);
                            self.put(&t, false);
                        }
                        Item::E(e) => {
                            let v = self.eval(e)?;
                            let t = v.fmt(self.obase);
                            self.put(&t, true);
                            self.last = v;
                        }
                    }
                }
            }
            Stmt::Block(v) => {
                for s in v {
                    self.exec(s)?;
                }
            }
            Stmt::If(c, a, b) => {
                if !self.eval(c)?.is_zero() {
                    self.exec(a)?;
                } else if let Some(b) = b {
                    self.exec(b)?;
                }
            }
            Stmt::While(c, b) => {
                while !self.eval(c)?.is_zero() {
                    match self.exec(b) {
                        Err(Ctl::Break) => break,
                        Err(Ctl::Continue) | Ok(()) => {}
                        Err(e) => return Err(e),
                    }
                }
            }
            Stmt::For(i, c, n, b) => {
                if let Some(i) = i {
                    self.eval(i)?;
                }
                while c.as_ref().map_or(Ok(true), |c| self.eval(c).map(|v| !v.is_zero()))? {
                    match self.exec(b) {
                        Err(Ctl::Break) => break,
                        Err(Ctl::Continue) | Ok(()) => {}
                        Err(e) => return Err(e),
                    }
                    if let Some(n) = n {
                        self.eval(n)?;
                    }
                }
            }
            Stmt::Break => return Err(Ctl::Break),
            Stmt::Continue => return Err(Ctl::Continue),
            Stmt::Halt => return Err(Ctl::Halt),
            Stmt::Return(e) => {
                let v = e.as_ref().map_or_else(|| Ok(Num::int(0)), |e| self.eval(e))?;
                return Err(Ctl::Return(v));
            }
            Stmt::Limits => {
                let t = "BC_BASE_MAX     = 999\nBC_DIM_MAX      = 65535\nBC_SCALE_MAX    = 4294967295\nBC_STRING_MAX   = 4294967295\n";
                self.put(t, false);
            }
        }
        Ok(())
    }

    /// Run a whole program text; false when `quit`/`halt` ended it.
    fn run_src(&mut self, src: &str, name: &str) -> bool {
        let toks = match lex(src) {
            Ok(t) => t,
            Err(m) => {
                let _ = writeln!(self.err, "({name}) 1: {m}");
                return true;
            }
        };
        let mut p = P { t: toks, i: 0, ibase: self.ibase };
        loop {
            p.skip_nl();
            if *p.peek() == Tok::Eof {
                return true;
            }
            p.ibase = self.ibase;
            let line = p.line();
            if p.kw("define") {
                match p.define() {
                    Ok((n, f)) => {
                        self.funcs.insert(n, Rc::new(f));
                    }
                    Err(m) => self.syntax(&mut p, name, line, &m),
                }
                continue;
            }
            let quit = p.kw("quit");
            match p.stmt() {
                Ok(_) if quit => return false,
                Ok(s) => match self.exec(&s) {
                    Ok(()) | Err(Ctl::Break | Ctl::Continue | Ctl::Return(_)) => {}
                    Err(Ctl::Halt) => return false,
                    Err(Ctl::Err(m)) => {
                        self.cur.clear();
                        let _ = writeln!(self.err, "Runtime error (func=(main), adr=0): {m}");
                    }
                },
                Err(m) => self.syntax(&mut p, name, line, &m),
            }
        }
    }
    fn syntax(&mut self, p: &mut P, name: &str, line: u32, m: &str) {
        let _ = writeln!(self.err, "({name}) {line}: {m}");
        while !matches!(p.peek(), Tok::Nl | Tok::Eof) {
            p.i += 1;
        }
    }
}

fn unescape(s: &str) -> String {
    let mut o = String::new();
    let mut it = s.chars();
    while let Some(c) = it.next() {
        if c != '\\' {
            o.push(c);
            continue;
        }
        match it.next() {
            Some('a') => o.push('\x07'),
            Some('b') => o.push('\x08'),
            Some('e') => o.push('\x1b'),
            Some('f') => o.push('\x0c'),
            Some('n') => o.push('\n'),
            Some('r') => o.push('\r'),
            Some('t') => o.push('\t'),
            Some('q') => o.push('"'),
            Some('\\') | None => o.push('\\'),
            Some(x) => o.extend(['\\', x]),
        }
    }
    o
}

/// `s c a l e j`, accurate to `scale` digits (8 guard digits inside).
const LIBMATH: &str = r"
scale = 20
define e(x) {
  auto k, t, s, y, r, i, n, d
  s = scale
  if (x < 0) { n = 1; x = -x }
  scale = 0
  t = x / 1
  d = t * 5 / 11
  k = 0
  while (t > 1) { t = t / 2; k += 1 }
  scale = s + 8 + k + d
  y = x / 2^k
  r = 1; t = 1
  for (i = 1; 1; i += 1) { t = t * y / i; if (t == 0) break; r += t }
  for (i = 0; i < k; i += 1) r = r * r
  scale = s
  if (n) return (1 / r)
  return (r / 1)
}
define l(x) {
  auto s, f, z, w, t, r, i, b
  if (x <= 0) { return (1 - 10^scale) }
  s = scale
  scale = s + 8
  f = 1
  while (x >= 1.5) { x = sqrt(x); f *= 2 }
  while (x <= .5) { x = sqrt(x); f *= 2 }
  z = (x - 1) / (x + 1)
  w = z * z
  t = z; r = z
  for (i = 3; 1; i += 2) { t = t * w; b = t / i; if (b == 0) break; r += b }
  scale = s
  return (2 * f * r / 1)
}
define a(x) {
  auto s, f, t, w, r, i, b, n
  s = scale
  scale = s + 8
  if (x < 0) { n = 1; x = -x }
  f = 1
  while (x > .1) { x = x / (1 + sqrt(1 + x * x)); f *= 2 }
  w = x * x; t = x; r = x
  for (i = 3; 1; i += 2) { t = -t * w; b = t / i; if (b == 0) break; r += b }
  scale = s
  r = f * r / 1
  if (n) return (-r)
  return (r)
}
define s(x) {
  auto s, p, q, y, w, t, r, i, g
  s = scale
  scale = 0
  g = length(x / 1)
  scale = s + 8 + g
  p = 4 * a(1)
  q = 2 * p
  scale = 0
  t = x / q
  scale = s + 8 + g
  y = x - t * q
  if (y > p) y -= q
  if (y < -p) y += q
  if (y > p / 2) y = p - y
  if (y < -p / 2) y = -p - y
  w = y * y; t = y; r = y
  for (i = 3; 1; i += 2) { t = -t * w / (i * (i - 1)); if (t == 0) break; r += t }
  scale = s
  return (r / 1)
}
define c(x) {
  auto s, p, r
  s = scale
  scale = s + 8
  p = 4 * a(1)
  r = s(x + p / 2)
  scale = s
  return (r / 1)
}
define j(n, x) {
  auto s, m, a, t, e, i, d
  s = scale
  scale = 0
  n /= 1
  if (n < 0) { n = -n; if (n % 2 == 1) m = 1 }
  scale = s + 8
  a = 1
  for (i = 1; i <= n; i += 1) a *= i
  t = (x / 2)^n / a
  d = t; e = -x * x / 4
  for (i = 1; 1; i += 1) { t = t * e / (i * (n + i)); if (t == 0) break; d += t }
  scale = s
  if (m) return (-d / 1)
  return (d / 1)
}
";

const USAGE: &str = "usage: bc [options] [file ...]\n  -h  --help         print this usage and exit\n  -i  --interactive  force interactive mode\n  -l  --mathlib      use the predefined math routines\n  -q  --quiet        don't print initial banner\n  -s  --standard     non-POSIX goes to standard error\n  -w  --warn         warn for non-POSIX extensions\n  -v  --version      print version information and exit\n";

pub fn main() -> i32 {
    // Deep bc recursion needs a deep Rust stack.
    let h = std::thread::Builder::new().stack_size(1 << 29).spawn(|| {
        let stdin = std::io::stdin();
        run(std::env::args().skip(1).collect(), &mut stdin.lock(), &mut std::io::stdout().lock(), &mut std::io::stderr().lock())
    });
    h.ok().and_then(|h| h.join().ok()).unwrap_or(1)
}

pub fn run(args: Vec<String>, stdin: &mut dyn Read, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let (mut lib, mut files) = (false, Vec::new());
    for a in args {
        match a.as_str() {
            "-l" | "--mathlib" => lib = true,
            "--quiet" | "--standard" | "--warn" | "--interactive" => {}
            "-v" | "-V" | "--version" => {
                let _ = writeln!(out, "bc (aphrody-gnu) {}", env!("CARGO_PKG_VERSION"));
                return 0;
            }
            "-h" | "--help" => {
                let _ = out.write_all(USAGE.as_bytes());
                return 0;
            }
            s if s.starts_with('-') && s.len() > 1 && !s.starts_with("--") && s[1..].chars().all(|c| "lqswi".contains(c)) => lib |= s.contains('l'),
            s if s.starts_with('-') && s.len() > 1 => {
                let _ = write!(err, "bc: unknown option {s}\n{USAGE}");
                return 1;
            }
            _ => files.push(a),
        }
    }
    let width = std::env::var("BC_LINE_LENGTH").ok().and_then(|v| v.parse().ok()).unwrap_or(70);
    let mut b = Bc {
        scale: 0,
        ibase: 10,
        obase: 10,
        last: Num::int(0),
        vars: HashMap::new(),
        arrs: HashMap::new(),
        funcs: HashMap::new(),
        out,
        err,
        col: 0,
        width,
        depth: 0,
        stdin,
        cur: String::new(),
    };
    if lib {
        b.run_src(LIBMATH, "(math)");
    }
    for f in &files {
        match std::fs::read_to_string(f) {
            Ok(t) => {
                if !b.run_src(&t, f) {
                    return 0;
                }
            }
            Err(e) => {
                let _ = writeln!(b.err, "bc: cannot open file {f}: {e}");
                return 1;
            }
        }
    }
    let mut t = String::new();
    let _ = b.stdin.read_to_string(&mut t);
    b.run_src(&t, "standard_in");
    let _ = b.out.flush();
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bc(args: &[&str], src: &str) -> String {
        let (mut o, mut e) = (Vec::new(), Vec::new());
        let a = args.iter().map(|s| (*s).to_owned()).collect();
        run(a, &mut src.as_bytes(), &mut o, &mut e);
        String::from_utf8(o).unwrap() + &String::from_utf8(e).unwrap()
    }

    #[test]
    fn arithmetic() {
        assert_eq!(bc(&[], "1+2*3\n(1+2)*3\n7%3\n2^10\n-2^2\n10-3-2\n"), "7\n9\n1\n1024\n-4\n5\n");
        assert_eq!(bc(&[], "scale=3\n1/3\n2/3\n10/4\n1.5*1.5\n"), ".333\n.666\n2.500\n2.25\n");
        assert_eq!(bc(&[], "scale=2\n7%3\n-7/2\n2^-2\n"), ".01\n-3.50\n.25\n");
        assert_eq!(bc(&[], "scale=20\nsqrt(2)\n"), "1.41421356237309504880\n");
        assert_eq!(bc(&[], "2^200\n"), "1606938044258990275541962092341162602522202993782792835301376\n");
    }

    #[test]
    fn language() {
        assert_eq!(bc(&[], "x=5\nx\nx++\nx\n++x\nx*=2\nx\n"), "5\n5\n6\n7\n14\n");
        assert_eq!(bc(&[], "define f(n){if(n<2)return(1);return(n*f(n-1))}\nf(10)\nf(20)\n"), "3628800\n2432902008176640000\n");
        assert_eq!(bc(&[], "for(i=0;i<3;i++){i}\n"), "0\n1\n2\n");
        assert_eq!(bc(&[], "i=0\nwhile(i<3){i+=1;if(i==2)continue;i}\n"), "1\n3\n");
        assert_eq!(bc(&[], "a[1]=7;a[2]=8;a[1]+a[2]\n"), "15\n");
        assert_eq!(bc(&[], "define s(a[],n){auto i,t;for(i=0;i<n;i++)t+=a[i];return(t)}\nb[0]=1;b[1]=2;b[2]=3\ns(b[],3)\n"), "6\n");
        assert_eq!(bc(&[], "print \"x=\", 1+1, \"\\n\"\n\"hi\"\n"), "x=2\nhi");
        assert_eq!(bc(&[], "1<2\n2<1\n1&&0\n1||0\n!0\n"), "1\n0\n0\n1\n1\n");
        assert_eq!(bc(&[], "length(123.45)\nscale(1.500)\n1\nquit\n2\n"), "5\n3\n1\n");
    }

    #[test]
    fn bases() {
        assert_eq!(bc(&[], "obase=16\n255\n256\nobase=2\n10\n"), "FF\n100\n1010\n");
        assert_eq!(bc(&[], "ibase=16\nFF\nA0\n"), "255\n160\n");
        assert_eq!(bc(&[], "obase=100\n12345\n"), " 01 23 45\n");
    }

    #[test]
    fn errors_and_wrap() {
        assert!(bc(&[], "1/0\n").contains("Divide by zero"));
        assert!(bc(&[], "1+\n").contains("syntax error"));
        assert!(bc(&[], "sqrt(-1)\n").contains("Square root of a negative number"));
        let w = bc(&[], &format!("{}\n", "9".repeat(80)));
        assert_eq!(w, format!("{}\\\n{}\n", "9".repeat(68), "9".repeat(12)));
    }

    #[test]
    fn mathlib() {
        assert_eq!(bc(&["-l"], "4*a(1)\n"), "3.14159265358979323844\n");
        assert_eq!(bc(&["-l"], "e(1)\n"), "2.71828182845904523536\n");
        assert_eq!(bc(&["-l"], "s(1)\nc(1)\n"), ".84147098480789650665\n.54030230586813971740\n");
        assert_eq!(bc(&["-l"], "l(2)\n"), ".69314718055994530941\n");
        assert_eq!(bc(&["-l"], "e(-1)\n"), ".36787944117144232159\n");
        assert_eq!(bc(&["-l"], "j(0,1)\n"), ".76519768655796655144\n");
    }
}
