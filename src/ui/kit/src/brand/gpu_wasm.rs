// SPDX-License-Identifier: Apache-2.0
//! Root of the wasm32 cdylib of `gen/gpu/brand-gpu.wasm`. Not a module of aphrody-ui: `brand::web` (stage `gpu`)
//! compiles it with `-Zbuild-std=core` through a throwaway manifest, no dependencies, and it includes the geometry
//! of `gpu.rs` (the same file `brand::model` uses on the host).
//!
//! wasm ABI for assets/brand/web/gpu.ts: `mesh()` fills the static buffers and returns the vertex
//! pointer; `indices()`, `vertex_count()`, `index_count()`; `frame(t, aspect)` returns a pointer to
//! 32 floats. Single-threaded by construction (wasm32-unknown-unknown without atomics).
#![no_std]
#![allow(unsafe_code)]

#[path = "gpu.rs"]
mod gpu;

use gpu::{INDEX_COUNT, Mesh, STRIDE, VERTEX_COUNT};

static mut MESH: Mesh = Mesh { vertices: [0.0; VERTEX_COUNT * STRIDE], indices: [0; INDEX_COUNT] };
static mut FRAME: [f32; 32] = [0.0; 32];

#[unsafe(no_mangle)]
pub extern "C" fn mesh() -> *const f32 {
    // SAFETY: single-threaded wasm; the JS side only reads after this call returns.
    unsafe {
        MESH = gpu::tile();
        (&raw const MESH).cast::<f32>()
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn indices() -> *const u16 {
    // SAFETY: address of a static, no reference is created.
    unsafe { (&raw const MESH.indices).cast::<u16>() }
}

#[unsafe(no_mangle)]
pub extern "C" fn vertex_count() -> u32 {
    VERTEX_COUNT as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn index_count() -> u32 {
    INDEX_COUNT as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn frame(t: f32, aspect: f32) -> *const f32 {
    // SAFETY: single-threaded wasm, written then read by the caller before the next call.
    unsafe {
        FRAME = gpu::frame(t, aspect);
        (&raw const FRAME).cast::<f32>()
    }
}

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    core::arch::wasm32::unreachable()
}
