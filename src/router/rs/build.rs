// Compiles src/router/router.c with the host C compiler (clang preferred) and links the OS TLS stack.
use std::{env, path::PathBuf, process::Command};

fn main() {
    let root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../..");
    let src = root.join("router/router.c");
    println!("cargo:rerun-if-changed={}", src.display());
    println!("cargo:rerun-if-changed={}", root.join("include/ay/router.h").display());
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let target = env::var("TARGET").unwrap();
    let windows = target.contains("windows");
    let cc = env::var("CC").unwrap_or_else(|_| "clang".into());
    let obj = out.join(if windows { "router.obj" } else { "router.o" });
    let mut c = Command::new(&cc);
    c.args(["-std=c11", "-O2", "-c", "-fPIC"]).arg(format!("--target={target}")).arg(&src).arg("-o").arg(&obj);
    if !windows {
        c.arg("-D_POSIX_C_SOURCE=200809L");
    } else {
        c.args(["-D_CRT_SECURE_NO_WARNINGS"]);
        if let Ok(sdk) = env::var("WINSDK") {
            c.args(["-Xmicrosoft-windows-sdk-version", &sdk]);
        }
    }
    assert!(c.status().expect("C compiler").success(), "compiling router.c failed");
    let lib = out.join(if windows { "ayrouter.lib" } else { "libayrouter.a" });
    let ar = if windows { "llvm-lib" } else { "ar" };
    let mut a = Command::new(ar);
    if windows { a.arg(format!("/out:{}", lib.display())).arg(&obj); } else { a.arg("crs").arg(&lib).arg(&obj); }
    assert!(a.status().expect("archiver").success(), "archiving failed");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=ayrouter");
    if windows {
        println!("cargo:rustc-link-lib=ws2_32");
        println!("cargo:rustc-link-lib=winhttp");
    } else {
        println!("cargo:rustc-link-lib=dl");
    }
}
