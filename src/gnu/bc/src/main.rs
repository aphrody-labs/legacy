//! `bc` binary: see `gnu_bc`.
fn main() {
    gnu_rt::init();
    std::process::exit(gnu_bc::main());
}
