"""Shared native DLL resolver for Aphrody's ctypes bindings."""

from __future__ import annotations

import ctypes
import os
import sys
from pathlib import Path

_EXT = ".dll" if sys.platform == "win32" else (".dylib" if sys.platform == "darwin" else ".so")
_PREFIX = "" if sys.platform == "win32" else "lib"


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "Cargo.toml").is_file() and (parent / "crates" / "core").is_dir():
            return parent
    return here.parents[3]


def find_library(base_name: str, subdirs: tuple[str, ...] = ("release", "debug", "sys")) -> Path:
    """Locate an Aphrody shared library across env overrides, package data, and target dirs."""
    env_key = f"APHRODY_{base_name.upper()}_LIB"
    if env_val := os.environ.get(env_key):
        candidate = Path(env_val)
        if candidate.is_file():
            return candidate

    lib_file = f"{_PREFIX}{base_name}{_EXT}"
    pkg_dir = Path(__file__).resolve().parent
    root = _repo_root()

    candidates: list[Path] = [pkg_dir / lib_file]
    if lib_dir := os.environ.get("APHRODY_LIB_DIR"):
        candidates.append(Path(lib_dir) / lib_file)
    for sub in subdirs:
        candidates.append(root / "target" / sub / lib_file)

    for cand in candidates:
        if cand.is_file():
            return cand
    raise FileNotFoundError(
        f"Native library `{lib_file}` not found; searched {', '.join(str(c) for c in candidates)}"
    )


def load_cdll(base_name: str, subdirs: tuple[str, ...] = ("release", "debug", "sys")) -> ctypes.CDLL:
    """Load an Aphrody C ABI shared library via ctypes."""
    return ctypes.CDLL(str(find_library(base_name, subdirs=subdirs)))
