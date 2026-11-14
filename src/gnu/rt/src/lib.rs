//! Runtime shared by the GNU ports in Rust (docs/native/gnu/OS.md rules 8 and 10):
//! - `init()` restores SIGPIPE to `SIG_DFL` (Rust ignores it, so `prog | head -1` would print a
//!   write error instead of dying silently like a C program);
//! - `version()` builds the GNU-format `--version` text;
//! - `bstr` is the byte-string layer: text files are bytes, never assumed UTF-8.

pub use bstr;

/// Process setup every binary of `src/gnu` runs first.
pub fn init() {
    #[cfg(unix)]
    // SAFETY: `signal` with SIG_DFL installs no handler; called once at start-up, before any thread.
    unsafe {
        libc::signal(libc::SIGPIPE, libc::SIG_DFL);
    }
}

/// `--version` text: `<prog> (GNU <package>) <gnu version>` then the port line.
pub fn version(prog: &str, package: &str, gnu: &str, port: &str) -> String {
    format!("{prog} (GNU {package}) {gnu}\nRust port: aphrody-gnu {port} (MIT OR Apache-2.0)\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_first_line_is_gnu_format() {
        let v = version("time", "Time", "1.10", "0.4.0");
        assert_eq!(v.lines().next(), Some("time (GNU Time) 1.10"));
        assert!(v.contains("aphrody-gnu 0.4.0"));
    }

    #[cfg(unix)]
    #[test]
    fn init_sets_default_sigpipe() {
        init();
        // SAFETY: querying the current disposition with a null new action.
        let mut old: libc::sigaction = unsafe { std::mem::zeroed() };
        let rc = unsafe { libc::sigaction(libc::SIGPIPE, std::ptr::null(), &raw mut old) };
        assert_eq!(rc, 0);
        assert_eq!(old.sa_sigaction, libc::SIG_DFL);
    }
}
