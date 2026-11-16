//! POSIX BRE/ERE (GNU flavour: `\+ \? \|` in BRE, `\< \> \b \w \s`) onto the `regex` crate.
//! Groups capture, `.` matches a newline, back-references inside a pattern are refused (the
//! engine has none); `expand` builds `&` / `\1`..`\9` replacements.

pub use regex::{Captures, Regex};

pub fn compile(pat: &str, ere: bool) -> Result<Regex, String> {
    Regex::new(&translate(pat, ere)?).map_err(|e| match e {
        regex::Error::CompiledTooBig(_) => "Regular expression too big".into(),
        _ => "Invalid regular expression".into(),
    })
}

fn lit(o: &mut String, c: char) {
    if "\\.+*?()|[]{}^$#&-~".contains(c) {
        o.push('\\');
    }
    o.push(c);
}

/// `[...]` starting after the `[` at `i`; returns the index after the closing `]`.
fn bracket(c: &[char], mut i: usize, o: &mut String) -> Result<usize, String> {
    o.push('[');
    if c.get(i) == Some(&'^') {
        o.push('^');
        i += 1;
    }
    let first = i;
    loop {
        let Some(&ch) = c.get(i) else { return Err("Unmatched [, [^, [:, [., or [=".into()) };
        i += 1;
        match ch {
            ']' if i - 1 > first => break,
            '[' if matches!(c.get(i), Some(':' | '.' | '=')) => {
                let k = c[i];
                let end = (i + 1..c.len().saturating_sub(1)).find(|&j| c[j] == k && c[j + 1] == ']');
                let Some(end) = end else { return Err("Unmatched [, [^, [:, [., or [=".into()) };
                let body: String = c[i + 1..end].iter().collect();
                if k == ':' {
                    o.push_str(&format!("[:{body}:]"));
                } else {
                    body.chars().for_each(|b| lit(o, b));
                }
                i = end + 2;
            }
            '-' if i - 1 > first && c.get(i) != Some(&']') => o.push('-'),
            ch => lit(o, ch),
        }
    }
    o.push(']');
    Ok(i)
}

fn translate(pat: &str, ere: bool) -> Result<String, String> {
    let c: Vec<char> = pat.chars().collect();
    let mut o = String::from("(?s)");
    let (mut i, mut start, mut depth) = (0, true, 0usize);
    while i < c.len() {
        let ch = c[i];
        i += 1;
        let mut next_start = false;
        match ch {
            '\\' => {
                let Some(&e) = c.get(i) else { return Err("Trailing backslash".into()) };
                i += 1;
                match e {
                    '(' if !ere => {
                        depth += 1;
                        o.push('(');
                        next_start = true;
                    }
                    ')' if !ere => {
                        depth = depth.checked_sub(1).ok_or(r"Unmatched ) or \)")?;
                        o.push(')');
                    }
                    '|' if !ere => {
                        o.push('|');
                        next_start = true;
                    }
                    '{' if !ere && !start => {
                        let end = (i..c.len().saturating_sub(1)).find(|&j| c[j] == '\\' && c[j + 1] == '}');
                        let end = end.ok_or(r"Unmatched \{")?;
                        let body: String = c[i..end].iter().collect();
                        if body.is_empty() || !body.chars().all(|d| d.is_ascii_digit() || d == ',') {
                            return Err(r"Invalid content of \{\}".into());
                        }
                        o.push_str(&format!("{{{body}}}"));
                        i = end + 2;
                    }
                    '+' | '?' if !ere && !start => o.push(e),
                    '1'..='9' => return Err("Invalid back reference".into()),
                    '<' | '>' | 'b' | 'B' | 'w' | 'W' | 's' | 'S' => {
                        o.push('\\');
                        o.push(e);
                    }
                    '`' => o.push_str(r"\A"),
                    '\'' => o.push_str(r"\z"),
                    'n' => o.push('\n'),
                    't' => o.push('\t'),
                    e => lit(&mut o, e),
                }
            }
            '(' if ere => {
                depth += 1;
                o.push('(');
                next_start = true;
            }
            ')' if ere && depth > 0 => {
                depth -= 1;
                o.push(')');
            }
            '|' if ere => {
                o.push('|');
                next_start = true;
            }
            '{' if ere && !start && c[i..].contains(&'}') => {
                let end = i + c[i..].iter().position(|&x| x == '}').unwrap_or(0);
                let body: String = c[i..end].iter().collect();
                if body.is_empty() || !body.chars().all(|d| d.is_ascii_digit() || d == ',') {
                    return Err("Invalid content of {}".into());
                }
                o.push_str(&format!("{{{body}}}"));
                i = end + 1;
            }
            '+' | '?' | '*' if ere && !start => o.push(ch),
            '*' if !ere && !start => o.push('*'),
            '^' if ere || start => {
                o.push('^');
                next_start = !ere;
            }
            '$' if ere || matches!(&c[i..], [] | ['\\', ')' | '|', ..]) => o.push('$'),
            '.' => o.push('.'),
            '[' => i = bracket(&c, i, &mut o)?,
            ch => lit(&mut o, ch),
        }
        start = next_start;
    }
    if depth > 0 {
        return Err(r"Unmatched ( or \(".into());
    }
    Ok(o)
}

