//! Unicode MessageFormat 2 evaluator (the subset the shared catalogs use, with the spec's selection algorithm):
//! text and escapes, `{$var}` / `{|literal|}` placeholders, `:number` `:integer` `:string` with no options,
//! `.input`, `.local`, `.match` with any number of selectors, `{{ }}` quoted patterns, `*` catch-all keys.
//! Anything else (markup, other functions, function options, attributes, `.` reserved statements) is rejected with
//! an error that names it; nothing is silently approximated. Plural categories and number formatting come from ICU4X.

use crate::{Arg, Args, SyntaxError};
use icu_decimal::DecimalFormatter;
use icu_decimal::input::Decimal;
use icu_locale::Locale;
use icu_plurals::{PluralCategory, PluralRules};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
enum Operand {
    Var(String),
    Lit(String),
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Func {
    Number,
    Integer,
    StringFn,
}

#[derive(Debug, Clone, PartialEq)]
struct Expr {
    operand: Option<Operand>,
    func: Option<Func>,
}

#[derive(Debug, Clone, PartialEq)]
enum Part {
    Text(String),
    Expr(Expr),
}
type Pattern = Vec<Part>;

#[derive(Debug, Clone, PartialEq)]
enum Key {
    Lit(String),
    Star,
}

#[derive(Debug, Clone)]
enum Decl {
    Input(String, Expr),
    Local(String, Expr),
}

#[derive(Debug, Clone)]
pub(crate) struct Message {
    decls: Vec<Decl>,
    selectors: Vec<String>,
    variants: Vec<(Vec<Key>, Pattern)>,
    pattern: Pattern,
}

struct P {
    s: Vec<char>,
    i: usize,
}

fn err<T>(m: impl Into<String>) -> Result<T, SyntaxError> {
    Err(SyntaxError(m.into()))
}

impl P {
    fn peek(&self) -> Option<char> {
        self.s.get(self.i).copied()
    }
    fn at(&self, lit: &str) -> bool {
        lit.chars().enumerate().all(|(k, c)| self.s.get(self.i + k) == Some(&c))
    }
    fn eat(&mut self, lit: &str) -> bool {
        if self.at(lit) {
            self.i += lit.chars().count();
            true
        } else {
            false
        }
    }
    fn ws(&mut self) {
        while self.peek().is_some_and(|c| matches!(c, ' ' | '\t' | '\n' | '\r' | '\u{3000}')) {
            self.i += 1;
        }
    }
    fn fail<T>(&self, m: &str) -> Result<T, SyntaxError> {
        err(format!("{m} at {}", self.i))
    }
    fn name(&mut self) -> Result<String, SyntaxError> {
        let start = self.i;
        while self
            .peek()
            .is_some_and(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '.' | '+'))
        {
            self.i += 1;
        }
        if start == self.i {
            return self.fail("expected a name");
        }
        Ok(self.s[start..self.i].iter().collect())
    }

    fn text_until(&mut self, in_quoted: bool) -> Result<String, SyntaxError> {
        let mut t = String::new();
        while let Some(c) = self.peek() {
            match c {
                '\\' => match self.s.get(self.i + 1) {
                    Some(&e @ ('\\' | '{' | '}' | '|')) => {
                        t.push(e);
                        self.i += 2;
                    }
                    _ => return self.fail("invalid escape"),
                },
                '{' => break,
                '}' => {
                    if in_quoted {
                        break;
                    }
                    return self.fail("unmatched }");
                }
                _ => {
                    t.push(c);
                    self.i += 1;
                }
            }
        }
        Ok(t)
    }

