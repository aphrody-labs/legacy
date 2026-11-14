//! `which` binary: see `gnu_which`.
fn main() {
    gnu_rt::init();
    std::process::exit(gnu_which::main());
}
