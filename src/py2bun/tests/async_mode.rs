use py2bun::{transpile, transpile_with, AsyncMode};

fn ts(src: &str) -> String {
    let o = transpile(src);
    assert!(!o.ts.is_empty(), "{:?}", o.diagnostics);
    o.ts
}

#[test]
fn ghidra_scripts_are_async() {
    let t = ts("def walk(p):\n    for f in p.getFunctionManager().getFunctions(True):\n        println(f.getName())\nwalk(currentProgram)\n");
    assert!(t.contains("async function walk(p)"));
    assert!(t.contains("for await (f of __py.aiter((await (await p.getFunctionManager()).getFunctions(true))))"));
    assert!(t.contains("(await println((await f.getName())))"));
    assert!(t.contains("(await walk(currentProgram))"));
}

#[test]
fn plain_python_stays_sync() {
    let t = ts("def f(x):\n    return len(x)\nprint(f([1]))\n");
    assert!(t.contains("function f(x)") && !t.contains("async"));
    assert!(!t.contains("await"));
}

#[test]
fn forced_modes() {
    assert!(transpile_with("def f():\n    pass\n", AsyncMode::On).ts.contains("async function f()"));
    assert!(!transpile_with("println(1)\n", AsyncMode::Off).ts.contains("await"));
}

#[test]
fn java_classes_construct_through_new_and_builtins_use_async_variants() {
    let t = ts("from java.util import ArrayList\nl = ArrayList()\nn = len(currentProgram.getListing())\ns = \"%s\" % l\n");
    assert!(t.contains("(await ArrayList.new_())"));
    assert!(t.contains("(await __py.a_len("));
    assert!(t.contains("(await __py.a_mod(\"%s\", l))"));
}

#[test]
fn constructors_lambdas_and_accessors_do_not_await() {
    let o = transpile("class A:\n    def __init__(self):\n        self.p = currentProgram.getName()\nkey = lambda f: f.getName()\n");
    assert!(o.ts.contains("constructor()") && !o.ts.contains("async constructor"));
    assert!(o.diagnostics.iter().filter(|d| d.message.contains("not awaited")).count() >= 2);
}

#[test]
fn pyghidra_names_are_camel_cased() {
    let t = ts("import pyghidra\npyghidra.start()\nh = pyghidra.open_program('a.exe')\nfrom pyghidra import open_program as op\n");
    assert!(t.contains("import * as pyghidra from \"@aphrody/ghidra\";"));
    assert!(t.contains("pyghidra.openProgram("));
    assert!(t.contains("import { openProgram as op } from \"@aphrody/ghidra\";"));
}
