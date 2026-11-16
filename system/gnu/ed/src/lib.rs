//! `ed`: the POSIX line editor (addresses `. $ N +N -N /re/ ?re? 'x , ; %`; commands
//! `a i c d j m t k s g v G V p n l = w W r e E f q Q u h H P ! #` and the empty command).
//! Regular expressions are BRE (`crate::re`). Buffers are UTF-8 (invalid bytes become U+FFFD).
//! Errors print `?` (and the message after `h`, or at once after `H`); a second `q`/`e` forces.

use gnu_posix_re::{self as re, Regex};
use std::collections::VecDeque;
use std::io::{BufRead, IsTerminal, Write};

type R<T> = Result<T, String>;
type Line = (u64, String);

enum Flow {
    Next,
    Quit(i32),
}

struct Cur {
    c: Vec<char>,
    i: usize,
}

impl Cur {
    fn new(s: &str) -> Self {
        Self { c: s.chars().collect(), i: 0 }
    }
    fn peek(&self) -> Option<char> {
        self.c.get(self.i).copied()
    }
    fn next(&mut self) -> Option<char> {
        let c = self.peek();
        self.i += usize::from(c.is_some());
        c
    }
    fn ws(&mut self) {
        while matches!(self.peek(), Some(' ' | '\t')) {
            self.i += 1;
        }
    }
    fn rest(&self) -> String {
        self.c[self.i.min(self.c.len())..].iter().collect()
    }
    fn num(&mut self) -> Option<usize> {
        let s = self.i;
        while self.peek().is_some_and(|c| c.is_ascii_digit()) {
            self.i += 1;
        }
        (self.i > s).then(|| self.c[s..self.i].iter().collect::<String>().parse().unwrap_or(usize::MAX))
    }
}

struct Ed<'a> {
    buf: Vec<Line>,
    id: u64,
    cur: usize,
    file: String,
    dirty: bool,
    warned: bool,
    re: Option<Regex>,
    rep: String,
    shell: String,
    /// stdin ended inside a command or in input mode: behaves as `q` (status 2)
    eof_cut: bool,
    ere: bool,
    marks: [u64; 26],
    undo: Option<(Vec<Line>, usize)>,
    err: String,
    explain: bool,
    prompt: Option<String>,
    show_prompt: bool,
    silent: bool,
    in_g: bool,
    pending: VecDeque<String>,
    input: &'a mut dyn BufRead,
    out: &'a mut dyn Write,
}

fn lossy(b: &[u8]) -> String {
    String::from_utf8_lossy(b).into_owned()
}

