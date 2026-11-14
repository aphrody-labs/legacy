//! `ed` binary: see `gnu_ed`.
fn main() {
    gnu_rt::init();
    std::process::exit(gnu_ed::main());
}
