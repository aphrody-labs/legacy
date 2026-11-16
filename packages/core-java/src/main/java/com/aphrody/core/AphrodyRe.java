package com.aphrody.core;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.foreign.ValueLayout;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;

/** Java 25 FFM bindings over `aphrody_core_capi` (`aphrody_re_*`, Ghidra, MinGW-REA, Lua 5.2) + JNI delegation via {@link AphrodyNative}. */
public final class AphrodyRe {
    private static volatile MethodHandle hAbiVersion;
    private static volatile MethodHandle hFree;
    private static volatile MethodHandle hReAuditFile;
    private static volatile MethodHandle hReAuditBytes;
    private static volatile MethodHandle hGhidraFile;
    private static volatile MethodHandle hMingwFile;
    private static volatile MethodHandle hLuaTranscodeHex;
    private static volatile boolean initialized;

    private AphrodyRe() {}

    private static synchronized void ensureInit() {
        if (initialized) {
            return;
        }
        Linker linker = Linker.nativeLinker();
        SymbolLookup lookup = NativeLibraryLoader.lookupLibrary("aphrody_core_capi", "release", "debug");

        hAbiVersion = linker.downcallHandle(
            lookup.findOrThrow("aphrody_abi_version"),
            FunctionDescriptor.of(ValueLayout.JAVA_INT)
        );
        hFree = linker.downcallHandle(
            lookup.findOrThrow("aphrody_free"),
            FunctionDescriptor.ofVoid(ValueLayout.ADDRESS)
        );
        hReAuditFile = linker.downcallHandle(
            lookup.findOrThrow("aphrody_re_audit_json"),
            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS)
        );
        hReAuditBytes = linker.downcallHandle(
            lookup.findOrThrow("aphrody_re_audit_bytes_json"),
            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.JAVA_LONG)
        );
        hGhidraFile = linker.downcallHandle(
            lookup.findOrThrow("aphrody_ghidra_decompile_json"),
            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.JAVA_LONG)
        );
        hMingwFile = linker.downcallHandle(
            lookup.findOrThrow("aphrody_mingw_audit_json"),
            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.JAVA_LONG)
        );
        hLuaTranscodeHex = linker.downcallHandle(
            lookup.findOrThrow("aphrody_lua52_transcode_hex"),
            FunctionDescriptor.of(
                ValueLayout.ADDRESS,
                ValueLayout.ADDRESS,
                ValueLayout.JAVA_LONG,
                ValueLayout.JAVA_BYTE,
                ValueLayout.JAVA_BYTE
            )
        );
        initialized = true;
    }

    private static String consumeFfiString(MemorySegment ptr) {
        if (ptr == null || ptr.equals(MemorySegment.NULL)) {
            throw new IllegalStateException("aphrody_core_capi returned NULL string pointer");
        }
        try {
            return ptr.reinterpret(Long.MAX_VALUE).getString(0, StandardCharsets.UTF_8);
        } finally {
            try {
                hFree.invokeExact(ptr);
            } catch (Throwable ignored) {
            }
        }
    }

    public static int ffiAbiVersion() {
        ensureInit();
        try {
            return (int) hAbiVersion.invokeExact();
        } catch (Throwable t) {
            throw new RuntimeException(t);
        }
    }

    public static String auditFileJson(String path) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment pSeg = arena.allocateFrom(path, StandardCharsets.UTF_8);
            MemorySegment res = (MemorySegment) hReAuditFile.invokeExact(pSeg);
            return consumeFfiString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String auditBytesJson(String label, byte[] data) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment lSeg = arena.allocateFrom(label, StandardCharsets.UTF_8);
            MemorySegment bSeg = data.length == 0
                ? MemorySegment.NULL
                : arena.allocateFrom(ValueLayout.JAVA_BYTE, data);
            MemorySegment res = (MemorySegment) hReAuditBytes.invokeExact(lSeg, bSeg, (long) data.length);
            return consumeFfiString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String ghidraDecompileFileJson(String path, long maxFunctions) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment pSeg = arena.allocateFrom(path, StandardCharsets.UTF_8);
            MemorySegment res = (MemorySegment) hGhidraFile.invokeExact(pSeg, maxFunctions);
            return consumeFfiString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String mingwAuditFileJson(String path, long maxFunctions) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment pSeg = arena.allocateFrom(path, StandardCharsets.UTF_8);
            MemorySegment res = (MemorySegment) hMingwFile.invokeExact(pSeg, maxFunctions);
            return consumeFfiString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String lua52TranscodeHex(byte[] data, int targetInt, int targetSizeT) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment bSeg = data.length == 0
                ? MemorySegment.NULL
                : arena.allocateFrom(ValueLayout.JAVA_BYTE, data);
            MemorySegment res = (MemorySegment) hLuaTranscodeHex.invokeExact(
                bSeg,
                (long) data.length,
                (byte) targetInt,
                (byte) targetSizeT
            );
            return consumeFfiString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String triageJson(byte[] data, int stringsLimit) {
        return AphrodyNative.reTriageJson(data, stringsLimit);
    }

    public static String disassembleX64Json(byte[] data, long rip, int limit) {
        return AphrodyNative.reDisasmJson(data, rip, limit);
    }

    public static String pdataJson(byte[] data, int maxRoots) {
        return AphrodyNative.rePdataJson(data, maxRoots);
    }

    public static String ghidraDecompileBytesJson(byte[] data, int maxFunctions) {
        return AphrodyNative.reGhidraDecompileBytesJson(data, maxFunctions);
    }
}