    fn expr(&mut self) -> Result<Expr, SyntaxError> {
        // cursor on '{'
        self.i += 1;
        self.ws();
        let mut operand = None;
        match self.peek() {
            Some('$') => {
                self.i += 1;
                operand = Some(Operand::Var(self.name()?));
            }
            Some('|') => {
                self.i += 1;
                let mut l = String::new();
                loop {
                    match self.peek() {
                        Some('|') => {
                            self.i += 1;
                            break;
                        }
                        Some('\\') => match self.s.get(self.i + 1) {
                            Some(&e @ ('\\' | '|')) => {
                                l.push(e);
                                self.i += 2;
                            }
                            _ => return self.fail("invalid escape"),
                        },
                        Some(c) => {
                            l.push(c);
                            self.i += 1;
                        }
                        None => return self.fail("unterminated literal"),
                    }
                }
                operand = Some(Operand::Lit(l));
            }
            Some('#') | Some('/') => return self.fail("markup is not supported"),
            Some(c) if c != ':' && c != '}' => operand = Some(Operand::Lit(self.name()?)),
            _ => {}
        }
        self.ws();
        let mut func = None;
        if self.peek() == Some(':') {
            self.i += 1;
            let f = self.name()?;
            func = Some(match f.as_str() {
                "number" => Func::Number,
                "integer" => Func::Integer,
                "string" => Func::StringFn,
                other => return err(format!("unsupported function :{other}")),
            });
            self.ws();
            if self.peek().is_some_and(|c| c != '}') {
                return self.fail("function options and attributes are not supported");
            }
        }
        if self.peek() != Some('}') {
            return self.fail("expected }");
        }
        self.i += 1;
        if operand.is_none() && func.is_none() {
            return self.fail("empty placeholder");
        }
        Ok(Expr { operand, func })
    }

    fn pattern_in_braces(&mut self) -> Result<Pattern, SyntaxError> {
        // cursor on "{{"
        self.i += 2;
        let p = self.pattern(true)?;
        if !self.eat("}}") {
            return self.fail("expected }}");
        }
        Ok(p)
    }

    fn pattern(&mut self, quoted: bool) -> Result<Pattern, SyntaxError> {
        let mut out = Vec::new();
        loop {
            let t = self.text_until(quoted)?;
            if !t.is_empty() {
                out.push(Part::Text(t));
            }
            match self.peek() {
                Some('{') => out.push(Part::Expr(self.expr()?)),
                _ => break,
            }
        }
        Ok(out)
    }

    fn message(&mut self) -> Result<Message, SyntaxError> {
        let save = self.i;
        self.ws();
        let mut m = Message { decls: vec![], selectors: vec![], variants: vec![], pattern: vec![] };
        let complex = self.at(".input") || self.at(".local") || self.at(".match") || self.at("{{");
        if !complex {
            self.i = save;
            m.pattern = self.pattern(false)?;
            if self.i < self.s.len() {
                return self.fail("unexpected character");
            }
            return Ok(m);
        }
        loop {
            self.ws();
            if self.eat(".input") {
                self.ws();
                if self.peek() != Some('{') {
                    return self.fail("expected {");
                }
                let e = self.expr()?;
                match &e.operand {
                    Some(Operand::Var(n)) => m.decls.push(Decl::Input(n.clone(), e)),
                    _ => return self.fail(".input needs a variable"),
                }
            } else if self.eat(".local") {
                self.ws();
                if !self.eat("$") {
                    return self.fail("expected $");
                }
                let n = self.name()?;
                self.ws();
                if !self.eat("=") {
                    return self.fail("expected =");
                }
                self.ws();
                if self.peek() != Some('{') {
                    return self.fail("expected {");
                }
                m.decls.push(Decl::Local(n, self.expr()?));
            } else {
                break;
            }
        }
        self.ws();
        if self.eat(".match") {
            loop {
                self.ws();
                if self.peek() == Some('$') {
                    self.i += 1;
                    m.selectors.push(self.name()?);
                } else {
                    break;
                }
            }
            if m.selectors.is_empty() {
                return self.fail(".match needs a selector");
            }
            loop {
                self.ws();
                if self.peek().is_none() {
                    break;
                }
                let mut keys = Vec::new();
                while self.peek().is_some_and(|c| c != '{') {
                    if self.eat("*") {
                        keys.push(Key::Star);
                    } else if self.peek() == Some('|') {
                        self.i += 1;
                        let mut l = String::new();
                        while let Some(c) = self.peek() {
                            self.i += 1;
                            if c == '|' {
                                break;
                            }
                            l.push(c);
                        }
                        keys.push(Key::Lit(l));
                    } else {
                        keys.push(Key::Lit(self.name()?));
                    }
                    self.ws();
                }
                if keys.len() != m.selectors.len() {
                    return self.fail("variant key count differs from the selector count");
                }
                if !self.at("{{") {
                    return self.fail("expected a {{pattern}}");
                }
                let p = self.pattern_in_braces()?;
                m.variants.push((keys, p));
            }
            if !m.variants.iter().any(|(k, _)| k.iter().all(|x| *x == Key::Star)) {
                return err("a .match needs a variant whose keys are all *");
            }
        } else if self.at("{{") {
            m.pattern = self.pattern_in_braces()?;
            self.ws();
        } else {
            return self.fail("expected .match or {{pattern}}");
        }
        if self.i < self.s.len() {
            return self.fail("unexpected character");
        }
        Ok(m)
    }
}