impl Ed<'_> {
    fn line(&mut self) -> Option<String> {
        if let Some(l) = self.pending.pop_front() {
            return Some(l);
        }
        if self.in_g {
            return None;
        }
        let mut b = Vec::new();
        match self.input.read_until(b'\n', &mut b) {
            Ok(0) | Err(_) => None,
            Ok(_) => {
                if b.last() != Some(&b'\n') {
                    self.eof_cut = true;
                    return None;
                }
                b.pop();
                Some(lossy(&b))
            }
        }
    }

    fn mk(&mut self, s: String) -> Line {
        self.id += 1;
        (self.id, s)
    }

    fn snap(&mut self) {
        if !self.in_g {
            self.undo = Some((self.buf.clone(), self.cur));
        }
        self.dirty = true;
    }

    fn insert_at(&mut self, at: usize, lines: Vec<String>) {
        let n = lines.len();
        let ls: Vec<Line> = lines.into_iter().map(|s| self.mk(s)).collect();
        self.buf.splice(at..at, ls);
        self.cur = if n > 0 { at + n } else { self.cur };
    }

    fn text(&mut self) -> Vec<String> {
        let mut v = Vec::new();
        loop {
            match self.line() {
                Some(l) if l == "." => break,
                Some(l) => v.push(l),
                None => {
                    self.eof_cut = !self.in_g;
                    break;
                }
            }
        }
        v
    }

    fn regex(&mut self, d: char, c: &mut Cur) -> R<Option<Regex>> {
        let mut p = String::new();
        while let Some(ch) = c.next() {
            if ch == d {
                break;
            }
            if ch == '\\' {
                match c.next() {
                    Some(x) if x == d => p.push(x),
                    Some(x) => p.extend(['\\', x]),
                    None => return Err("Trailing backslash".into()),
                }
            } else {
                p.push(ch);
            }
        }
        if p.is_empty() {
            return if self.re.is_some() { Ok(None) } else { Err("No previous pattern".into()) };
        }
        let r = re::compile(&p, self.ere)?;
        self.re = Some(r.clone());
        Ok(Some(r))
    }

    fn search(&self, r: &Regex, fwd: bool) -> R<usize> {
        let n = self.buf.len();
        for k in 1..=n {
            let i = if fwd {
                (self.cur + k - 1) % n + 1
            } else {
                match (self.cur + n - k) % n {
                    0 => n,
                    j => j,
                }
            };
            if r.is_match(&self.buf[i - 1].1) {
                return Ok(i);
            }
        }
        Err("No match".into())
    }

    fn addr(&mut self, c: &mut Cur) -> R<Option<usize>> {
        c.ws();
        let mut a = match c.peek() {
            Some(d) if d.is_ascii_digit() => c.num(),
            Some('.') => {
                c.i += 1;
                Some(self.cur)
            }
            Some('$') => {
                c.i += 1;
                Some(self.buf.len())
            }
            Some(d @ ('/' | '?')) => {
                c.i += 1;
                let r = self.regex(d, c)?.or_else(|| self.re.clone()).ok_or("No previous pattern")?;
                Some(self.search(&r, d == '/')?)
            }
            Some('\'') => {
                c.i += 1;
                let k = c.next().filter(char::is_ascii_lowercase).ok_or("Invalid mark character")?;
                let id = self.marks[k as usize - 'a' as usize];
                Some(self.buf.iter().position(|l| l.0 == id).ok_or("Invalid address")? + 1)
            }
            Some('+' | '-') => Some(self.cur),
            _ => None,
        };
        loop {
            c.ws();
            let Some(base) = a else { return Ok(None) };
            match c.peek() {
                Some(s @ ('+' | '-')) => {
                    c.i += 1;
                    let n = c.num().unwrap_or(1);
                    a = Some(if s == '+' { base.saturating_add(n) } else { base.checked_sub(n).ok_or("Invalid address")? });
                }
                Some(d) if d.is_ascii_digit() => a = Some(base.saturating_add(c.num().unwrap_or(0))),
                _ => return Ok(a),
            }
        }
    }

    /// Up to two addresses (the last two given), `%` and lone `,` `;` expanded.
    fn range(&mut self, c: &mut Cur) -> R<Vec<usize>> {
        c.ws();
        if c.peek() == Some('%') {
            c.i += 1;
            return Ok(vec![1, self.buf.len()]);
        }
        let mut v: Vec<usize> = Vec::new();
        loop {
            let a = self.addr(c)?;
            c.ws();
            match (a, c.peek()) {
                (a, Some(s @ (',' | ';'))) => {
                    c.i += 1;
                    let a = a.unwrap_or(if s == ',' { 1 } else { self.cur });
                    if s == ';' {
                        if a > self.buf.len() {
                            return Err("Invalid address".into());
                        }
                        self.cur = a;
                    }
                    v.push(a);
                }
                (Some(a), _) => {
                    v.push(a);
                    break;
                }
                (None, _) => {
                    if !v.is_empty() {
                        v.push(self.buf.len());
                    }
                    break;
                }
            }
        }
        let k = v.len().saturating_sub(2);
        Ok(v.split_off(k))
    }

    fn suffix(c: &mut Cur) -> R<Option<char>> {
        let f = match c.peek() {
            Some(x @ ('p' | 'n' | 'l')) => {
                c.i += 1;
                Some(x)
            }
            _ => None,
        };
        if c.peek().is_some() { Err("Invalid command suffix".into()) } else { Ok(f) }
    }

    fn print(&mut self, a1: usize, a2: usize, mode: char) {
        for i in a1..=a2 {
            let s = self.buf[i - 1].1.clone();
            let _ = match mode {
                'n' => writeln!(self.out, "{i}\t{s}"),
                'l' => writeln!(self.out, "{}", unambiguous(&s)),
                _ => writeln!(self.out, "{s}"),
            };
        }
        self.cur = a2;
    }

    fn read_src(name: &str) -> R<(Vec<String>, usize)> {
        let bytes = if let Some(cmd) = name.strip_prefix('!') {
            let o = std::process::Command::new("sh").arg("-c").arg(cmd).output().map_err(|e| e.to_string())?;
            o.stdout
        } else {
            std::fs::read(name).map_err(|_| "Cannot open input file".to_string())?
        };
        let n = bytes.len();
        let mut ls: Vec<String> = lossy(&bytes).split('\n').map(str::to_owned).collect();
        if ls.last().is_some_and(String::is_empty) {
            ls.pop();
        }
        Ok((ls, n))
    }

    fn write_dst(&mut self, name: &str, a1: usize, a2: usize, append: bool) -> R<()> {
        let body: String = if a1 == 0 { String::new() } else { self.buf[a1 - 1..a2].iter().map(|l| format!("{}\n", l.1)).collect() };
        if let Some(cmd) = name.strip_prefix('!') {
            let mut ch = std::process::Command::new("sh")
                .arg("-c")
                .arg(cmd)
                .stdin(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| e.to_string())?;
            let _ = ch.stdin.take().map(|mut s| s.write_all(body.as_bytes()));
            let _ = ch.wait();
        } else {
            let mut f = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .append(append)
                .truncate(!append)
                .open(name)
                .map_err(|_| "Cannot open output file".to_string())?;
            f.write_all(body.as_bytes()).map_err(|_| "Cannot write file".to_string())?;
        }
        if !self.silent {
            let _ = writeln!(self.out, "{}", body.len());
        }
        Ok(())
    }

    fn fname(&mut self, c: &mut Cur) -> R<String> {
        if !matches!(c.peek(), None | Some(' ' | '\t' | '!')) {
            return Err("Unexpected command suffix".into());
        }
        c.ws();
        let r = c.rest();
        let r = r.trim_end().to_owned();
        if r.is_empty() {
            if self.file.is_empty() {
                return Err("No current filename".into());
            }
            return Ok(self.file.clone());
        }
        if !r.starts_with('!') && self.file.is_empty() {
            self.file.clone_from(&r);
        }
        Ok(r)
    }

    fn subst(&mut self, c: &mut Cur, a1: usize, a2: usize) -> R<Option<char>> {
        let d = c.next().filter(|d| !d.is_alphanumeric() && *d != ' ').ok_or("Invalid command suffix")?;
        let r = self.regex(d, c)?.or_else(|| self.re.clone()).ok_or("No previous pattern")?;
        let mut rep = String::new();
        loop {
            match c.next() {
                None => {
                    if rep.ends_with('\\') && !rep.ends_with("\\\\") {
                        rep.pop();
                        rep.push('\n');
                        rep.push_str(&self.line().ok_or("Unexpected end-of-file")?);
                        c.c = rep.chars().collect();
                        c.i = rep.chars().count();
                        continue;
                    }
                    break;
                }
                Some('\\') => match c.next() {
                    Some(x) if x == d => rep.push(x),
                    Some(x) => rep.extend(['\\', x]),
                    None => rep.push_str("\\\n"),
                },
                Some(x) if x == d => break,
                Some(x) => rep.push(x),
            }
        }
        if rep == "%" {
            rep.clone_from(&self.rep);
        }
        self.rep.clone_from(&rep);
        let (mut g, mut nth) = (false, 1);
        loop {
            match c.peek() {
                Some('g') => {
                    g = true;
                    c.i += 1;
                }
                Some(x) if x.is_ascii_digit() => nth = c.num().filter(|n| *n > 0).ok_or("Invalid command suffix")?,
                _ => break,
            }
        }
        if g && nth != 1 {
            return Err("Invalid command suffix".into());
        }
        let f = Self::suffix(c)?;
        let (was_dirty, was_undo) = (self.dirty, self.undo.clone());
        self.snap();
        let mut any = false;
        let mut last = a2;
        let mut i = a1;
        let mut end = a2;
        while i <= end && i <= self.buf.len() {
            let s = self.buf[i - 1].1.clone();
            let (mut out, mut pos, mut k, mut hit) = (String::new(), 0, 0, false);
            for cap in r.captures_iter(&s) {
                k += 1;
                let m = cap.get(0).ok_or("No match")?;
                if k >= nth && (g || k == nth) {
                    out.push_str(&s[pos..m.start()]);
                    out.push_str(&re::expand(&cap, &rep));
                    pos = m.end();
                    hit = true;
                    if !g {
                        break;
                    }
                }
            }
            if hit {
                any = true;
                out.push_str(&s[pos..]);
                let parts: Vec<String> = out.split('\n').map(str::to_owned).collect();
                let extra = parts.len() - 1;
                let first = parts[0].clone();
                self.buf[i - 1].1 = first;
                let tail: Vec<Line> = parts[1..].iter().map(|p| self.mk(p.clone())).collect();
                self.buf.splice(i..i, tail);
                i += extra;
                end += extra;
                last = i;
            }
            i += 1;
        }
        if !any {
            (self.dirty, self.undo) = (was_dirty, was_undo);
            return Err("No match".into());
        }
        self.cur = last;
        Ok(f)
    }

    fn global(&mut self, c: &mut Cur, a1: usize, a2: usize, inv: bool) -> R<()> {
        if self.in_g {
            return Err("Cannot nest global commands".into());
        }
        let d = c.next().ok_or("Invalid pattern delimiter")?;
        let r = self.regex(d, c)?.or_else(|| self.re.clone()).ok_or("No previous pattern")?;
        let mut cmds = c.rest();
        let mut ls: Vec<String> = Vec::new();
        loop {
            if cmds.ends_with('\\') && !cmds.ends_with("\\\\") {
                cmds.pop();
                ls.push(std::mem::take(&mut cmds));
                cmds = self.line().unwrap_or_default();
            } else {
                ls.push(cmds);
                break;
            }
        }
        if ls.len() == 1 && ls[0].is_empty() {
            ls[0] = "p".into();
        }
        let ids: Vec<u64> = self.buf[a1 - 1..a2].iter().filter(|l| r.is_match(&l.1) != inv).map(|l| l.0).collect();
        self.undo = Some((self.buf.clone(), self.cur));
        self.in_g = true;
        let mut res = Ok(());
        'o: for id in ids {
            let Some(p) = self.buf.iter().position(|l| l.0 == id) else { continue };
            self.cur = p + 1;
            self.pending = ls.iter().cloned().collect();
            while let Some(cmd) = self.pending.pop_front() {
                if let Err(e) = self.exec(&cmd) {
                    res = Err(e);
                    break 'o;
                }
            }
        }
        self.in_g = false;
        self.pending.clear();
        res
    }

    fn exec(&mut self, line: &str) -> R<Flow> {
        let warned = std::mem::take(&mut self.warned);
        let mut c = Cur::new(line);
        let ad = self.range(&mut c)?;
        let n = ad.len();
        c.ws();
        let cmd = c.next();
        let len = self.buf.len();
        let cur = self.cur;
        let (dflt1, dflt2) = match cmd {
            Some('j') => (cur, cur + 1),
            Some('w' | 'W' | 'g' | 'v' | 'G' | 'V') => (1, len),
            Some('=' | 'r') => (len, len),
            None => (cur + 1, cur + 1),
            _ => (cur, cur),
        };
        let (a1, a2) = match n {
            0 => (dflt1, dflt2),
            1 => (ad[0], ad[0]),
            _ => (ad[0], ad[1]),
        };
        let ok = a1 >= 1 && a1 <= a2 && a2 <= len;
        let zero = a2 == 0 && (matches!(cmd, Some('a' | 'i' | 'r')) || (len == 0 && n == 0 && matches!(cmd, Some('w' | 'W' | '='))));
        let no_addr = n == 0 && matches!(cmd, Some('e' | 'E' | 'f' | 'q' | 'Q' | 'h' | 'H' | 'P' | 'u' | '!' | '#'));
        if !(ok || zero || no_addr) {
            return Err("Invalid address".into());
        }
        let none_ok = |n: usize| if n > 0 { Err("Unexpected address".to_owned()) } else { Ok(()) };
        let mut flag = None;
        match cmd {
            None => {
                if a2 > len || a2 == 0 {
                    return Err("Invalid address".into());
                }
                self.print(a2, a2, 'p');
            }
            Some('#') => {}
            Some('a' | 'i') => {
                let k = cmd.unwrap_or('a');
                flag = Self::suffix(&mut c)?;
                let t = self.text();
                self.snap();
                let at = if k == 'a' { a2 } else { a2.saturating_sub(1) };
                if t.is_empty() && k == 'a' {
                    self.cur = at;
                }
                self.insert_at(at, t);
            }
            Some('c') => {
                flag = Self::suffix(&mut c)?;
                let t = self.text();
                self.snap();
                self.buf.drain(a1 - 1..a2);
                self.cur = a1.min(self.buf.len());
                self.insert_at(a1 - 1, t);
            }
            Some('d') => {
                flag = Self::suffix(&mut c)?;
                self.snap();
                self.buf.drain(a1 - 1..a2);
                self.cur = a1.min(self.buf.len());
            }
            Some('j') => {
                flag = Self::suffix(&mut c)?;
                if a1 != a2 {
                    self.snap();
                    let s: String = self.buf[a1 - 1..a2].iter().map(|l| l.1.as_str()).collect();
                    self.buf[a1 - 1].1 = s;
                    self.buf.drain(a1..a2);
                }
                self.cur = a1;
            }
            Some('k') => {
                c.ws();
                let k = c.next().filter(char::is_ascii_lowercase).ok_or("Invalid mark character")?;
                Self::suffix(&mut c)?;
                self.marks[k as usize - 'a' as usize] = self.buf[a2 - 1].0;
            }
            Some(k @ ('m' | 't')) => {
                let dest = self.addr(&mut c)?.unwrap_or(cur);
                flag = Self::suffix(&mut c)?;
                if dest > len || (k == 'm' && dest >= a1 && dest < a2) {
                    return Err("Invalid destination".into());
                }
                self.snap();
                let moved: Vec<Line> = self.buf[a1 - 1..a2].to_vec();
                let cnt = moved.len();
                if k == 'm' {
                    if dest >= a2 {
                        self.buf.splice(dest..dest, moved);
                        self.buf.drain(a1 - 1..a2);
                        self.cur = dest;
                    } else {
                        self.buf.drain(a1 - 1..a2);
                        self.buf.splice(dest..dest, moved);
                        self.cur = dest + cnt;
                    }
                } else {
                    let ls: Vec<String> = moved.into_iter().map(|l| l.1).collect();
                    self.insert_at(dest, ls);
                }
            }
            Some(p @ ('p' | 'n' | 'l')) => {
                Self::suffix(&mut c)?;
                self.print(a1, a2, p);
            }
            Some('=') => {
                Self::suffix(&mut c)?;
                let _ = writeln!(self.out, "{a2}");
            }
            Some('s') => flag = self.subst(&mut c, a1, a2)?,
            Some(g @ ('g' | 'v')) => {
                self.global(&mut c, a1, a2, g == 'v')?;
            }
            Some(g @ ('G' | 'V')) => {
                let d = c.next().ok_or("Invalid pattern delimiter")?;
                let r = self.regex(d, &mut c)?.or_else(|| self.re.clone()).ok_or("No previous pattern")?;
                let ids: Vec<u64> = self.buf[a1 - 1..a2].iter().filter(|l| r.is_match(&l.1) != (g == 'V')).map(|l| l.0).collect();
                for id in ids {
                    let Some(p) = self.buf.iter().position(|l| l.0 == id) else { continue };
                    self.print(p + 1, p + 1, 'p');
                    if let Some(cmd) = self.line()
                        && !cmd.is_empty()
                        && cmd != "&"
                    {
                        self.exec(&cmd)?;
                    }
                }
            }
            Some(w @ ('w' | 'W')) => {
                let append = w == 'W' || c.peek() == Some('>') && c.next().is_some();
                let quit = c.peek() == Some('q');
                if quit {
                    c.i += 1;
                }
                let name = self.fname(&mut c)?;
                let (x, y) = if n == 0 { (1, len) } else { (a1, a2) };
                self.write_dst(&name, if len == 0 { 0 } else { x }, y, append)?;
                self.dirty = false;
                if quit {
                    return Ok(Flow::Quit(0));
                }
            }
            Some('r') => {
                let name = self.fname(&mut c)?;
                let (ls, bytes) = Self::read_src(&name)?;
                self.snap();
                self.insert_at(a2, ls);
                if !self.silent {
                    let _ = writeln!(self.out, "{bytes}");
                }
            }
            Some(e @ ('e' | 'E')) => {
                none_ok(n)?;
                if e == 'e' && self.dirty && !warned {
                    self.warned = true;
                    return Err("Warning: buffer modified".into());
                }
                let name = self.fname(&mut c)?;
                let (ls, bytes) = Self::read_src(&name)?;
                self.buf.clear();
                self.cur = 0;
                self.insert_at(0, ls);
                self.undo = None;
                self.dirty = false;
                if !name.starts_with('!') {
                    self.file = name;
                }
                if !self.silent {
                    let _ = writeln!(self.out, "{bytes}");
                }
            }
            Some('f') => {
                none_ok(n)?;
                if !matches!(c.peek(), None | Some(' ' | '\t')) {
                    return Err("Unexpected command suffix".into());
                }
                c.ws();
                let r = c.rest();
                if !r.trim().is_empty() {
                    self.file = r.trim().to_owned();
                }
                if self.file.is_empty() {
                    return Err("No current filename".into());
                }
                let _ = writeln!(self.out, "{}", self.file);
            }
            Some('u') => {
                none_ok(n)?;
                let (b, k) = self.undo.take().ok_or("Nothing to undo")?;
                self.undo = Some((std::mem::replace(&mut self.buf, b), self.cur));
                self.cur = k.min(self.buf.len());
                self.dirty = true;
            }
            Some('h') => {
                none_ok(n)?;
                let _ = writeln!(self.out, "{}", self.err);
            }
            Some('H') => {
                none_ok(n)?;
                self.explain = !self.explain;
                if self.explain && !self.err.is_empty() {
                    let _ = writeln!(self.out, "{}", self.err);
                }
            }
            Some('P') => {
                none_ok(n)?;
                self.show_prompt = !self.show_prompt;
            }
            Some('!') => {
                let mut cmd = c.rest();
                if let Some(t) = cmd.strip_prefix('!') {
                    if self.shell.is_empty() {
                        return Err("No previous command".into());
                    }
                    cmd = format!("{}{t}", self.shell);
                }
                self.shell.clone_from(&cmd);
                let _ = self.out.flush();
                let _ = std::process::Command::new("sh").arg("-c").arg(&cmd).status();
                if !self.silent {
                    let _ = writeln!(self.out, "!");
                }
            }
            Some(q @ ('q' | 'Q')) => {
                none_ok(n)?;
                if q == 'q' && self.dirty && !warned {
                    self.warned = true;
                    return Err("Warning: buffer modified".into());
                }
                return Ok(Flow::Quit(0));
            }
            Some(_) => return Err("Unknown command".into()),
        }
        if let Some(f) = flag {
            if self.cur == 0 || self.cur > self.buf.len() {
                return Err("Invalid address".into());
            }
            self.print(self.cur, self.cur, f);
        }
        Ok(Flow::Next)
    }

}

