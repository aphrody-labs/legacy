//! `m4` binary: see `gnu_m4`.
fn main() {
    gnu_rt::init();
    std::process::exit(gnu_m4::main());
}
