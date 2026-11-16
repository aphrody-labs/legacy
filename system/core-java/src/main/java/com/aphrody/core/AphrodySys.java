package com.aphrody.core;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemoryLayout;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.foreign.ValueLayout;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;

/** Java 25 Foreign Function &amp; Memory (FFM) bindings for Aphrody Layer-0 C core (`src/include/ay/sys.h` / `aysys.dll`). */
public final class AphrodySys {
    public record CpuCaps(int vendorId, int family, int model, int stepping, long features) {}

    private static final MemoryLayout CPU_CAPS_LAYOUT = MemoryLayout.structLayout(
        ValueLayout.JAVA_INT.withName("vendor_id"),
        ValueLayout.JAVA_INT.withName("family"),
        ValueLayout.JAVA_INT.withName("model"),
        ValueLayout.JAVA_INT.withName("stepping"),
        ValueLayout.JAVA_LONG.withName("features")
    );

    private static volatile MethodHandle hAbiVersion;
    private static volatile MethodHandle hFnv1a64;
    private static volatile MethodHandle hCpuProbe;
    private static volatile MethodHandle hWindowClass;
    private static volatile MethodHandle hColorArgb;
    private static volatile boolean initialized;

    private AphrodySys() {}

    private static synchronized void ensureInit() {
        if (initialized) {
            return;
        }
        Linker linker = Linker.nativeLinker();
        SymbolLookup lookup = NativeLibraryLoader.lookupLibrary("aysys", "sys", "release", "debug");

        hAbiVersion = linker.downcallHandle(
            lookup.findOrThrow("ay_sys_abi_version"),
            FunctionDescriptor.of(ValueLayout.JAVA_INT)
        );
        hFnv1a64 = linker.downcallHandle(
            lookup.findOrThrow("ay_fnv1a64"),
            FunctionDescriptor.of(ValueLayout.JAVA_LONG, ValueLayout.ADDRESS, ValueLayout.JAVA_LONG)
        );
        hCpuProbe = linker.downcallHandle(
            lookup.findOrThrow("ay_cpu_probe"),
            FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS)
        );
        hWindowClass = linker.downcallHandle(
            lookup.findOrThrow("ay_ui_window_class"),
            FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.JAVA_INT)
        );
        hColorArgb = linker.downcallHandle(
            lookup.findOrThrow("ay_ui_color_argb"),
            FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.JAVA_INT, ValueLayout.JAVA_INT)
        );
        initialized = true;
    }

    public static int sysAbiVersion() {
        ensureInit();
        try {
            return (int) hAbiVersion.invokeExact();
        } catch (Throwable t) {
            throw new RuntimeException(t);
        }
    }

    public static long fnv1a64(byte[] data) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment seg = data.length == 0
                ? MemorySegment.NULL
                : arena.allocateFrom(ValueLayout.JAVA_BYTE, data);
            return (long) hFnv1a64.invokeExact(seg, (long) data.length);
        } catch (Throwable t) {
            throw new RuntimeException(t);
        }
    }

    public static long fnv1a64(String text) {
        return fnv1a64(text.getBytes(StandardCharsets.UTF_8));
    }

    public static CpuCaps cpuProbe() {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment seg = arena.allocate(CPU_CAPS_LAYOUT);
            int rc = (int) hCpuProbe.invokeExact(seg);
            if (rc < 0) {
                throw new IllegalStateException("ay_cpu_probe failed with status " + rc);
            }
            return new CpuCaps(
                seg.get(ValueLayout.JAVA_INT, 0),
                seg.get(ValueLayout.JAVA_INT, 4),
                seg.get(ValueLayout.JAVA_INT, 8),
                seg.get(ValueLayout.JAVA_INT, 12),
                seg.get(ValueLayout.JAVA_LONG, 16)
            );
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static int uiWindowClass(int widthDp) {
        ensureInit();
        try {
            return (int) hWindowClass.invokeExact(widthDp);
        } catch (Throwable t) {
            throw new RuntimeException(t);
        }
    }

    public static int uiColorArgb(int themeMode, int roleId) {
        ensureInit();
        try {
            return (int) hColorArgb.invokeExact(themeMode, roleId);
        } catch (Throwable t) {
            throw new RuntimeException(t);
        }
    }
}
