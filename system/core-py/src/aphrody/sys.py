"""Bindings over Aphrody Layer-0 C core (`kernel/include/ay/sys.h` / `aysys.dll`)."""

from __future__ import annotations

import ctypes
from dataclasses import dataclass
from functools import lru_cache

from ._dll import load_cdll


class _CAyCpuCaps(ctypes.Structure):
    _fields_ = [
        ("vendor_id", ctypes.c_uint32),
        ("family", ctypes.c_uint32),
        ("model", ctypes.c_uint32),
        ("stepping", ctypes.c_uint32),
        ("features", ctypes.c_uint64),
    ]


@dataclass(frozen=True, slots=True)
class CpuCaps:
    vendor_id: int
    family: int
    model: int
    stepping: int
    features: int


@lru_cache(maxsize=1)
def _sys_lib() -> ctypes.CDLL:
    lib = load_cdll("aysys", subdirs=("sys", "release", "debug"))
    lib.ay_sys_abi_version.argtypes = []
    lib.ay_sys_abi_version.restype = ctypes.c_uint32

    lib.ay_fnv1a64.argtypes = [ctypes.c_char_p, ctypes.c_size_t]
    lib.ay_fnv1a64.restype = ctypes.c_uint64

    lib.ay_cpu_probe.argtypes = [ctypes.POINTER(_CAyCpuCaps)]
    lib.ay_cpu_probe.restype = ctypes.c_int32

    lib.ay_ui_window_class.argtypes = [ctypes.c_uint32]
    lib.ay_ui_window_class.restype = ctypes.c_uint32

    lib.ay_ui_color_argb.argtypes = [ctypes.c_uint32, ctypes.c_uint32]
    lib.ay_ui_color_argb.restype = ctypes.c_uint32
    return lib


def sys_abi_version() -> int:
    return int(_sys_lib().ay_sys_abi_version())


def fnv1a64(data: bytes | bytearray | str) -> int:
    buf = data.encode("utf-8") if isinstance(data, str) else bytes(data)
    return int(_sys_lib().ay_fnv1a64(buf, len(buf)))


def cpu_probe() -> CpuCaps:
    caps = _CAyCpuCaps()
    rc = int(_sys_lib().ay_cpu_probe(ctypes.byref(caps)))
    if rc < 0:
        raise OSError(f"ay_cpu_probe failed with status {rc}")
    return CpuCaps(
        vendor_id=int(caps.vendor_id),
        family=int(caps.family),
        model=int(caps.model),
        stepping=int(caps.stepping),
        features=int(caps.features),
    )


def ui_window_class(width_dp: int) -> int:
    return int(_sys_lib().ay_ui_window_class(int(width_dp)))


def ui_color_argb(theme_mode: int, role_id: int) -> int:
    return int(_sys_lib().ay_ui_color_argb(int(theme_mode), int(role_id)))
