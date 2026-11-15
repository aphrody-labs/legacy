//! `m4`: the macro processor (GNU m4 1.4 core). Builtins: define undefine defn pushdef popdef
//! ifdef ifelse shift dnl divert undivert divnum len index substr translit regexp patsubst incr
//! decr eval changequote changecom include sinclude errprint m4exit m4wrap esyscmd syscmd sysval
//! maketemp mkstemp format builtin indir dumpdef traceon traceoff __file__ __line__ __program__.
//! Options: -D name[=val] -U name -I dir -P -G -Q -E -s (ignored: -Q -E -s -G). Regexps are BRE
//! (`crate::re`); text is handled in chars, not bytes.

use gnu_posix_re as re;
use std::collections::HashMap;
use std::io::{Read, Write};

const BUILTINS: &[&str] = &[
    "define", "undefine", "defn", "pushdef", "popdef", "ifdef", "ifelse", "shift", "dnl", "divert", "undivert", "divnum", "len", "index", "substr", "translit",
    "regexp", "patsubst", "incr", "decr", "eval", "changequote", "changecom", "include", "sinclude", "errprint", "m4exit", "m4wrap", "esyscmd", "syscmd",
    "sysval", "maketemp", "mkstemp", "format", "builtin", "indir", "dumpdef", "traceon", "traceoff", "debugmode", "debugfile", "__file__", "__line__",
    "__program__",
];

/// Builtins that stay literal when not followed by `(`.
const BLIND: &[&str] = &[
    "define", "undefine", "defn", "pushdef", "popdef", "ifdef", "ifelse", "shift", "len", "index", "substr", "translit", "regexp", "patsubst", "incr", "decr",
    "eval", "include", "sinclude", "errprint", "m4wrap", "esyscmd", "syscmd", "maketemp", "mkstemp", "format", "builtin", "indir",
];

#[derive(Clone)]
enum Def {
    Text(String),
    Builtin(&'static str),
}

struct Src {
    s: Vec<char>,
    i: usize,
    file: Option<String>,
    line: u32,
}

enum Tok {
    Word(String),
    Quoted(String),
    Comment(String),
    Ch(char),
    Eof,
}

struct M4<'a> {
    defs: HashMap<String, Vec<Def>>,
    inp: Vec<Src>,
    divs: Vec<String>,
    cur: i64,
    lq: String,
    rq: String,
    cb: String,
    ce: String,
    wrap: Vec<String>,
    sysval: i32,
    exit: Option<i32>,
    status: i32,
    inc: Vec<String>,
    prog: String,
    out: &'a mut dyn Write,
    err: &'a mut dyn Write,
}

/// `defn` of a builtin: `\u{E000}name\u{E001}`, kept opaque to the rescanner.
fn marker(q: &str) -> Option<&'static str> {
    let n = q.strip_prefix('\u{E000}')?.strip_suffix('\u{E001}')?;
    BUILTINS.iter().copied().find(|b| *b == n)
}

fn bytes_to_string(b: Vec<u8>) -> String {
    String::from_utf8_lossy(&b).into_owned()
}

