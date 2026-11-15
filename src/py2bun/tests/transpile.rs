use py2bun::{transpile, Severity};

fn ts(src: &str) -> String {
    let o = transpile(src);
    assert!(!o.ts.is_empty(), "syntax error: {:?}", o.diagnostics);
    o.ts
}

#[test]
fn builtins_and_loops() {
    let t = ts("for i in range(3):\n    print(i)\n");
    assert!(t.contains("for (i of __py.iter(__py.range(3)))"));
    assert!(t.contains("__py.print(i)"));
    assert!(t.contains("let i;"));
}

#[test]
fn for_else_flag() {
    let t = ts("for x in a:\n    if x:\n        break\nelse:\n    pass\n");
    assert!(t.contains("= false; break;"));
}

#[test]
fn classes_and_self() {
    let t = ts("class A(B):\n    def __init__(self, x):\n        super().__init__(x)\n        self.x = x\n");
    assert!(t.contains("class A extends B"));
    assert!(t.contains("super(x);"));
    assert!(t.contains("const self = this;"));
}

#[test]
fn comprehension_fstring_with() {
    let t = ts("a = {k: v for k, v in d.items() if v}\nb = f'{a!r:>4} x'\nwith open('f') as h:\n    pass\n");
    assert!(t.contains("new Map()"));
    assert!(t.contains("__py.format(__py.repr(a), `>4`)"));
    assert!(t.contains("__py.ctxExit("));
}

#[test]
fn ghidra_imports_and_flat() {
    let t = ts("from ghidra.program.model.listing import Function as F\nx = toAddr(0x10)\nprintln(x)\n");
    assert!(t.contains("import { Function as F } from \"@aphrody/ghidra/java/ghidra/program/model/listing\";"));
    assert!(t.contains("import { println, toAddr } from \"@aphrody/ghidra/script\";"));
}

#[test]
fn keyword_mapping_for_user_functions() {
    let t = ts("def f(a, b=2, c=3):\n    return a\nf(1, c=9)\n");
    assert!(t.contains("f(1, undefined, 9);"));
}

#[test]
fn syntax_error_has_no_output() {
    let o = transpile("def (:\n");
    assert!(o.ts.is_empty());
    assert_eq!(o.diagnostics[0].severity, Severity::Error);
}

#[test]
fn unsupported_is_explicit() {
    let o = transpile("match x:\n    case 1:\n        pass\n");
    assert!(o.has_errors());
    assert!(o.ts.contains("__py.unsupported(\"match statement\")"));
    let o = transpile("import numpy\n");
    assert!(o.has_errors());
}

#[test]
fn jython_implicit_java_root_and_star_import() {
    let t = ts("l = java.util.ArrayList()\nfrom ghidra.program.model.symbol import *\nx = SourceType.USER_DEFINED\ny = Foo()\n");
    assert!(t.contains("import { java } from \"@aphrody/ghidra/java\";"));
    assert!(t.contains("(await java.util.ArrayList.new_())"));
    assert!(t.contains("const SourceType = await __py.starPick([\"@aphrody/ghidra/java/ghidra/program/model/symbol\"], \"SourceType\");"));
    assert!(t.contains("(await Foo.new_())"));
}

#[test]
fn ghidra_flat_list_comes_from_java_sources() {
    use py2bun::names::GHIDRA_FLAT;
    for n in ["currentProgram", "getFunctionAt", "askLanguage", "getScriptName", "setBackgroundColor", "toAddr", "createFunction"] {
        assert!(GHIDRA_FLAT.contains(&n), "{n}");
    }
    assert!(!py2bun::names::is_flat("start"));
}

#[test]
fn undefined_name_is_warned() {
    let o = transpile("print(zzz)\n");
    assert!(o.diagnostics.iter().any(|d| d.severity == Severity::Warning && d.message.contains("zzz")));
}
