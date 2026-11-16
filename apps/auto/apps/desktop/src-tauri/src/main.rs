// No extra console on Windows in the published build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    auto_desktop::lancer();
}