impl M4<'_> {
    fn warn(&mut self, m: &str) {
        let (f, l) = self.pos();
        let _ = writeln!(self.err, "{}:{f}:{l}: {m}", self.prog);
        self.status = 1;
    }

    fn pos(&self) -> (String, u32) {
        self.inp.iter().rev().find_map(|s| s.file.clone().map(|f| (f, s.line))).unwrap_or_else(|| ("stdin".into(), 0))
    }

    fn push(&mut self, text: &str) {
        if !text.is_empty() {
            self.inp.push(Src { s: text.chars().collect(), i: 0, file: None, line: 0 });
        }
    }

    fn push_file(&mut self, text: &str, name: &str) {
        self.inp.push(Src { s: text.chars().collect(), i: 0, file: Some(name.to_owned()), line: 1 });
    }

    fn peek(&mut self) -> Option<char> {
        while let Some(t) = self.inp.last() {
            if t.i < t.s.len() {
                return Some(t.s[t.i]);
            }
            self.inp.pop();
        }
        None
    }

    fn next_char(&mut self) -> Option<char> {
        let c = self.peek()?;
        if let Some(t) = self.inp.last_mut() {
            t.i += 1;
            if c == '\n' && t.file.is_some() {
                t.line += 1;
            }
        }
        Some(c)
    }

    fn starts(&self, pat: &str) -> bool {
        if pat.is_empty() {
            return false;
        }
        let mut it = pat.chars();
        let mut want = it.next();
        for s in self.inp.iter().rev() {
            for c in &s.s[s.i.min(s.s.len())..] {
                match want {
                    Some(w) if w == *c => want = it.next(),
                    Some(_) => return false,
                    None => return true,
                }
            }
            if want.is_none() {
                return true;
            }
        }
        want.is_none()
    }

    fn eat(&mut self, pat: &str) {
        for _ in pat.chars() {
            self.next_char();
        }
    }

    fn next_tok(&mut self) -> Tok {
        let Some(c) = self.peek() else { return Tok::Eof };
        if c == '\u{E000}' {
            let mut s = String::new();
            while let Some(x) = self.next_char() {
                s.push(x);
                if x == '\u{E001}' {
                    break;
                }
            }
            return Tok::Quoted(s);
        }
        if self.starts(&self.lq.clone()) {
            let (lq, rq) = (self.lq.clone(), self.rq.clone());
            self.eat(&lq);
            let (mut depth, mut s) = (1, String::new());
            loop {
                if self.peek().is_none() {
                    self.warn("end of file in string");
                    return Tok::Quoted(s);
                }
                if self.starts(&rq) {
                    self.eat(&rq);
                    depth -= 1;
                    if depth == 0 {
                        return Tok::Quoted(s);
                    }
                    s.push_str(&rq);
                } else if self.starts(&lq) {
                    self.eat(&lq);
                    depth += 1;
                    s.push_str(&lq);
                } else if let Some(c) = self.next_char() {
                    s.push(c);
                }
            }
        }
        if !self.cb.is_empty() && self.starts(&self.cb.clone()) {
            let (cb, ce) = (self.cb.clone(), self.ce.clone());
            self.eat(&cb);
            let mut s = cb;
            while self.peek().is_some() {
                if self.starts(&ce) {
                    self.eat(&ce);
                    s.push_str(&ce);
                    break;
                }
                if let Some(c) = self.next_char() {
                    s.push(c);
                }
            }
            return Tok::Comment(s);
        }
        if c.is_alphabetic() || c == '_' {
            let mut w = String::new();
            while let Some(c) = self.peek() {
                if c.is_alphanumeric() || c == '_' {
                    w.push(c);
                    self.next_char();
                } else {
                    break;
                }
            }
            return Tok::Word(w);
        }
        self.next_char();
        Tok::Ch(c)
    }

    fn emit(&mut self, s: &str) {
        if self.cur >= 0 {
            let i = self.cur as usize;
            if self.divs.len() <= i {
                self.divs.resize(i + 1, String::new());
            }
            self.divs[i].push_str(s);
        }
    }

    fn lookup(&self, w: &str) -> Option<Def> {
        self.defs.get(w).and_then(|v| v.last()).cloned()
    }

    fn collect_args(&mut self) -> Vec<String> {
        let (mut args, mut cur, mut depth) = (Vec::new(), String::new(), 0);
        let mut lead = true;
        loop {
            if self.exit.is_some() {
                return args;
            }
            match self.next_tok() {
                Tok::Eof => {
                    self.warn("end of file in argument list");
                    args.push(cur);
                    return args;
                }
                Tok::Quoted(q) => {
                    cur.push_str(&q);
                    lead = false;
                }
                Tok::Comment(c) => cur.push_str(&c),
                Tok::Word(w) => {
                    let lit = self.lookup(&w).map_or(Some(w.clone()), |d| self.call(&w, &d));
                    if let Some(l) = lit {
                        cur.push_str(&l);
                        lead = false;
                    }
                }
                Tok::Ch('(') => {
                    depth += 1;
                    cur.push('(');
                    lead = false;
                }
                Tok::Ch(')') => {
                    if depth == 0 {
                        args.push(cur);
                        return args;
                    }
                    depth -= 1;
                    cur.push(')');
                }
                Tok::Ch(',') if depth == 0 => {
                    args.push(std::mem::take(&mut cur));
                    lead = true;
                }
                Tok::Ch(c) if lead && c.is_whitespace() => {}
                Tok::Ch(c) => {
                    cur.push(c);
                    lead = false;
                }
            }
        }
    }

    /// Expand one macro call, pushing the result back for rescanning. A blind builtin with no
    /// `(` stays literal: its name is returned for the caller to emit.
    fn call(&mut self, name: &str, d: &Def) -> Option<String> {
        if let Def::Builtin(b) = d
            && BLIND.contains(b)
            && self.peek() != Some('(')
        {
            return Some(name.to_owned());
        }
        let mut argv = vec![name.to_owned()];
        if !matches!(d, Def::Builtin("dnl")) && self.peek() == Some('(') {
            self.next_char();
            argv.extend(self.collect_args());
        }
        let r = self.invoke(d, &argv);
        self.push(&r);
        None
    }

    fn invoke(&mut self, d: &Def, argv: &[String]) -> String {
        match d {
            Def::Text(b) => self.subst(b, argv),
            Def::Builtin(n) => self.builtin(n, argv),
        }
    }

    fn quote(&self, s: &str) -> String {
        format!("{}{s}{}", self.lq, self.rq)
    }

    fn subst(&self, body: &str, a: &[String]) -> String {
        let c: Vec<char> = body.chars().collect();
        let mut o = String::new();
        let mut i = 0;
        while i < c.len() {
            if c[i] != '$' || i + 1 >= c.len() {
                o.push(c[i]);
                i += 1;
                continue;
            }
            match c[i + 1] {
                d @ '0'..='9' => {
                    o.push_str(a.get(d as usize - '0' as usize).map_or("", String::as_str));
                    i += 2;
                }
                '#' => {
                    o.push_str(&(a.len() - 1).to_string());
                    i += 2;
                }
                '*' => {
                    o.push_str(&a[1..].join(","));
                    i += 2;
                }
                '@' => {
                    o.push_str(&a[1..].iter().map(|x| self.quote(x)).collect::<Vec<_>>().join(","));
                    i += 2;
                }
                _ => {
                    o.push('$');
                    i += 1;
                }
            }
        }
        o
    }

    fn arg(a: &[String], n: usize) -> &str {
        a.get(n).map_or("", String::as_str)
    }

    fn define(&mut self, name: &str, body: &str, push: bool) {
        let d = marker(body).map_or_else(|| Def::Text(body.to_owned()), Def::Builtin);
        let st = self.defs.entry(name.to_owned()).or_default();
        match (push, st.last_mut()) {
            (false, Some(t)) => *t = d,
            _ => st.push(d),
        }
    }

    fn builtin(&mut self, n: &str, a: &[String]) -> String {
        let arg = |k: usize| Self::arg(a, k);
        let num = |k: usize| arg(k).trim().parse::<i64>().unwrap_or(0);
        match n {
            "define" | "pushdef" if a.len() > 1 => {
                self.define(&a[1], arg(2), n == "pushdef");
                String::new()
            }
            "undefine" => {
                a[1..].iter().for_each(|x| {
                    self.defs.remove(x);
                });
                String::new()
            }
            "popdef" => {
                for x in &a[1..] {
                    if let Some(s) = self.defs.get_mut(x) {
                        s.pop();
                        if s.is_empty() {
                            self.defs.remove(x);
                        }
                    }
                }
                String::new()
            }
            "defn" => a[1..]
                .iter()
                .map(|x| match self.lookup(x) {
                    Some(Def::Text(t)) => self.quote(&t),
                    Some(Def::Builtin(b)) => format!("\u{E000}{b}\u{E001}"),
                    None => String::new(),
                })
                .collect(),
            "ifdef" => {
                if self.defs.contains_key(arg(1)) { arg(2).to_owned() } else { arg(3).to_owned() }
            }
            "ifelse" => {
                let mut r = &a[1..];
                loop {
                    match r.len() {
                        0..=2 => return String::new(),
                        3 => return if r[0] == r[1] { r[2].clone() } else { String::new() },
                        _ if r[0] == r[1] => return r[2].clone(),
                        4 => return r[3].clone(),
                        _ => r = &r[3..],
                    }
                }
            }
            "shift" => a.iter().skip(2).map(|x| self.quote(x)).collect::<Vec<_>>().join(","),
            "dnl" => {
                while let Some(c) = self.next_char() {
                    if c == '\n' {
                        break;
                    }
                }
                String::new()
            }
            "divert" => {
                self.cur = if a.len() > 1 { num(1) } else { 0 };
                String::new()
            }
            "divnum" => self.cur.to_string(),
            "undivert" => {
                let ids: Vec<String> = if a.len() > 1 { a[1..].to_vec() } else { (1..self.divs.len()).map(|i| i.to_string()).collect() };
                for x in ids {
                    if let Ok(i) = x.trim().parse::<usize>() {
                        if i != self.cur as usize && i < self.divs.len() {
                            let t = std::mem::take(&mut self.divs[i]);
                            self.emit(&t);
                        }
                    } else {
                        match std::fs::read(&x) {
                            Ok(b) => self.emit(&bytes_to_string(b)),
                            Err(e) => self.warn(&format!("cannot undivert {x}: {e}")),
                        }
                    }
                }
                String::new()
            }
            "len" => arg(1).chars().count().to_string(),
            "index" => arg(1).find(arg(2)).map_or(-1, |b| arg(1)[..b].chars().count() as i64).to_string(),
            "substr" => {
                let c: Vec<char> = arg(1).chars().collect();
                let from = num(2).clamp(0, c.len() as i64) as usize;
                let len = if a.len() > 3 && !arg(3).is_empty() { num(3).max(0) as usize } else { c.len() };
                c[from..from.saturating_add(len).min(c.len())].iter().collect()
            }
            "translit" => translit(arg(1), arg(2), arg(3)),
            "regexp" | "patsubst" => self.regex_op(n == "patsubst", a),
            "incr" => (num(1) + 1).to_string(),
            "decr" => (num(1) - 1).to_string(),
            "eval" => match eval(arg(1)) {
                Ok(v) => radix(v, if a.len() > 2 && !arg(2).is_empty() { num(2) as u32 } else { 10 }, num(3).max(0) as usize),
                Err(e) => {
                    self.warn(&format!("eval: {e}"));
                    String::new()
                }
            },
            "changequote" => {
                (self.lq, self.rq) = match a.len() {
                    1 => ("`".into(), "'".into()),
                    2 => (arg(1).into(), "'".into()),
                    _ => (arg(1).into(), if arg(2).is_empty() { "'".into() } else { arg(2).into() }),
                };
                String::new()
            }
            "changecom" => {
                (self.cb, self.ce) = match a.len() {
                    1 => (String::new(), String::new()),
                    2 => (arg(1).into(), "\n".into()),
                    _ => (arg(1).into(), if arg(2).is_empty() { "\n".into() } else { arg(2).into() }),
                };
                String::new()
            }
            "include" | "sinclude" => {
                let f = arg(1).to_owned();
                let cands = std::iter::once(f.clone()).chain(self.inc.iter().map(|d| format!("{d}/{f}")));
                let hit = cands.into_iter().find_map(|p| std::fs::read(&p).ok().map(|b| (p, bytes_to_string(b))));
                match hit {
                    Some((p, t)) => self.push_file(&t, &p),
                    None if n == "include" => self.warn(&format!("cannot open `{f}': No such file or directory")),
                    None => {}
                }
                String::new()
            }
            "errprint" => {
                let _ = write!(self.err, "{}", a[1..].join(" "));
                String::new()
            }
            "m4exit" => {
                self.exit = Some(if a.len() > 1 { num(1) as i32 } else { 0 });
                self.inp.clear();
                String::new()
            }
            "m4wrap" => {
                self.wrap.push(a[1..].join(" "));
                String::new()
            }
            "esyscmd" | "syscmd" => {
                self.flush_div0();
                let mut c = std::process::Command::new("sh");
                c.arg("-c").arg(arg(1));
                if n == "esyscmd" {
                    return if let Ok(o) = c.output() {
                        self.sysval = o.status.code().unwrap_or(127);
                        bytes_to_string(o.stdout)
                    } else {
                        self.sysval = 127;
                        String::new()
                    };
                }
                self.sysval = c.status().map_or(127, |s| s.code().unwrap_or(127));
                String::new()
            }
            "sysval" => self.sysval.to_string(),
            "maketemp" | "mkstemp" => {
                let t = arg(1);
                let x = t.chars().rev().take_while(|c| *c == 'X').count();
                let stem = &t[..t.len() - x];
                for k in 0..10_000u32 {
                    let d = format!("{:0>x$}", std::process::id().wrapping_add(k));
                    let name = format!("{stem}{}", &d[d.len() - x..]);
                    if n == "maketemp" {
                        return name;
                    }
                    if std::fs::OpenOptions::new().write(true).create_new(true).open(&name).is_ok() {
                        return name;
                    }
                }
                String::new()
            }
            "format" => Self::format(a),
            "builtin" => {
                let nm = arg(1).trim_start_matches("m4_");
                if let Some(b) = BUILTINS.iter().find(|b| **b == nm) {
                    self.builtin(b, &a[1..])
                } else {
                    self.warn(&format!("undefined builtin `{}'", arg(1)));
                    String::new()
                }
            }
            "indir" => {
                if let Some(d) = self.lookup(arg(1)) {
                    self.invoke(&d, &a[1..])
                } else {
                    self.warn(&format!("undefined macro `{}'", arg(1)));
                    String::new()
                }
            }
            "dumpdef" => {
                let names: Vec<String> = if a.len() > 1 { a[1..].to_vec() } else { self.defs.keys().cloned().collect() };
                for x in names {
                    let t = match self.lookup(&x) {
                        Some(Def::Text(t)) => format!("{x}:\t{}{t}{}", self.lq, self.rq),
                        Some(Def::Builtin(b)) => format!("{x}:\t<{b}>"),
                        None => continue,
                    };
                    let _ = writeln!(self.err, "{t}");
                }
                String::new()
            }
            "__file__" => self.pos().0,
            "__line__" => self.pos().1.to_string(),
            "__program__" => self.prog.clone(),
            _ => String::new(),
        }
    }

    fn regex_op(&mut self, sub: bool, a: &[String]) -> String {
        let (s, pat) = (Self::arg(a, 1), Self::arg(a, 2));
        let re = match re::compile(pat, false) {
            Ok(r) => r,
            Err(e) => {
                self.warn(&format!("bad regular expression `{pat}': {e}"));
                return String::new();
            }
        };
        let rep = a.get(3).map(String::as_str);
        if sub {
            let mut o = String::new();
            let mut last = 0;
            for c in re.captures_iter(s) {
                if let Some(m) = c.get(0) {
                    o.push_str(&s[last..m.start()]);
                    o.push_str(&m4_expand(&c, rep.unwrap_or("")));
                    last = m.end();
                }
            }
            o.push_str(&s[last..]);
            return o;
        }
        match (re.captures(s), rep) {
            (Some(c), Some(r)) => m4_expand(&c, r),
            (Some(c), None) => c.get(0).map_or(-1, |m| s[..m.start()].chars().count() as i64).to_string(),
            (None, Some(_)) => String::new(),
            (None, None) => "-1".into(),
        }
    }

    fn format(a: &[String]) -> String {
        let f: Vec<char> = Self::arg(a, 1).chars().collect();
        let (mut o, mut i, mut k) = (String::new(), 0, 2);
        while i < f.len() {
            if f[i] != '%' {
                o.push(f[i]);
                i += 1;
                continue;
            }
            i += 1;
            let (mut left, mut zero, mut plus, mut space) = (false, false, false, false);
            while let Some(c) = f.get(i) {
                match c {
                    '-' => left = true,
                    '0' => zero = true,
                    '+' => plus = true,
                    ' ' => space = true,
                    _ => break,
                }
                i += 1;
            }
            let num = |i: &mut usize| {
                let s = *i;
                while f.get(*i).is_some_and(char::is_ascii_digit) {
                    *i += 1;
                }
                f[s..*i].iter().collect::<String>().parse::<usize>().ok()
            };
            let width = num(&mut i).unwrap_or(0);
            let prec = if f.get(i) == Some(&'.') {
                i += 1;
                Some(num(&mut i).unwrap_or(0))
            } else {
                None
            };
            while matches!(f.get(i), Some('l' | 'h')) {
                i += 1;
            }
            let Some(&c) = f.get(i) else { break };
            i += 1;
            if c == '%' {
                o.push('%');
                continue;
            }
            let v = Self::arg(a, k).to_owned();
            k += 1;
            let iv = || v.trim().parse::<i64>().unwrap_or(0);
            let sign = |n: bool| if n { "-" } else if plus { "+" } else if space { " " } else { "" };
            let body = match c {
                's' => prec.map_or_else(|| v.clone(), |p| v.chars().take(p).collect()),
                'c' => v.chars().next().map_or_else(String::new, String::from),
                'd' | 'i' => format!("{}{}", sign(iv() < 0), iv().unsigned_abs()),
                'u' => (iv() as u64).to_string(),
                'x' => format!("{:x}", iv()),
                'X' => format!("{:X}", iv()),
                'o' => format!("{:o}", iv()),
                'e' | 'f' | 'g' => {
                    let x = v.trim().parse::<f64>().unwrap_or(0.0);
                    let p = prec.unwrap_or(6);
                    let s = match c {
                        'e' => format!("{x:.p$e}"),
                        'f' => format!("{x:.p$}"),
                        _ => format!("{x}"),
                    };
                    if x >= 0.0 && plus { format!("+{s}") } else { s }
                }
                _ => continue,
            };
            let n = body.chars().count();
            if n >= width {
                o.push_str(&body);
            } else if left {
                o.push_str(&body);
                o.push_str(&" ".repeat(width - n));
            } else if zero && c != 's' && c != 'c' {
                let (sg, dg) = body.split_at(usize::from(body.starts_with(['-', '+', ' '])));
                o.push_str(sg);
                o.push_str(&"0".repeat(width - n));
                o.push_str(dg);
            } else {
                o.push_str(&" ".repeat(width - n));
                o.push_str(&body);
            }
        }
        o
    }

    fn flush_div0(&mut self) {
        if let Some(d) = self.divs.first_mut() {
            let _ = self.out.write_all(d.as_bytes());
            d.clear();
        }
        let _ = self.out.flush();
    }

    fn run(&mut self) {
        loop {
            if self.exit.is_some() {
                break;
            }
            match self.next_tok() {
                Tok::Eof => {
                    if self.wrap.is_empty() {
                        break;
                    }
                    let w = std::mem::take(&mut self.wrap).concat();
                    self.push(&w);
                }
                Tok::Word(w) => {
                    if let Some(l) = self.lookup(&w).map_or(Some(w.clone()), |d| self.call(&w, &d)) {
                        self.emit(&l);
                    }
                }
                Tok::Quoted(q) => match marker(&q) {
                    Some(b) => {
                        self.call(b, &Def::Builtin(b));
                    }
                    None => self.emit(&q),
                },
                Tok::Comment(c) => self.emit(&c),
                Tok::Ch(c) => self.emit(&c.to_string()),
            }
        }
    }
}