/// `l` format: `\\`, `\a\b\f\n\r\t\v`, `\ooo` for other control/non-ASCII bytes, `$` at the end.
fn unambiguous(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        match b {
            b'\\' => o.push_str("\\\\"),
            7 => o.push_str("\\a"),
            8 => o.push_str("\\b"),
            12 => o.push_str("\\f"),
            b'\n' => o.push_str("\\n"),
            b'\r' => o.push_str("\\r"),
            b'\t' => o.push_str("\\t"),
            11 => o.push_str("\\v"),
            32..=126 => o.push(b as char),
            _ => o.push_str(&format!("\\{b:03o}")),
        }
    }
    o.push('$');
    o
}

pub fn main() -> i32 {
    let stdin = std::io::stdin();
    run(std::env::args().skip(1).collect(), &mut stdin.lock(), &mut std::io::stdout().lock())
}

const USAGE: &str = "Usage: ed [options] [[+line] file]

The file name may be preceded by '+line', '+/RE', or '+?RE' to set the current line to the
line number specified or to the first or last line matching the regular expression 'RE'.
Start edit by reading in 'file' if given. If 'file' begins with a '!', read output of a shell command.

Options:
  -h, --help                 display this help and exit
  -V, --version              output version information and exit
  -E, --extended-regexp      use extended regular expressions
  -G, --traditional          run in compatibility mode (accepted)
  -l, --loose-exit-status    exit with 0 status even if a command fails
  -p, --prompt=STRING        use STRING as an interactive prompt
  -q, --quiet, --silent      suppress diagnostics written to stderr
  -r, --restricted           accepted, no effect
  -s, --script               suppress byte counts and '!' prompt
  -v, --verbose              be verbose; equivalent to the 'H' command
      --strip-trailing-cr    accepted, no effect
      --unsafe-names         accepted, no effect

