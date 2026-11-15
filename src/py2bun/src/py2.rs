//! Best-effort Python 2 (Jython-era Ghidra scripts) fallback: rewrites `print` statements and
//! `except X, e:` clauses line by line. Used only when the source does not parse as Python 3.

/// Index of a `#` that starts a comment (outside single/double quoted strings), or len.
fn comment_start(s: &str) -> usize {
    let mut q: Option<char> = None;
    let mut esc = false;
    for (i, c) in s.char_indices() {
        if let Some(qc) = q {
            if esc {
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == qc {
                q = None;
            }
        } else if c == '"' || c == '\'' {
            q = Some(c);
        } else if c == '#' {
            return i;
        }
    }
    s.len()
}

/// Split at the first top-level comma (outside quotes and brackets).
fn first_comma(s: &str) -> Option<usize> {
    let (mut q, mut esc, mut depth) = (None::<char>, false, 0i32);
    for (i, c) in s.char_indices() {
        if let Some(qc) = q {
            if esc {
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == qc {
                q = None;
            }
        } else {
            match c {
                '"' | '\'' => q = Some(c),
                '(' | '[' | '{' => depth += 1,
                ')' | ']' | '}' => depth -= 1,
                ',' if depth == 0 => return Some(i),
                _ => {}
            }
        }
    }
    None
}

fn fix_line(line: &str) -> Option<String> {
    let indent_len = line.len() - line.trim_start().len();
    let (indent, body) = line.split_at(indent_len);
    if let Some(rest) = body.strip_prefix("print") {
        if !rest.starts_with([' ', '\t']) {
            return None;
        }
        let rest = rest.trim_start();
        if rest.is_empty() || rest.starts_with(['=', '.', ',', ')', ':', '(', '[']) {
            return None;
        }
        let cut = comment_start(rest);
        let (code, comment) = rest.split_at(cut);
        let mut code = code.trim_end().to_string();
        let mut file = None;
        if let Some(r) = code.strip_prefix(">>") {
            match first_comma(r) {
                Some(i) => {
                    file = Some(r[..i].trim().to_string());
                    code = r[i + 1..].trim().to_string();
                }
                None => {
                    file = Some(r.trim().to_string());
                    code = String::new();
                }
            }
        }
        let mut extra = String::new();
        if code.ends_with(',') {
            code.pop();
            extra.push_str(", end=\" \"");
        }
        if let Some(f) = file {
            extra.push_str(&format!(", file={f}"));
        }
        let args = code.trim().to_string();
        let args = if args.is_empty() { extra.trim_start_matches(", ").to_string() } else { format!("{args}{extra}") };
        let c = if comment.is_empty() { String::new() } else { format!("  {comment}") };
        return Some(format!("{indent}print({args}){c}"));
    }
    if body.starts_with("except ") || body.starts_with("except\t") {
        let cut = comment_start(body);
        let (code, comment) = body.split_at(cut);
        let code_t = code.trim_end();
        let inner = code_t.strip_prefix("except")?.trim().strip_suffix(':')?;
        if inner.starts_with('(') || inner.starts_with("*") {
            return None;
        }
        let i = first_comma(inner)?;
        let (ty, name) = (inner[..i].trim(), inner[i + 1..].trim());
        let c = if comment.is_empty() { String::new() } else { format!("  {comment}") };
        return Some(format!("{indent}except {ty} as {name}:{c}"));
    }
    None
}

/// Returns the rewritten source and the 1-based line numbers that changed.
pub fn fix(src: &str) -> (String, Vec<usize>) {
    let mut out = String::with_capacity(src.len());
    let mut changed = vec![];
    for (n, raw) in src.split_inclusive('\n').enumerate() {
        let (line, nl) = match raw.strip_suffix("\r\n") {
            Some(l) => (l, "\r\n"),
            None => match raw.strip_suffix('\n') {
                Some(l) => (l, "\n"),
                None => (raw, ""),
            },
        };
        match fix_line(line) {
            Some(f) => {
                changed.push(n + 1);
                out.push_str(&f);
            }
            None => out.push_str(line),
        }
        out.push_str(nl);
    }
    (out, changed)
}
