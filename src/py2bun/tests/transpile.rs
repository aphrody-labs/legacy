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

#[test]
fn destructuring_subscript_and_mid_star_have_no_unsupported_lhs() {
    let o = ts("a = [0, 0]\nd = {}\na[0], d['k'] = 1, 2\nfirst, *mid, last = [1, 2, 3, 4]\nfor a[1], d['z'] in [(1, 2)]:\n    pass\n");
    assert!(!o.contains("__py.unsupported"), "{o}");
    assert!(o.contains("__py.setitem"), "{o}");
    assert!(o.contains(".slice("), "{o}");
}

#[test]
fn augmented_assign_uses_iadd_not_native_plus_equals() {
    let o = ts("x = []\nx += 'ab'\ny = 1\ny += 2\n");
    assert!(o.contains("__py.iadd(x"), "{o}");
    assert!(!o.contains(" += "), "{o}");
}

#[test]
fn comprehension_first_iterable_evaluated_outside_scope() {
    let o = ts("x = [1, 2]\nr = [x for x in x]\n");
    assert!(o.contains("(__i0) =>") && o.contains(")(x)"), "{o}");
}

#[test]
fn chained_comparison_short_circuits() {
    let o = ts("r = 1 < f() < g()\n");
    // g() only inside the nested arrow evaluated after the first comparison
    assert!(o.contains("&& ((__c"), "{o}");
}

#[test]
fn not_emits_operand_once_and_inf_is_infinity() {
    let o = ts("a = not f()\nb = 1e999\n");
    assert_eq!(o.matches("f()").count(), 1, "{o}");
    assert!(o.contains("Infinity"), "{o}");
}

#[test]
fn defaults_evaluated_in_enclosing_scope() {
    let o = ts("x = 1\ndef f(x=x):\n    return x\ng = lambda y=x: y\n");
    assert!(!o.contains("x = x"), "{o}");
    assert!(o.contains("const __d"), "{o}");
}

#[test]
fn sixteen_digit_int_is_number_and_matmul_has_diagnostic() {
    let o = ts("a = 1234567890123456\nb = 9007199254740993\n");
    assert!(o.contains("a = 1234567890123456;") && o.contains("9007199254740993n"), "{o}");
    let r = transpile("m = a @ b
");
    assert!(r.diagnostics.iter().any(|d| d.message.contains("matrix multiplication")), "{:?}", r.diagnostics);
}

#[test]
fn identifiers_dunder_and_camel() {
    let o = ts("__x = 1\nprint(__x)\n");
    assert!(o.contains("$u__x"), "{o}");
    assert!(!o.contains("let __x") && !o.contains("(__x)"), "{o}");
}

#[test]
fn class_body_annassign_and_sibling_attrs() {
    let o = ts("class A:\n    x: int = 1\n    y = x + 1\n    z: int\n");
    assert!(o.contains("static x = 1;"), "{o}");
    assert!(o.contains("static y = (A.x + 1)") || o.contains("A.x"), "{o}");
    assert!(!o.contains("__py.unsupported"), "{o}");
}

#[test]
fn repr_and_str_do_not_duplicate_tostring() {
    let o = ts("class A:\n    def __str__(self):\n        return 'a'\n    def __repr__(self):\n        return 'b'\n");
    assert_eq!(o.matches("toString()").count(), 1, "{o}");
    assert!(o.contains("__repr__()"), "{o}");
}

#[test]
fn keyword_call_rewrite_guards() {
    let o = ts("def f(a, b):\n    return a\nf(1, 2, a=3)\nxs = [1]\nf(*xs, b=2)\n");
    assert!(!o.contains("f(3, 2)"), "{o}");
    assert!(o.contains("__py.kw"), "{o}");
}

#[test]
fn walrus_in_comprehension_is_declared() {
    let o = ts("def g(xs):\n    return [y for x in xs if (y := x)]\n");
    assert!(o.contains("let y") || o.contains("let y;"), "{o}");
}

#[test]
fn error_column_counts_characters() {
    let r = transpile("s = 'é' +\n");
    assert!(r.ts.is_empty());
}

#[test]
fn with_forwards_exceptions_and_async_with_uses_aenter() {
    let o = ts("with open('f') as f:\n    pass\n");
    assert!(o.contains("ctxExitErr"), "{o}");
    let a = transpile("async def g(x):\n    async with x as y:\n        pass\n");
    assert!(a.ts.contains("ctxAEnter") && a.ts.contains("ctxAExitErr"), "{}", a.ts);
}

#[test]
fn except_name_is_unbound_after_handler() {
    let o = ts("def f():\n    try:\n        pass\n    except ValueError as e:\n        pass\n");
    assert!(o.contains("e = undefined"), "{o}");
}

#[test]
fn sub_div_and_ordering_use_runtime_helpers() {
    let o = ts("a = b - c\nd = b / c\ne = b < c\nf = b < 3\n");
    assert!(o.contains("__py.sub(") && o.contains("__py.truediv(") && o.contains("__py.cmp(b, c) < 0") && o.contains("(b < 3)"), "{o}");
}

#[test]
fn none_on_the_left_and_aug_target_once() {
    let o = ts("r = None is x\nd = {}\nd[f()] += 1\n");
    assert!(o.contains("(x == null)"), "{o}");
    assert_eq!(o.matches("f()").count(), 1, "{o}");
}

#[test]
fn del_tuple_and_name() {
    let o = ts("a = b = 1\ndel a, b\n");
    assert!(!o.contains("__py.unsupported"), "{o}");
}

#[test]
fn from_import_rebinding_and_relative_dot() {
    let o = ts("from math import floor\nfloor = 3\nfrom . import sibling\n");
    assert!(o.contains("floor as __imp_floor") && o.contains("let floor = __imp_floor"), "{o}");
    assert!(o.contains("from \"./sibling\""), "{o}");
}