Exit status: 0 normal exit, 1 environmental problems (invalid command-line options, command failed),
2 problems with the input file (file not found, buffer modified, I/O errors).
Rust port of GNU ed (aphrody-gnu).
";

struct Opts {
    silent: bool,
    ere: bool,
    loose: bool,
    verbose: bool,
    prompt: Option<String>,
    file: Option<String>,
    start: Option<String>,
}

/// The GNU ed command line; `Err(code)` is an exit that already printed its message.
fn parse(args: Vec<String>, out: &mut dyn Write) -> Result<Opts, i32> {
    let mut o = Opts { silent: false, ere: false, loose: false, verbose: false, prompt: None, file: None, start: None };
    let mut it = args.into_iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--script" | "-" => o.silent = true,
            "--quiet" | "--silent" | "--traditional" | "--restricted" | "--strip-trailing-cr" | "--unsafe-names" => {}
            "--extended-regexp" => o.ere = true,
            "--loose-exit-status" => o.loose = true,
            "--verbose" => o.verbose = true,
            "--version" => {
                let _ = writeln!(out, "GNU ed 1.22.6 (Rust port: aphrody-gnu {})", env!("CARGO_PKG_VERSION"));
                return Err(0);
            }
            "--help" => {
                let _ = out.write_all(USAGE.as_bytes());
                return Err(0);
            }
            "--prompt" => o.prompt = it.next(),
            l if l.starts_with("--prompt=") => o.prompt = Some(l[9..].to_owned()),
            l if l.starts_with("--") => {
                let _ = write!(out, "ed: unrecognized option '{l}'\n{USAGE}");
                return Err(1);
            }
            l if l.starts_with('-') => {
                let cs: Vec<char> = l[1..].chars().collect();
                let mut k = 0;
                while k < cs.len() {
                    match cs[k] {
                        's' => o.silent = true,
                        'q' | 'G' | 'r' => {}
                        'E' => o.ere = true,
                        'l' => o.loose = true,
                        'v' => o.verbose = true,
                        'h' => {
                            let _ = out.write_all(USAGE.as_bytes());
                            return Err(0);
                        }
                        'V' => {
                            let _ = writeln!(out, "GNU ed 1.22.6 (Rust port: aphrody-gnu {})", env!("CARGO_PKG_VERSION"));
                            return Err(0);
                        }
                        'p' => {
                            o.prompt = if k + 1 < cs.len() { Some(cs[k + 1..].iter().collect()) } else { it.next() };
                            k = cs.len();
                            continue;
                        }
                        c => {
                            let _ = write!(out, "ed: invalid option -- '{c}'\n{USAGE}");
                            return Err(1);
                        }
                    }
                    k += 1;
                }
            }
            l if l.starts_with('+') && o.file.is_none() => o.start = Some(l[1..].to_owned()),
            l => o.file = Some(l.to_owned()),
        }
    }
    Ok(o)
}

