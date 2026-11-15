use py2bun::{transpile, Severity};

#[test]
fn print_statement_rewritten_with_warning() {
    let o = transpile("print \"a\", 1\nprint >>f, 'x'\nprint x,\nprint\n");
    assert!(!o.ts.is_empty(), "{:?}", o.diagnostics);
    assert!(o.ts.contains("__py.print(\"a\", 1)"));
    assert!(o.ts.contains("\"file\": f"));
    assert!(o.ts.contains("\"end\": \" \""));
    let w = o.diagnostics.iter().filter(|d| d.severity == Severity::Warning && d.message.contains("Python 2")).count();
    assert_eq!(w, 3);
}

#[test]
fn except_comma_rewritten() {
    // the print statement forces the Python 2 fallback (ruff itself accepts `except A, B:` as PEP 758)
    let o = transpile("try:\n    pass\nexcept ValueError, e:\n    print \"x\"\n");
    assert!(!o.ts.is_empty());
    assert!(o.ts.contains("__py.catches(") && o.ts.contains("e = __e"));
}

#[test]
fn genuine_syntax_error_still_fails() {
    assert!(transpile("x = = 1\n").ts.is_empty());
}
