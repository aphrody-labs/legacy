"""End-to-end tests for Aphrody Python core (C `aysys.dll`, `aphrody_core_capi.dll`, and PyO3 `aphrody_native`)."""

from __future__ import annotations

import hashlib
import os
import sys
import unittest
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import aphrody  # noqa: E402


class AphrodyCorePythonTest(unittest.TestCase):
    def test_c_sys_abi_and_cpu_probe(self) -> None:
        self.assertGreaterEqual(aphrody.sys.sys_abi_version(), 1)
        h = aphrody.sys.fnv1a64(b"aphrody")
        self.assertIsInstance(h, int)
        self.assertNotEqual(h, 0)
        caps = aphrody.sys.cpu_probe()
        self.assertGreater(caps.family, 0)
        self.assertGreaterEqual(aphrody.sys.ui_window_class(1280), 0)
        self.assertNotEqual(aphrody.sys.ui_color_argb(1, 0), 0)

    def test_core_parse_query_and_blake3(self) -> None:
        self.assertGreaterEqual(aphrody.core.abi_version(), 1)
        langs = aphrody.core.languages()
        self.assertIn("rust", langs)
        self.assertIn("python", langs)

        parsed = aphrody.core.parse("sample.rs", "pub fn hello(x: i32) -> i32 { x + 1 }\n")
        self.assertEqual(parsed["language"], "rust")
        names = [s["name"] for s in parsed.get("symbols", [])]
        self.assertIn("hello", names)

        matches = aphrody.core.query("sample.rs", "pub fn hello() {}", "(function_item name: (identifier) @fn)")
        self.assertTrue(any(m.get("text") == "hello" for m in matches))

        digest = aphrody.core.blake3_hex(b"aphrody")
        self.assertEqual(len(digest), 64)
        # Verify BLAKE3 is distinct from SHA-256 and deterministic
        self.assertNotEqual(digest, hashlib.sha256(b"aphrody").hexdigest())
        self.assertEqual(digest, aphrody.core.blake3_hex(b"aphrody"))

    def test_re_native_and_ffi_dll(self) -> None:
        self.assertGreaterEqual(aphrody.re.ffi_abi_version(), 1)

        sys_dll = Path(__file__).resolve().parents[3] / "target" / "sys" / "aysys.dll"
        if sys_dll.is_file():
            raw_dll = sys_dll.read_bytes()
            pe_audit = aphrody.re.audit_bytes("aysys.dll", raw_dll)
            self.assertEqual(pe_audit["format"]["format"], "PE")
            file_audit = aphrody.re.audit_file(str(sys_dll))
            self.assertEqual(file_audit["format"]["format"], "PE")

        if aphrody.core.has_native_extension():
            triage = aphrody.re.triage(b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 56)
            self.assertEqual(triage["format"], "elf64")
            insns = aphrody.re.disassemble_x64(b"\x55\x48\x89\xe5\xb8\x2a\x00\x00\x00\x5d\xc3", 0x1000, 16)
            self.assertGreaterEqual(len(insns), 4)
            self.assertTrue(any("ret" in insn["formatted"] for insn in insns))


if __name__ == "__main__":
    unittest.main()
