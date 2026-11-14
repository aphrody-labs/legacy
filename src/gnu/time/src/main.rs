//! `time` binary: see `gnu_time`.
fn main() {
    gnu_rt::init();
    std::process::exit(gnu_time::main());
}
