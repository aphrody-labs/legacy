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

const COMPOUND: &[&str] = &["if ", "elif ", "else", "for ", "while ", "try", "except", "with ", "finally"];

fn fix_line(line: &str) -> Option<String> {
    let indent_len = line.len() - line.trim_start().len();
    let (indent, body) = line.split_at(indent_len);
    // `if x: print y` (one-line compound statement)
    if !body.starts_with("print") && COMPOUND.iter().any(|k| body.starts_with(k)) {
        let cut = comment_start(body);
        let code = &body[..cut];
        if let Some(p) = code.find(": print") {
            let tail = &code[p + 2..];
            let head = &code[..p + 1];
            if let Some(f) = fix_line(tail) {
                let c = if cut < body.len() { format!("  {}", &body[cut..]) } else { String::new() };
                return Some(format!("{indent}{head} {f}{c}"));
            }
        }
        // fall through to the `except X, e:` rule
    }
    if body.trim_end() == "print" {
        return Some(format!("{indent}print()"));
    }
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
        if inner.starts_with('(') {
            // `except (A, B), e:` -> `except (A, B) as e:`
            let mut depth = 0usize;
            let mut close = None;
            for (i, ch) in inner.char_indices() {
                match ch {
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            close = Some(i);
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let close = close?;
            let after = inner[close + 1..].trim();
            let name = after.strip_prefix(',')?.trim();
            let c = if comment.is_empty() { String::new() } else { format!("  {comment}") };
            return Some(format!("{indent}except {} as {name}:{c}", &inner[..=close]));
        }
        if inner.starts_with("*") {
            return None;
        }
        let i = first_comma(inner)?;
        let (ty, name) = (inner[..i].trim(), inner[i + 1..].trim());
        let c = if comment.is_empty() { String::new() } else { format!("  {comment}") };
        return Some(format!("{indent}except {ty} as {name}:{c}"));
    }
    None
}

fn split_nl(raw: &str) -> (&str, &str) {
    match raw.strip_suffix("\r\n") {
        Some(l) => (l, "\r\n"),
        None => match raw.strip_suffix('\n') {
            Some(l) => (l, "\n"),
            None => (raw, ""),
        },
    }
}

/// `print a, \` + continuation lines: wrap in parentheses, keeping the line count.
fn fix_continued(lines: &[(&str, &str)], i: usize) -> Option<(Vec<String>, usize)> {
    let line = lines[i].0;
    let indent_len = line.len() - line.trim_start().len();
    let (indent, body) = line.split_at(indent_len);
    let rest = body.strip_prefix("print")?;
    if !rest.starts_with([' ', '\t']) || rest.trim_start().starts_with(['=', '.', ',', ')', ':', '(', '[', '>']) {
        return None;
    }
    if !line.trim_end().ends_with('\\') {
        return None;
    }
    let mut parts: Vec<String> = vec![rest.trim_start().trim_end().trim_end_matches('\\').to_string()];
    let mut j = i + 1;
    loop {
        let l = lines.get(j)?.0;
        let t = l.trim_end();
        if t.ends_with('\\') {
            parts.push(t.trim_end_matches('\\').to_string());
            j += 1;
        } else {
            parts.push(t.to_string());
            break;
        }
    }
    let last = parts.len() - 1;
    let mut tail = parts[last].trim_end().to_string();
    let mut extra = String::new();
    if tail.ends_with(',') {
        tail.pop();
        extra = ", end=\" \"".into();
    }
    let mut out = vec![];
    for (k, p) in parts.iter().enumerate() {
        let mut s = if k == 0 { format!("{indent}print({p}") } else { p.clone() };
        if k == last {
            s = if k == 0 { format!("{indent}print({tail}{extra})") } else { format!("{tail}{extra})") };
        }
        out.push(s);
    }
    Some((out, j))
}

/// Returns the rewritten source and the 1-based line numbers that changed.
pub fn fix(src: &str) -> (String, Vec<usize>) {
    let lines: Vec<(&str, &str)> = src.split_inclusive('\n').map(split_nl).collect();
    let mut out = String::with_capacity(src.len());
    let mut changed = vec![];
    let mut i = 0;
    while i < lines.len() {
        let (line, nl) = lines[i];
        if let Some((rep, j)) = fix_continued(&lines, i) {
            changed.push(i + 1);
            for (k, r) in rep.iter().enumerate() {
                out.push_str(r);
                out.push_str(lines[i + k].1);
            }
            i = j + 1;
            continue;
        }
        match fix_line(line) {
            Some(f) => {
                changed.push(i + 1);
                out.push_str(&f);
            }
            None => out.push_str(line),
        }
        out.push_str(nl);
        i += 1;
    }
    (out, changed)
}