pub fn run(args: Vec<String>, input: &mut dyn BufRead, out: &mut dyn Write) -> i32 {
    let o = match parse(args, out) {
        Ok(o) => o,
        Err(c) => return c,
    };
    let mut e = Ed {
        buf: Vec::new(),
        id: 0,
        cur: 0,
        file: String::new(),
        dirty: false,
        warned: false,
        re: None,
        rep: String::new(),
        shell: String::new(),
        eof_cut: false,
        ere: o.ere,
        marks: [0; 26],
        undo: None,
        err: String::new(),
        explain: o.verbose,
        show_prompt: o.prompt.is_some(),
        prompt: o.prompt,
        silent: o.silent,
        in_g: false,
        pending: VecDeque::new(),
        input,
        out,
    };
    let mut status = 0;
    if let Some(f) = o.file
        && let Err(m) = e.exec(&format!("e {f}"))
    {
        e.fail(&m);
        status = 2;
    }
    if let Some(sp) = o.start {
        let spec = match sp.chars().next() {
            Some(d @ ('/' | '?')) if !sp[1..].ends_with(d) => format!("{sp}{d}"),
            _ => sp,
        };
        let mut c = Cur::new(&spec);
        match e.addr(&mut c) {
            Ok(Some(a)) if (1..=e.buf.len()).contains(&a) => e.cur = a,
            Ok(_) => {
                e.fail("Invalid line number");
                status = 1;
            }
            Err(m) => {
                e.fail(&m);
                status = 1;
            }
        }
    }
    let end = |c: i32| if o.loose { 0 } else { c };
    loop {
        if e.show_prompt {
            let _ = write!(e.out, "{}", e.prompt.clone().unwrap_or_else(|| "*".into()));
            let _ = e.out.flush();
        }
        let Some(l) = e.line() else { break };
        match e.exec(&l) {
            Ok(Flow::Next) => {}
            Ok(Flow::Quit(c)) => return end(c.max(status)),
            Err(m) => {
                e.fail(&m);
                status = status.max(1);
                // a script (stdin is not a terminal) stops at its first failing command
                if !std::io::stdin().is_terminal() {
                    let _ = e.out.flush();
                    return end(status);
                }
            }
        }
    }
    let _ = e.out.flush();
    if e.dirty || e.eof_cut {
        status = status.max(2);
    }
    end(status)
}