/// Replacement text: `&` the whole match, `\1`..`\9` groups, `\n` newline, `\c` other literal.
pub fn expand(caps: &Captures<'_>, repl: &str) -> String {
    let mut o = String::new();
    let mut it = repl.chars();
    while let Some(c) = it.next() {
        match c {
            '&' => o.push_str(caps.get(0).map_or("", |m| m.as_str())),
            '\\' => match it.next() {
                Some(d @ '0'..='9') => o.push_str(caps.get(d as usize - '0' as usize).map_or("", |m| m.as_str())),
                Some('n') => o.push('\n'),
                Some(x) => o.push(x),
                None => o.push('\\'),
            },
            c => o.push(c),
        }
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(p: &str, ere: bool, t: &str) -> Option<String> {
        compile(p, ere).unwrap().find(t).map(|m| m.as_str().to_owned())
    }

    #[test]
    fn bre_operators() {
        assert_eq!(m(r"a\(b\|c\)*d", false, "xabcbd"), Some("abcbd".into()));
        assert_eq!(m("a+b", false, "aa+b"), Some("a+b".into()));
        assert_eq!(m(r"a\+b", false, "aab"), Some("aab".into()));
        assert_eq!(m(r"a\{2,3\}", false, "aaaa"), Some("aaa".into()));
        assert_eq!(m("*a", false, "x*a"), Some("*a".into()));
        assert_eq!(m("a^b$c", false, "a^b$c"), Some("a^b$c".into()));
        assert_eq!(m("^ab$", false, "ab"), Some("ab".into()));
    }

    #[test]
    fn ere_operators() {
        assert_eq!(m("(a|b)+c", true, "xabac"), Some("abac".into()));
        assert_eq!(m("a{2}", true, "aaa"), Some("aa".into()));
        assert_eq!(m(r"a\+", true, "a+"), Some("a+".into()));
    }

    #[test]
    fn brackets() {
        assert_eq!(m("[]x]*", false, "]x]a"), Some("]x]".into()));
        assert_eq!(m("[^a-c]", false, "abcd"), Some("d".into()));
        assert_eq!(m("[[:digit:]]+", true, "ab123"), Some("123".into()));
        assert_eq!(m(r"[\.]", false, r"a\"), Some("\\".into()));
        assert_eq!(m("[a-]", false, "-"), Some("-".into()));
    }

    #[test]
    fn errors_and_expand() {
        assert!(compile(r"\(a", false).is_err());
        assert!(compile(r"a\)", false).is_err());
        assert!(compile(r"\(a\)\1", false).is_err());
        assert!(compile("[a", false).is_err());
        let re = compile(r"\(a*\)b", false).unwrap();
        let c = re.captures("xaab").unwrap();
        assert_eq!(expand(&c, r"[\1|&|\\|\&]"), r"[aa|aab|\|&]");
    }
}
