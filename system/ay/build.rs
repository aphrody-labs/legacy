// SPDX-License-Identifier: Apache-2.0
//! Embeds the version resource into ay.exe. Non-fatal: without a resource compiler the build only warns.

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    if let Err(e) = winresource::WindowsResource::new().compile() {
        println!("cargo:warning=version resource not embedded: {e}");
    }
}