/// `\N` group, `\&` whole match, `\\` backslash; everything else literal.
fn m4_expand(c: &re::Captures<'_>, rep: &str) -> String {
    let mut o = String::new();
    let mut it = rep.chars();
    while let Some(ch) = it.next() {
        if ch != '\\' {
            o.push(ch);
            continue;
        }
        match it.next() {
            Some('&') => o.push_str(c.get(0).map_or("", |m| m.as_str())),
            Some(d @ '0'..='9') => o.push_str(c.get(d as usize - '0' as usize).map_or("", |m| m.as_str())),
            Some('\\') | None => o.push('\\'),
            Some(x) => o.extend(['\\', x]),
        }
    }
    o
}

fn ranges(s: &str) -> Vec<char> {
    let c: Vec<char> = s.chars().collect();
    let (mut o, mut i) = (Vec::new(), 0);
    while i < c.len() {
        if i + 2 < c.len() && c[i + 1] == '-' && c[i] <= c[i + 2] {
            o.extend(c[i]..=c[i + 2]);
            i += 3;
        } else {
            o.push(c[i]);
            i += 1;
        }
    }
    o
}

fn translit(s: &str, from: &str, to: &str) -> String {
    let (f, t) = (ranges(from), ranges(to));
    s.chars()
        .filter_map(|c| match f.iter().position(|x| *x == c) {
            None => Some(c),
            Some(p) => t.get(p).copied(),
        })
        .collect()
}