pub(crate) fn parse(src: &str) -> Result<Message, SyntaxError> {
    P { s: src.chars().collect(), i: 0 }.message()
}

/// Names of the variables a message reads, minus `.local` names (same contract as the TypeScript `argNames`).
pub(crate) fn arg_names(m: &Message) -> Vec<String> {
    let mut used: Vec<String> = Vec::new();
    let mut locals: Vec<&str> = Vec::new();
    fn add(used: &mut Vec<String>, e: &Expr) {
        if let Some(Operand::Var(n)) = &e.operand {
            used.push(n.clone());
        }
    }
    for d in &m.decls {
        match d {
            Decl::Input(_, e) => add(&mut used, e),
            Decl::Local(n, e) => {
                add(&mut used, e);
                locals.push(n);
            }
        }
    }
    for s in &m.selectors {
        used.push(s.clone());
    }
    for (_, p) in &m.variants {
        for part in p {
            if let Part::Expr(e) = part {
                add(&mut used, e);
            }
        }
    }
    for part in &m.pattern {
        if let Part::Expr(e) = part {
            add(&mut used, e);
        }
    }
    used.retain(|n| !locals.contains(&n.as_str()));
    used.sort();
    used.dedup();
    used
}

#[derive(Debug, Clone)]
enum Val {
    Str(String),
    Num(f64),
}

#[derive(Debug, Clone)]
struct Bound {
    val: Option<Val>,
    func: Option<Func>,
    name: String,
}

struct Ctx<'a> {
    locale: &'a Locale,
    plural: Option<PluralRules>,
    decimal: Option<DecimalFormatter>,
}

fn to_decimal(v: f64) -> Decimal {
    if v.fract() == 0.0 && v.abs() < 9.0e15 {
        Decimal::from(v as i64)
    } else {
        Decimal::try_from_str(&format!("{v}")).unwrap_or_else(|_| Decimal::from(0))
    }
}

impl<'a> Ctx<'a> {
    fn category(&mut self, v: f64) -> &'static str {
        let rules = self.plural.get_or_insert_with(|| {
            PluralRules::try_new_cardinal((&*self.locale).into())
                .unwrap_or_else(|_| PluralRules::try_new_cardinal(Default::default()).expect("root plural rules"))
        });
        match rules.category_for(&to_decimal(v)) {
            PluralCategory::Zero => "zero",
            PluralCategory::One => "one",
            PluralCategory::Two => "two",
            PluralCategory::Few => "few",
            PluralCategory::Many => "many",
            PluralCategory::Other => "other",
        }
    }
    fn number(&mut self, v: f64) -> String {
        let f = self.decimal.get_or_insert_with(|| {
            DecimalFormatter::try_new((&*self.locale).into(), Default::default())
                .unwrap_or_else(|_| DecimalFormatter::try_new(Default::default(), Default::default()).expect("root decimal"))
        });
        f.format(&to_decimal(v)).to_string()
    }
}

fn arg_val(a: &Arg) -> Val {
    match a {
        Arg::Str(s) => Val::Str(s.clone()),
        Arg::Num(n) => Val::Num(*n),
    }
}

fn eval_expr(e: &Expr, env: &HashMap<String, Bound>, args: Args<'_>) -> Bound {
    let (val, name) = match &e.operand {
        Some(Operand::Var(n)) => (
            env.get(n)
                .and_then(|b| b.val.clone())
                .or_else(|| args.iter().find(|(k, _)| k == n).map(|(_, a)| arg_val(a))),
            format!("${n}"),
        ),
        Some(Operand::Lit(l)) => (Some(Val::Str(l.clone())), format!("|{l}|")),
        None => (None, String::new()),
    };
    let inherited = match &e.operand {
        Some(Operand::Var(n)) => env.get(n).and_then(|b| b.func),
        _ => None,
    };
    Bound { val, func: e.func.or(inherited), name }
}

fn as_number(v: &Val) -> Option<f64> {
    match v {
        Val::Num(n) => Some(*n),
        Val::Str(s) => s.trim().parse::<f64>().ok(),
    }
}

