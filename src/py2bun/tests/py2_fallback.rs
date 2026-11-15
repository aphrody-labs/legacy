use py2bun::{transpile, Severity};

#[test]
fn print_statement_rewritten_with_warning() {
    let o = transpile("print \"a\", 1\nprint >>f, 'x'\nprint x,\nprint\n");
    assert!(!o.ts.is_empty(), "{:?}", o.diagnostics);
    assert!(o.ts.contains("__py.print(\"a\", 1)"));
    assert!(o.ts.contains("\"file\": f"));
    assert!(o.ts.contains("\"end\": \" \""));
    let w = o.diagnostics.iter().filter(|d| d.severity == Severity::Warning && d.message.contains("Python 2")).count();
    assert_eq!(w, 4);
}

#[test]
fn except_comma_rewritten() {
    // the print statement forces the Python 2 fallback (ruff itself accepts `except A, B:` as PEP 758)
    let o = transpile("try:\n    pass\nexcept ValueError, e:\n    print \"x\"\n");
    assert!(!o.ts.is_empty());
    assert!(o.ts.contains("__py.catches(") && o.ts.contains("e = __e"));
}

#[test]
fn one_line_compound_and_continuation() {
    let o = transpile("x = 1\nif x != 0: print \"v\" + str(x)\nprint \"a\", x, \\\n    \"b\"\nprint 2\n");
    assert!(!o.ts.is_empty(), "{:?}", o.diagnostics);
    assert!(o.ts.contains("__py.add(\"v\", __py.str(x))"));
    assert!(o.ts.contains("__py.print(\"a\", x,"));
}

#[test]
fn genuine_syntax_error_still_fails() {
    assert!(transpile("x = = 1\n").ts.is_empty());
}

#[test]
fn except_tuple_with_comma_name_rewritten() {
    let o = transpile("try:\n    pass\nexcept (ValueError, KeyError), e:\n    print e\n");
    assert!(!o.ts.is_empty(), "{:?}", o.diagnostics);
}