fn radix(v: i64, base: u32, width: usize) -> String {
    let base = base.clamp(2, 36);
    let neg = v < 0;
    let mut u = v.unsigned_abs();
    let mut d = Vec::new();
    while u > 0 {
        d.push(char::from_digit((u % u64::from(base)) as u32, base).unwrap_or('0'));
        u /= u64::from(base);
    }
    if d.is_empty() {
        d.push('0');
    }
    while d.len() < width {
        d.push('0');
    }
    format!("{}{}", if neg { "-" } else { "" }, d.iter().rev().collect::<String>())
}

/// Integer expressions: `** * / % + - << >> < <= > >= == != & ^ | && || ! ~ ()` and `?:` is absent
/// in m4. Literals: decimal, `0x` hex, `0b` binary, leading-0 octal.
fn eval(s: &str) -> Result<i64, String> {
    struct E<'a> {
        c: &'a [u8],
        i: usize,
    }
    impl E<'_> {
        fn ws(&mut self) {
            while self.c.get(self.i).is_some_and(u8::is_ascii_whitespace) {
                self.i += 1;
            }
        }
        fn op(&mut self, o: &str) -> bool {
            self.ws();
            let b = o.as_bytes();
            let hit = self.c[self.i..].starts_with(b);
            // do not take `<` of `<<`/`<=`, `&` of `&&`, `|` of `||`, `*` of `**`
            let long = [b"<<", b"<=", b">>", b">=", b"&&", b"||", b"**", b"==", b"!="];
            let clash = b.len() == 1 && long.iter().any(|l| self.c[self.i..].starts_with(*l) && l[0] == b[0]);
            if hit && !clash {
                self.i += b.len();
            }
            hit && !clash
        }
        fn bin(&mut self, lvl: usize) -> Result<i64, String> {
            const L: [&[&str]; 9] = [&["||"], &["&&"], &["|"], &["^"], &["&"], &["==", "!="], &["<=", ">=", "<", ">"], &["<<", ">>"], &["+", "-"]];
            if lvl == L.len() {
                return self.mul();
            }
            let mut l = self.bin(lvl + 1)?;
            'o: loop {
                for o in L[lvl] {
                    if self.op(o) {
                        let r = self.bin(lvl + 1)?;
                        l = match *o {
                            "||" => i64::from(l != 0 || r != 0),
                            "&&" => i64::from(l != 0 && r != 0),
                            "|" => l | r,
                            "^" => l ^ r,
                            "&" => l & r,
                            "==" => i64::from(l == r),
                            "!=" => i64::from(l != r),
                            "<=" => i64::from(l <= r),
                            ">=" => i64::from(l >= r),
                            "<" => i64::from(l < r),
                            ">" => i64::from(l > r),
                            "<<" => l.wrapping_shl(r as u32),
                            ">>" => l.wrapping_shr(r as u32),
                            "+" => l.wrapping_add(r),
                            _ => l.wrapping_sub(r),
                        };
                        continue 'o;
                    }
                }
                return Ok(l);
            }
        }
        fn mul(&mut self) -> Result<i64, String> {
            let mut l = self.pow()?;
            loop {
                let o = if self.op("*") { '*' } else if self.op("/") { '/' } else if self.op("%") { '%' } else { return Ok(l) };
                let r = self.pow()?;
                l = match o {
                    '*' => l.wrapping_mul(r),
                    _ if r == 0 => return Err("divide by zero".into()),
                    '/' => l.wrapping_div(r),
                    _ => l.wrapping_rem(r),
                };
            }
        }
        fn pow(&mut self) -> Result<i64, String> {
            let b = self.un()?;
            if self.op("**") {
                let e = self.pow()?;
                if e < 0 {
                    return Err("negative exponent".into());
                }
                return Ok(b.wrapping_pow(e.min(i64::from(u32::MAX)) as u32));
            }
            Ok(b)
        }
        fn un(&mut self) -> Result<i64, String> {
            if self.op("-") {
                return Ok(self.un()?.wrapping_neg());
            }
            if self.op("+") {
                return self.un();
            }
            if self.op("~") {
                return Ok(!self.un()?);
            }
            if self.op("!") {
                return Ok(i64::from(self.un()? == 0));
            }
            if self.op("(") {
                let v = self.bin(0)?;
                return if self.op(")") { Ok(v) } else { Err("missing )".into()) };
            }
            self.ws();
            let st = self.i;
            while self.c.get(self.i).is_some_and(|c| c.is_ascii_alphanumeric()) {
                self.i += 1;
            }
            let t = std::str::from_utf8(&self.c[st..self.i]).unwrap_or("");
            let r = if let Some(h) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
                i64::from_str_radix(h, 16)
            } else if let Some(b) = t.strip_prefix("0b") {
                i64::from_str_radix(b, 2)
            } else if t.len() > 1 && t.starts_with('0') {
                i64::from_str_radix(&t[1..], 8)
            } else {
                t.parse()
            };
            r.map_err(|_| format!("bad expression at `{}'", String::from_utf8_lossy(&self.c[st..])))
        }
    }
    let mut e = E { c: s.as_bytes(), i: 0 };
    let v = e.bin(0)?;
    e.ws();
    if e.i < e.c.len() { Err(format!("excess input `{}'", String::from_utf8_lossy(&e.c[e.i..]))) } else { Ok(v) }
}

