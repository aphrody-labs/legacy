// Shared byte → HTML/XML entity lookup.
//
// `Bun.escapeHTML` is implemented in C++ (system/jsc/bindings/escapeHTML.cpp).
// These helpers remain for the markdown renderer (`system/md/html_renderer.rs`),
// SSR attribute escaping (`system/bun_core/string/MutableString.rs`) and the
// `bun test` JUnit XML reporter (`system/runtime/cli/test_command.rs`), which
// escape byte-by-byte and only need the per-byte entity mapping.

/// HTML entity for one byte. `'` → `&#x27;` (numeric — `&apos;` is not in HTML4).
#[inline(always)]
pub const fn html_escape_entity(c: u8) -> Option<&'static [u8]> {
    match c {
        b'&' => Some(b"&amp;"),
        b'<' => Some(b"&lt;"),
        b'>' => Some(b"&gt;"),
        b'"' => Some(b"&quot;"),
        b'\'' => Some(b"&#x27;"),
        _ => None,
    }
}

/// XML entity for one byte. Differs from [`html_escape_entity`] only in `'` → `&apos;`.
#[inline(always)]
pub const fn xml_escape_entity(c: u8) -> Option<&'static [u8]> {
    match c {
        b'\'' => Some(b"&apos;"),
        _ => html_escape_entity(c),
    }
}