impl Ed<'_> {
    fn fail(&mut self, m: &str) {
        self.err = m.to_owned();
        let _ = writeln!(self.out, "?");
        if self.explain {
            let _ = writeln!(self.out, "{m}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ed(script: &str, init: &str) -> String {
        let p = std::env::temp_dir().join(format!("gnu-ed-{}-{:x}", std::process::id(), script.len() * 31 + init.len()));
        std::fs::write(&p, init).unwrap();
        let f = p.to_str().unwrap().replace('\\', "/");
        let script = script.replace("F", &f);
        let script = if script.ends_with("q\nq\n") { script } else { format!("{}Q\n", &script[..script.len() - 2]) };
        let mut out = Vec::new();
        run(vec!["-s".into(), f], &mut script.as_bytes(), &mut out);
        let _ = std::fs::remove_file(&p);
        String::from_utf8(out).unwrap()
    }

    #[test]
    fn print_and_addresses() {
        assert_eq!(ed("2p\n$p\n1,2p\nq\n", "a\nb\nc\n"), "b\nc\na\nb\n");
        assert_eq!(ed("/b/p\n?a?p\n1;+1p\nq\n", "a\nb\nc\n"), "b\na\na\nb\n");
        assert_eq!(ed("2n\n,n\nq\n", "x\ny\n"), "2\ty\n1\tx\n2\ty\n");
    }

    #[test]
    fn edit_commands() {
        assert_eq!(ed("2d\n,p\nq\n", "a\nb\nc\n"), "a\nc\n");
        assert_eq!(ed("1a\nnew\n.\n,p\nq\n", "a\nb\n"), "a\nnew\nb\n");
        assert_eq!(ed("2i\nnew\n.\n,p\nq\n", "a\nb\n"), "a\nnew\nb\n");
        assert_eq!(ed("2c\nX\nY\n.\n,p\nq\n", "a\nb\nc\n"), "a\nX\nY\nc\n");
        assert_eq!(ed("1,2j\n,p\nq\n", "a\nb\nc\n"), "ab\nc\n");
        assert_eq!(ed("1m$\n,p\nq\n", "a\nb\nc\n"), "b\nc\na\n");
        assert_eq!(ed("1t$\n,p\nq\n", "a\nb\n"), "a\nb\na\n");
        assert_eq!(ed("1d\nu\n,p\nq\n", "a\nb\n"), "a\nb\n");
    }

    #[test]
    fn substitute_and_global() {
        assert_eq!(ed("s/a/X/g\np\nq\n", "banana\n"), "bXnXnX\n");
        assert_eq!(ed("s/a/X/2\np\nq\n", "banana\n"), "banXna\n");
        assert_eq!(ed("s/\\(b\\)\\(a\\)/\\2\\1/\np\nq\n", "bank\n"), "abnk\n");
        assert_eq!(ed("g/a/s/a/A/\n,p\nq\n", "a\nb\nab\n"), "A\nb\nAb\n");
        assert_eq!(ed("v/a/d\n,p\nq\n", "a\nb\nab\n"), "a\nab\n");
        assert_eq!(ed("g/b/a\\\nafter\\\n.\n,p\nq\n", "a\nb\n"), "a\nb\nafter\n");
    }

    #[test]
    fn errors_and_files() {
        assert_eq!(ed("9p\nq\n", "a\n"), "?\n");
        assert_eq!(ed("s/x/y/\nq\n", "a\n"), "?\n");
        assert_eq!(ed("H\nzz\nq\n", "a\n"), "?\nUnknown command\n");
        assert_eq!(ed("w F.out\nq\n", "a\n"), "");
        assert_eq!(ed("a\nz\n.\nq\nq\n", "a\n"), "?\n");
        assert_eq!(ed("1k a\n$a\nz\n.\n'ap\nq\n", "a\nb\n"), "a\n");
        assert_eq!(ed("l\nq\n", "a\tb\\\n"), "a\\tb\\\\$\n");
    }
}