const USAGE: &str = "Usage: m4 [OPTION]... [FILE]...\n  -D, --define=NAME[=VALUE]  define NAME as having VALUE, or empty\n  -U, --undefine=NAME        undefine NAME\n  -I, --include=DIRECTORY    append DIRECTORY to include path\n  -P, --prefix-builtins      force a `m4_' prefix to all builtins\n  -G, --traditional, -Q, -E, -s: accepted, no effect\n";

pub fn main() -> i32 {
    let stdin = std::io::stdin();
    run(std::env::args().skip(1).collect(), &mut stdin.lock(), &mut std::io::stdout().lock(), &mut std::io::stderr().lock())
}

pub fn run(args: Vec<String>, stdin: &mut dyn Read, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let (mut pre, mut inc, mut files) = (Vec::new(), Vec::new(), Vec::new());
    let (mut prefix, mut it) = (false, args.into_iter());
    while let Some(a) = it.next() {
        let mut val = |short: &str, long: &str| -> Option<String> {
            if a == short {
                it.next()
            } else if let Some(v) = a.strip_prefix(long).and_then(|v| v.strip_prefix('=')) {
                Some(v.to_owned())
            } else {
                a.strip_prefix(short).filter(|v| !v.is_empty() && !short.is_empty() && !a.starts_with("--")).map(str::to_owned)
            }
        };
        if let Some(v) = val("-D", "--define") {
            pre.push((true, v));
        } else if let Some(v) = val("-U", "--undefine") {
            pre.push((false, v));
        } else if let Some(v) = val("-I", "--include") {
            inc.push(v);
        } else {
            match a.as_str() {
                "-P" | "--prefix-builtins" => prefix = true,
                "-G" | "-Q" | "-E" | "-s" | "-e" | "--traditional" | "--quiet" | "--silent" | "--fatal-warnings" | "--synclines" | "--warnings" | "--interactive" => {}
                // GNU options read and ignored: debugging, tracing, limits, frozen state (not implemented)
                "-l" | "-o" | "-L" | "-t" | "-H" | "-N" | "-F" | "-R" | "-W" | "-B" | "-S" | "-T" => {
                    it.next();
                }
                s if s.starts_with("-d")
                    || ["--debug", "--debugfile", "--arglength", "--nesting-limit", "--hashsize", "--diversions", "--trace", "--freeze-state", "--reload-state", "--word-regexp"]
                        .iter()
                        .any(|o| s == *o || s.starts_with(&format!("{o}="))) => {}
                "--version" => {
                    let _ = writeln!(out, "m4 (aphrody-gnu) {}", env!("CARGO_PKG_VERSION"));
                    return 0;
                }
                "--help" => {
                    let _ = out.write_all(USAGE.as_bytes());
                    return 0;
                }
                "-" => files.push(a),
                s if s.starts_with('-') && s.len() > 1 => {
                    let _ = write!(err, "m4: invalid option '{s}'\n{USAGE}");
                    return 1;
                }
                _ => files.push(a),
            }
        }
    }
    // include search path: -I directories, then $M4PATH
    inc.extend(std::env::var("M4PATH").unwrap_or_default().split(':').filter(|d| !d.is_empty()).map(str::to_owned));
    let mut m = M4 {
        defs: HashMap::new(),
        inp: Vec::new(),
        divs: vec![String::new()],
        cur: 0,
        lq: "`".into(),
        rq: "'".into(),
        cb: "#".into(),
        ce: "\n".into(),
        wrap: Vec::new(),
        sysval: 0,
        exit: None,
        status: 0,
        inc,
        prog: "m4".into(),
        out,
        err,
    };
    for b in BUILTINS {
        let k = if prefix { format!("m4_{b}") } else { (*b).to_owned() };
        m.defs.insert(k, vec![Def::Builtin(b)]);
    }
    for k in ["__gnu__", "__unix__"] {
        m.defs.insert(k.into(), vec![Def::Text(String::new())]);
    }
    for (def, v) in pre {
        if def {
            let (k, b) = v.split_once('=').unwrap_or((&v, ""));
            m.define(k, b, false);
        } else {
            m.defs.remove(&v);
        }
    }
    if files.is_empty() {
        files.push("-".into());
    }
    for f in files.iter().rev() {
        let text = if f == "-" {
            let mut b = Vec::new();
            let _ = stdin.read_to_end(&mut b);
            Ok(bytes_to_string(b))
        } else {
            std::fs::read(f).map(bytes_to_string)
        };
        match text {
            Ok(t) => m.push_file(&t, if f == "-" { "stdin" } else { f }),
            Err(e) => {
                let _ = writeln!(m.err, "m4: cannot open `{f}': {e}");
                m.status = 1;
            }
        }
    }
    m.run();
    let mut all = std::mem::take(&mut m.divs);
    all.resize(all.len().max(1), String::new());
    let tail: String = all[1..].concat();
    m.divs = vec![std::mem::take(&mut all[0]) + &tail];
    m.flush_div0();
    m.exit.unwrap_or(m.status)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m4(args: &[&str], src: &str) -> String {
        let (mut o, mut e) = (Vec::new(), Vec::new());
        run(args.iter().map(|s| (*s).to_owned()).collect(), &mut src.as_bytes(), &mut o, &mut e);
        String::from_utf8(o).unwrap()
    }

    #[test]
    fn define_and_args() {
        assert_eq!(m4(&[], "define(`x', `[$1|$2|$#|$*]')x(a, b)x\n"), "[a|b|2|a,b][||0|]\n");
        assert_eq!(m4(&[], "define(`sq', `eval($1*$1)')sq(7)\n"), "49\n");
        assert_eq!(m4(&[], "define(`a',`b')define(`b',`c')a\n"), "c\n");
        assert_eq!(m4(&[], "pushdef(`x',1)pushdef(`x',2)x popdef(`x')x\n"), "2 1\n");
        assert_eq!(m4(&[], "define(`x',1)undefine(`x')x\n"), "x\n");
    }

    #[test]
    fn quoting_and_comments() {
        assert_eq!(m4(&[], "`hello' `a`b'c'\n"), "hello a`b'c\n");
        assert_eq!(m4(&[], "# comment define(`x',1)\nx\n"), "# comment define(`x',1)\nx\n");
        assert_eq!(m4(&[], "changequote([,])define([x],[y])x [z]\n"), "y z\n");
        assert_eq!(m4(&[], "a dnl hidden\nb\n"), "a b\n");
    }

    #[test]
    fn conditionals_and_strings() {
        assert_eq!(m4(&[], "ifdef(`x',yes,no)`'define(`x')ifdef(`x',yes,no)\n"), "noyes\n");
        assert_eq!(m4(&[], "ifelse(a,a,1,2)ifelse(a,b,1,2)ifelse(a,b,1,c,d,3,4)\n"), "124\n");
        assert_eq!(m4(&[], "len(hello)index(hello,ll)substr(hello,1,3)`'translit(hello,a-y,b-z)\n"), "52ellifmmp\n");
        assert_eq!(m4(&[], "shift(a,b,c)\n"), "b,c\n");
        assert_eq!(m4(&[], "incr(4) decr(4) eval(2**10) eval(255,16) eval(5,2,8) eval(1+2*3)\n"), "5 3 1024 ff 00000101 7\n");
    }

    #[test]
    fn regex_and_diversions() {
        assert_eq!(m4(&[], "regexp(abcde,c.)regexp(abc,x)regexp(abc,\\(b\\)c,[\\1])\n"), "2-1[b]\n");
        assert_eq!(m4(&[], "patsubst(banana,a,o)`'patsubst(banana,\\(a\\)n,<\\1>)\n"), "bonono b<a><a>a\n".replace(' ', ""));
        assert_eq!(m4(&[], "divert(1)one\ndivert(0)two\nundivert(1)\n"), "two\none\n\n");
        assert_eq!(m4(&[], "divert(2)b\ndivert(1)a\ndivert\nend\n"), "\nend\na\nb\n");
    }

    #[test]
    fn misc_builtins() {
        assert_eq!(m4(&[], "format(`%d-%s-%05.1f|%-3s|%x', 7, abc, 3.14159, z, 255)\n"), "7-abc-003.1|z  |ff\n");
        assert_eq!(m4(&[], "m4wrap(`bye\n')hi\n"), "hi\nbye\n");
        assert_eq!(m4(&["-DX=5"], "X define\n"), "5 define\n");
        assert_eq!(m4(&["-P"], "m4_define(`a',1)a define\n"), "1 define\n");
        assert_eq!(m4(&[], "define(`d',defn(`define'))d(`z',3)z\n"), "3\n");
        assert_eq!(m4(&[], "esyscmd(`echo hi')sysval\n"), "hi\n0\n");
        assert_eq!(m4(&[], "__line__\n__file__\n"), "1\nstdin\n");
    }
}
