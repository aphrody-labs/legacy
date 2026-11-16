fn main() {
    // Started as a tool shim (`llama-cli.exe` + `llama-cli.shim`, written by `ay up`).
    if let Some(code) = up::shim::run_if_shim() {
        std::process::exit(code);
    }
    let mut argv = std::env::args();
    // Started under the WinuxCmd name (`winuxcmd.exe <applet> args...`, the shape of its differential harness): the applet multicall.
    let program = argv.next().unwrap_or_default();
    let stem = std::path::Path::new(&program).file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_ascii_lowercase();
    let args: Vec<String> = argv.collect();
    if stem == "winuxcmd" {
        std::process::exit(ay::applet::run(&args));
    }
    std::process::exit(ay::run(&args));
}
