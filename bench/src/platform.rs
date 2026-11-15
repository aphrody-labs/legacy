//! Platform shim of the benchmark suite: a high-resolution monotonic counter
//! (`QueryPerformanceCounter` on Windows, `Instant` nanoseconds elsewhere) and an
//! anonymous page-backed memory mapping (`CreateFileMappingW`/`MapViewOfFile` on Windows,
//! `mmap`/`munmap` on Unix).

#[cfg(windows)]
mod imp {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Memory::{
        CreateFileMappingW, FILE_MAP_ALL_ACCESS, MEMORY_MAPPED_VIEW_ADDRESS, MapViewOfFile,
        PAGE_READWRITE, UnmapViewOfFile,
    };
    use windows_sys::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

    pub fn counter_frequency() -> u64 {
        let mut f: i64 = 0;
        // SAFETY: `f` is a valid out pointer for the duration of the call.
        unsafe { QueryPerformanceFrequency(&mut f) };
        f as u64
    }

    pub fn counter_now() -> u64 {
        let mut c: i64 = 0;
        // SAFETY: `c` is a valid out pointer for the duration of the call.
        unsafe { QueryPerformanceCounter(&mut c) };
        c as u64
    }

    pub struct MappedRegion {
        handle: HANDLE,
        view: MEMORY_MAPPED_VIEW_ADDRESS,
        len: usize,
    }

    impl MappedRegion {
        pub fn new(len: usize) -> Result<Self, String> {
            // SAFETY: plain Win32 calls; every failure path releases what was acquired.
            unsafe {
                let handle = CreateFileMappingW(
                    INVALID_HANDLE_VALUE,
                    null_mut(),
                    PAGE_READWRITE,
                    (len >> 32) as u32,
                    (len & 0xFFFF_FFFF) as u32,
                    null_mut(),
                );
                if handle.is_null() {
                    return Err("Win32 CreateFileMappingW failed".into());
                }
                let view = MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, len);
                if view.Value.is_null() {
                    CloseHandle(handle);
                    return Err("Win32 MapViewOfFile failed".into());
                }
                Ok(Self { handle, view, len })
            }
        }

        pub fn as_mut_slice(&mut self) -> &mut [u8] {
            // SAFETY: the view maps `len` readable and writable bytes until `drop`.
            unsafe { std::slice::from_raw_parts_mut(self.view.Value as *mut u8, self.len) }
        }
    }

    impl Drop for MappedRegion {
        fn drop(&mut self) {
            // SAFETY: `view` and `handle` were acquired in `new` and are released once.
            unsafe {
                UnmapViewOfFile(self.view);
                CloseHandle(self.handle);
            }
        }
    }
}

#[cfg(unix)]
mod imp {
    use std::ptr::null_mut;
    use std::sync::OnceLock;
    use std::time::Instant;

    pub fn counter_frequency() -> u64 {
        1_000_000_000
    }

    pub fn counter_now() -> u64 {
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_nanos() as u64
    }

    pub struct MappedRegion {
        ptr: *mut u8,
        len: usize,
    }

    impl MappedRegion {
        pub fn new(len: usize) -> Result<Self, String> {
            // SAFETY: anonymous private mapping, no file descriptor involved.
            let p = unsafe {
                libc::mmap(
                    null_mut(),
                    len,
                    libc::PROT_READ | libc::PROT_WRITE,
                    libc::MAP_PRIVATE | libc::MAP_ANONYMOUS,
                    -1,
                    0,
                )
            };
            if p == libc::MAP_FAILED {
                return Err(format!("mmap failed: {}", std::io::Error::last_os_error()));
            }
            Ok(Self { ptr: p.cast(), len })
        }

        pub fn as_mut_slice(&mut self) -> &mut [u8] {
            // SAFETY: the mapping holds `len` readable and writable bytes until `drop`.
            unsafe { std::slice::from_raw_parts_mut(self.ptr, self.len) }
        }
    }

    impl Drop for MappedRegion {
        fn drop(&mut self) {
            // SAFETY: `ptr`/`len` come from the successful `mmap` in `new` and are unmapped once.
            unsafe { libc::munmap(self.ptr.cast(), self.len) };
        }
    }
}

pub use imp::{MappedRegion, counter_frequency, counter_now};