fn format_bound(b: &Bound, cx: &mut Ctx<'_>) -> String {
    let Some(val) = &b.val else {
        return format!("{{{}}}", b.name);
    };
    match b.func {
        Some(Func::Integer) => match as_number(val) {
            Some(n) => cx.number(n.trunc()),
            None => format!("{{{}}}", b.name),
        },
        Some(Func::StringFn) => match val {
            Val::Str(s) => s.clone(),
            Val::Num(n) => cx.number(*n),
        },
        Some(Func::Number) | None => match val {
            Val::Str(s) if b.func.is_none() => s.clone(),
            v => match as_number(v) {
                Some(n) => cx.number(n),
                None => format!("{{{}}}", b.name),
            },
        },
    }
}

fn render(p: &Pattern, env: &HashMap<String, Bound>, args: Args<'_>, cx: &mut Ctx<'_>, out: &mut String) {
    for part in p {
        match part {
            Part::Text(t) => out.push_str(t),
            Part::Expr(e) => out.push_str(&format_bound(&eval_expr(e, env, args), cx)),
        }
    }
}

/// Keys of `b` that match, most preferred first (spec: exact match, then plural category for number selectors).
fn matching_keys(b: &Bound, cx: &mut Ctx<'_>, candidates: &[&Key]) -> Vec<String> {
    let mut out = Vec::new();
    let Some(val) = &b.val else { return out };
    match b.func {
        Some(Func::Number) | Some(Func::Integer) => {
            let Some(n) = as_number(val) else { return out };
            let n = if b.func == Some(Func::Integer) { n.trunc() } else { n };
            for k in candidates {
                if let Key::Lit(l) = k {
                    if l.parse::<f64>().is_ok_and(|x| x == n) {
                        out.push(l.clone());
                    }
                }
            }
            let cat = cx.category(n);
            for k in candidates {
                if let Key::Lit(l) = k {
                    if l == cat && !out.contains(l) {
                        out.push(l.clone());
                    }
                }
            }
        }
        _ => {
            let s = match val {
                Val::Str(s) => s.clone(),
                Val::Num(n) => cx.number(*n),
            };
            for k in candidates {
                if let Key::Lit(l) = k {
                    if *l == s {
                        out.push(l.clone());
                    }
                }
            }
        }
    }
    out
}

pub(crate) fn format(m: &Message, locale: &Locale, args: Args<'_>) -> Result<String, SyntaxError> {
    let mut cx = Ctx { locale, plural: None, decimal: None };
    let mut env: HashMap<String, Bound> = HashMap::new();
    for d in &m.decls {
        match d {
            Decl::Input(n, e) | Decl::Local(n, e) => {
                let b = eval_expr(e, &env, args);
                env.insert(n.clone(), b);
            }
        }
    }
    let mut out = String::new();
    if m.selectors.is_empty() {
        render(&m.pattern, &env, args, &mut cx, &mut out);
        return Ok(out);
    }
    let mut prefs: Vec<Vec<String>> = Vec::new();
    for s in &m.selectors {
        let b = env
            .get(s)
            .cloned()
            .or_else(|| {
                args.iter()
                    .find(|(k, _)| k == s)
                    .map(|(_, a)| Bound { val: Some(arg_val(a)), func: None, name: format!("${s}") })
            })
            .unwrap_or(Bound { val: None, func: None, name: format!("${s}") });
        if b.func.is_none() {
            return err(format!("selector ${s} has no :number, :integer or :string annotation"));
        }
        let col = m.selectors.iter().position(|x| x == s).unwrap();
        let cands: Vec<&Key> = m.variants.iter().map(|(k, _)| &k[col]).collect();
        prefs.push(matching_keys(&b, &mut cx, &cands));
    }
    // keep the variants whose every key is matched or `*`, then order by preference (earlier selector first)
    let mut scored: Vec<(Vec<usize>, &Pattern)> = Vec::new();
    for (keys, pat) in &m.variants {
        let mut score = Vec::new();
        let mut ok = true;
        for (i, k) in keys.iter().enumerate() {
            match k {
                Key::Star => score.push(prefs[i].len()),
                Key::Lit(l) => match prefs[i].iter().position(|x| x == l) {
                    Some(p) => score.push(p),
                    None => {
                        ok = false;
                        break;
                    }
                },
            }
        }
        if ok {
            scored.push((score, pat));
        }
    }
    scored.sort_by(|a, b| a.0.cmp(&b.0));
    if let Some((_, pat)) = scored.first() {
        render(pat, &env, args, &mut cx, &mut out);
    }
    Ok(out)
}
