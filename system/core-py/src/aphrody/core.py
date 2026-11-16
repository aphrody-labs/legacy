"""Bindings over Aphrody Core (`aphrody_native` PyO3 extension with `aphrody_core_capi` ctypes fallback)."""

from __future__ import annotations

import ctypes
import json
from functools import lru_cache
from typing import Any

from ._dll import load_cdll

try:
    import aphrody_native as _native  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - exercised when built extension is absent
    _native = None


def has_native_extension() -> bool:
    return _native is not None


@lru_cache(maxsize=1)
def _capi_lib() -> ctypes.CDLL:
    lib = load_cdll("aphrody_core_capi", subdirs=("release", "debug"))
    lib.core_abi_version.argtypes = []
    lib.core_abi_version.restype = ctypes.c_uint32

    lib.core_free.argtypes = [ctypes.c_void_p]
    lib.core_free.restype = None

    lib.core_languages.argtypes = []
    lib.core_languages.restype = ctypes.c_void_p

    lib.core_parse_json.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
    lib.core_parse_json.restype = ctypes.c_void_p

    lib.core_query_json.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p]
    lib.core_query_json.restype = ctypes.c_void_p

    lib.core_blake3_hex.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_uint8)]
    lib.core_blake3_hex.restype = ctypes.c_int32

    lib.core_index_json.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int32]
    lib.core_index_json.restype = ctypes.c_void_p
    return lib


def _consume_c_str(ptr: int | None) -> str:
    if not ptr:
        raise RuntimeError("aphrody_core_capi returned NULL string pointer")
    lib = _capi_lib()
    try:
        raw = ctypes.cast(ptr, ctypes.c_char_p).value
        return "" if raw is None else raw.decode("utf-8")
    finally:
        lib.core_free(ptr)


def abi_version() -> int:
    if _native is not None:
        return int(_native.abi_version())
    return int(_capi_lib().core_abi_version())


def languages() -> list[str]:
    raw = _native.languages() if _native is not None else _consume_c_str(_capi_lib().core_languages())
    return [item for item in raw.split(",") if item]


def parse(path: str, content: str) -> dict[str, Any]:
    if _native is not None:
        return json.loads(_native.parse_json(path, content))
    raw = _consume_c_str(_capi_lib().core_parse_json(path.encode("utf-8"), content.encode("utf-8")))
    data = json.loads(raw)
    if isinstance(data, dict) and "error" in data and "language" not in data:
        raise RuntimeError(str(data["error"]))
    return data


def query(path: str, content: str, pattern: str) -> list[dict[str, Any]]:
    if _native is not None:
        return json.loads(_native.query_json(path, content, pattern))
    raw = _consume_c_str(
        _capi_lib().core_query_json(
            path.encode("utf-8"), content.encode("utf-8"), pattern.encode("utf-8")
        )
    )
    data = json.loads(raw)
    if isinstance(data, dict) and "error" in data:
        raise RuntimeError(str(data["error"]))
    return data


def blake3_hex(data: bytes | bytearray | str) -> str:
    buf = data.encode("utf-8") if isinstance(data, str) else bytes(data)
    if _native is not None:
        return str(_native.blake3_hex(buf))
    out = (ctypes.c_uint8 * 65)()
    rc = int(_capi_lib().core_blake3_hex(buf, len(buf), out))
    if rc != 0:
        raise RuntimeError(f"core_blake3_hex failed with code {rc}")
    return bytes(out[:64]).decode("ascii")


def index_dir(root: str, includes: tuple[str, ...] | list[str] = (), follow_ignore: bool = True) -> dict[str, Any]:
    joined = ";".join(includes)
    if _native is not None:
        return json.loads(_native.index_json(root, joined, follow_ignore))
    raw = _consume_c_str(
        _capi_lib().core_index_json(
            root.encode("utf-8"), joined.encode("utf-8"), 1 if follow_ignore else 0
        )
    )
    return json.loads(raw)
