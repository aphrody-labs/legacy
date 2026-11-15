//! Safe Rust binding of the Aphrody AI router C ABI (`src/include/ay/router.h`).
//!
//! ```no_run
//! let r = ay_router::Router::open("https://router.aphrody.com", 0, Some("key")).unwrap();
//! let reply = r.chat("auto:free", r#"[{"role":"user","content":"hi"}]"#).unwrap();
//! ```
use std::ffi::{CString, c_char, c_int, c_uint, c_ushort};

#[repr(C)]
struct Raw {
    _p: [u8; 0],
}

unsafe extern "C" {
    fn ay_router_abi_version() -> c_uint;
    fn ay_router_open(host: *const c_char, port: c_ushort, key: *const c_char) -> *mut Raw;
    fn ay_router_request(r: *mut Raw, m: *const c_char, p: *const c_char, b: *const c_char, out: *mut c_char, cap: usize) -> c_int;
    fn ay_router_chat(r: *mut Raw, model: *const c_char, msgs: *const c_char, out: *mut c_char, cap: usize) -> c_int;
    fn ay_router_models(r: *mut Raw, out: *mut c_char, cap: usize) -> c_int;
    fn ay_router_close(r: *mut Raw);
}

/// ABI version of the linked C library.
pub fn abi_version() -> u32 {
    unsafe { ay_router_abi_version() }
}

/// HTTP status (>= 100) and body, or a negative `AY_ROUTER_E*` code.
#[derive(Debug)]
pub struct Reply {
    pub status: i32,
    pub body: String,
}

#[derive(Debug)]
pub enum Error {
    Open,
    Nul,
    Code(i32),
}

pub struct Router(*mut Raw);

unsafe impl Send for Router {}

const CAP: usize = 4 << 20;

impl Router {
    pub fn open(host: &str, port: u16, key: Option<&str>) -> Result<Self, Error> {
        let h = CString::new(host).map_err(|_| Error::Nul)?;
        let k = key.map(CString::new).transpose().map_err(|_| Error::Nul)?;
        let p = unsafe { ay_router_open(h.as_ptr(), port, k.as_ref().map_or(std::ptr::null(), |k| k.as_ptr())) };
        if p.is_null() { Err(Error::Open) } else { Ok(Self(p)) }
    }

    fn run(&self, f: impl FnOnce(*mut c_char) -> c_int) -> Result<Reply, Error> {
        let mut buf = vec![0u8; CAP];
        let status = f(buf.as_mut_ptr().cast());
        if status < 0 {
            return Err(Error::Code(status));
        }
        let n = buf.iter().position(|&b| b == 0).unwrap_or(0);
        buf.truncate(n);
        Ok(Reply { status, body: String::from_utf8_lossy(&buf).into_owned() })
    }

    pub fn chat(&self, model: &str, messages_json: &str) -> Result<Reply, Error> {
        let m = CString::new(model).map_err(|_| Error::Nul)?;
        let j = CString::new(messages_json).map_err(|_| Error::Nul)?;
        self.run(|out| unsafe { ay_router_chat(self.0, m.as_ptr(), j.as_ptr(), out, CAP) })
    }

    pub fn models(&self) -> Result<Reply, Error> {
        self.run(|out| unsafe { ay_router_models(self.0, out, CAP) })
    }

    pub fn request(&self, method: &str, path: &str, body: Option<&str>) -> Result<Reply, Error> {
        let m = CString::new(method).map_err(|_| Error::Nul)?;
        let p = CString::new(path).map_err(|_| Error::Nul)?;
        let b = body.map(CString::new).transpose().map_err(|_| Error::Nul)?;
        self.run(|out| unsafe { ay_router_request(self.0, m.as_ptr(), p.as_ptr(), b.as_ref().map_or(std::ptr::null(), |b| b.as_ptr()), out, CAP) })
    }
}

impl Drop for Router {
    fn drop(&mut self) {
        unsafe { ay_router_close(self.0) }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn abi() {
        assert_eq!(super::abi_version(), 1);
    }

    /// Live call when AY_ROUTER_KEY is set (CI and fleet): `cargo test -p ay-router -- --ignored`.
    #[test]
    #[ignore]
    fn live_chat() {
        let key = std::env::var("AY_ROUTER_KEY").expect("AY_ROUTER_KEY");
        let r = super::Router::open("https://router.aphrody.com", 0, Some(&key)).unwrap();
        let rep = r.chat("auto:free", r#"[{"role":"user","content":"Reply with exactly: pong"}]"#).unwrap();
        assert_eq!(rep.status, 200, "{}", rep.body);
        assert!(rep.body.to_lowercase().contains("pong"), "{}", rep.body);
    }
}
