"""Reverse-engineering bindings over `aphrody-re` (`aphrody_native` PyO3 or `aphrody_ffi.dll` ctypes)."""

from __future__ import annotations

import ctypes
import json
from functools import lru_cache
from typing import Any

from ._dll import load_cdll

try:
    import aphrody_native as _native  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    _native = None


@lru_cache(maxsize=1)
def _ffi_lib() -> ctypes.CDLL:
    lib = load_cdll("aphrody_ffi", subdirs=("release", "debug"))
    lib.aphrody_abi_version.argtypes = []
    lib.aphrody_abi_version.restype = ctypes.c_uint32

    lib.aphrody_free.argtypes = [ctypes.c_void_p]
    lib.aphrody_free.restype = None

    lib.aphrody_re_audit_json.argtypes = [ctypes.c_char_p]
    lib.aphrody_re_audit_json.restype = ctypes.c_void_p

    lib.aphrody_re_audit_bytes_json.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_size_t]
    lib.aphrody_re_audit_bytes_json.restype = ctypes.c_void_p

    lib.aphrody_ghidra_decompile_json.argtypes = [ctypes.c_char_p, ctypes.c_size_t]
    lib.aphrody_ghidra_decompile_json.restype = ctypes.c_void_p

    lib.aphrody_mingw_audit_json.argtypes = [ctypes.c_char_p, ctypes.c_size_t]
    lib.aphrody_mingw_audit_json.restype = ctypes.c_void_p

    lib.aphrody_lua52_transcode_hex.argtypes = [
        ctypes.c_char_p,
        ctypes.c_size_t,
        ctypes.c_uint8,
        ctypes.c_uint8,
    ]
    lib.aphrody_lua52_transcode_hex.restype = ctypes.c_void_p
    return lib


def _consume_ffi_str(ptr: int | None) -> str:
    if not ptr:
        raise RuntimeError("aphrody_ffi returned NULL string pointer")
    lib = _ffi_lib()
    try:
        raw = ctypes.cast(ptr, ctypes.c_char_p).value
        return "" if raw is None else raw.decode("utf-8")
    finally:
        lib.aphrody_free(ptr)


def ffi_abi_version() -> int:
    return int(_ffi_lib().aphrody_abi_version())


def triage(data: bytes | bytearray, strings_limit: int = 64) -> dict[str, Any]:
    if _native is None:
        raise RuntimeError("aphrody.re.triage requires the compiled `aphrody_native` extension")
    return json.loads(_native.re_triage_json(bytes(data), int(strings_limit)))


def audit_file(path: str) -> dict[str, Any]:
    raw = _consume_ffi_str(_ffi_lib().aphrody_re_audit_json(path.encode("utf-8")))
    return json.loads(raw)


def audit_bytes(label: str, data: bytes | bytearray) -> dict[str, Any]:
    buf = bytes(data)
    if _native is not None:
        return json.loads(_native.re_audit_bytes_json(label, buf))
    raw = _consume_ffi_str(
        _ffi_lib().aphrody_re_audit_bytes_json(label.encode("utf-8"), buf, len(buf))
    )
    return json.loads(raw)


def disassemble_x64(data: bytes | bytearray, rip: int = 0, limit: int = 64) -> list[dict[str, Any]]:
    if _native is None:
        raise RuntimeError("aphrody.re.disassemble_x64 requires the compiled `aphrody_native` extension")
    return json.loads(_native.re_disasm_json(bytes(data), int(rip), int(limit)))


def inspect_pdata(data: bytes | bytearray, max_roots: int = 4096) -> dict[str, Any]:
    if _native is None:
        raise RuntimeError("aphrody.re.inspect_pdata requires the compiled `aphrody_native` extension")
    return json.loads(_native.re_pdata_json(bytes(data), int(max_roots)))


def ghidra_decompile_file(path: str, max_functions: int = 32) -> dict[str, Any]:
    raw = _consume_ffi_str(
        _ffi_lib().aphrody_ghidra_decompile_json(path.encode("utf-8"), int(max_functions))
    )
    return json.loads(raw)


def ghidra_decompile_bytes(data: bytes | bytearray, max_functions: int = 32) -> dict[str, Any]:
    if _native is None:
        raise RuntimeError(
            "aphrody.re.ghidra_decompile_bytes requires the compiled `aphrody_native` extension"
        )
    return json.loads(_native.re_ghidra_decompile_bytes_json(bytes(data), int(max_functions)))


def mingw_audit(path: str, max_functions: int = 64) -> dict[str, Any]:
    if _native is not None:
        return json.loads(_native.re_mingw_audit_json(path, int(max_functions)))
    raw = _consume_ffi_str(_ffi_lib().aphrody_mingw_audit_json(path.encode("utf-8"), int(max_functions)))
    return json.loads(raw)


def lua52_audit(data: bytes | bytearray) -> dict[str, Any]:
    if _native is None:
        raise RuntimeError("aphrody.re.lua52_audit requires the compiled `aphrody_native` extension")
    return json.loads(_native.re_lua52_audit_json(bytes(data)))


def lua52_transcode(data: bytes | bytearray, target_int: int = 4, target_sizet: int = 4) -> bytes:
    buf = bytes(data)
    if _native is not None:
        return bytes(_native.re_lua52_transcode(buf, int(target_int), int(target_sizet)))
    raw = _consume_ffi_str(
        _ffi_lib().aphrody_lua52_transcode_hex(buf, len(buf), int(target_int), int(target_sizet))
    )
    res = json.loads(raw)
    if "error" in res:
        raise RuntimeError(str(res["error"]))
    return bytes.fromhex(res["hex"])
