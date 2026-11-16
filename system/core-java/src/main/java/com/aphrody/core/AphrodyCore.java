package com.aphrody.core;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.foreign.ValueLayout;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

/** Java 25 FFM bindings over `aphrody_core_capi` (`core_*`), with JNI bridge parity in {@link AphrodyNative}. */
public final class AphrodyCore {
    private static volatile MethodHandle hAbiVersion;
    private static volatile MethodHandle hFree;
    private static volatile MethodHandle hLanguages;
    private static volatile MethodHandle hParseJson;
    private static volatile MethodHandle hQueryJson;
    private static volatile MethodHandle hBlake3Hex;
    private static volatile MethodHandle hIndexJson;
    private static volatile boolean initialized;

    private AphrodyCore() {}

    private static synchronized void ensureInit() {
        if (initialized) {
            return;
        }
        Linker linker = Linker.nativeLinker();
        SymbolLookup lookup = NativeLibraryLoader.lookupLibrary("aphrody_core_capi", "release", "debug");

        hAbiVersion = linker.downcallHandle(
            lookup.findOrThrow("core_abi_version"),
            FunctionDescriptor.of(ValueLayout.JAVA_INT)
        );
        hFree = linker.downcallHandle(
            lookup.findOrThrow("core_free"),
            FunctionDescriptor.ofVoid(ValueLayout.ADDRESS)
        );
        hLanguages = linker.downcallHandle(
            lookup.findOrThrow("core_languages"),
            FunctionDescriptor.of(ValueLayout.ADDRESS)
        );
        hParseJson = linker.downcallHandle(
            lookup.findOrThrow("core_parse_json"),
            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.ADDRESS)
        );
        hQueryJson = linker.downcallHandle(
            lookup.findOrThrow("core_query_json"),
            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.ADDRESS)
        );
        hBlake3Hex = linker.downcallHandle(
            lookup.findOrThrow("core_blake3_hex"),
            FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS, ValueLayout.JAVA_LONG, ValueLayout.ADDRESS)
        );
        hIndexJson = linker.downcallHandle(
            lookup.findOrThrow("core_index_json"),
            FunctionDescriptor.of(ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.ADDRESS, ValueLayout.JAVA_INT)
        );
        initialized = true;
    }

    private static String consumeCString(MemorySegment ptr) {
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

    public static int abiVersion() {
        ensureInit();
        try {
            return (int) hAbiVersion.invokeExact();
        } catch (Throwable t) {
            throw new RuntimeException(t);
        }
    }

    public static List<String> languages() {
        ensureInit();
        try {
            MemorySegment ptr = (MemorySegment) hLanguages.invokeExact();
            String csv = consumeCString(ptr);
            return Arrays.stream(csv.split(",")).filter(s -> !s.isEmpty()).toList();
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String parseJson(String path, String content) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment pSeg = arena.allocateFrom(path, StandardCharsets.UTF_8);
            MemorySegment cSeg = arena.allocateFrom(content, StandardCharsets.UTF_8);
            MemorySegment res = (MemorySegment) hParseJson.invokeExact(pSeg, cSeg);
            return consumeCString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String queryJson(String path, String content, String query) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment pSeg = arena.allocateFrom(path, StandardCharsets.UTF_8);
            MemorySegment cSeg = arena.allocateFrom(content, StandardCharsets.UTF_8);
            MemorySegment qSeg = arena.allocateFrom(query, StandardCharsets.UTF_8);
            MemorySegment res = (MemorySegment) hQueryJson.invokeExact(pSeg, cSeg, qSeg);
            return consumeCString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String blake3Hex(byte[] data) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment inSeg = data.length == 0
                ? MemorySegment.NULL
                : arena.allocateFrom(ValueLayout.JAVA_BYTE, data);
            MemorySegment outSeg = arena.allocate(65);
            int rc = (int) hBlake3Hex.invokeExact(inSeg, (long) data.length, outSeg);
            if (rc != 0) {
                throw new IllegalStateException("core_blake3_hex failed with code " + rc);
            }
            return outSeg.getString(0, StandardCharsets.US_ASCII);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }

    public static String indexJson(String root, String includes, boolean followIgnore) {
        ensureInit();
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment rSeg = arena.allocateFrom(root, StandardCharsets.UTF_8);
            MemorySegment iSeg = arena.allocateFrom(includes == null ? "" : includes, StandardCharsets.UTF_8);
            MemorySegment res = (MemorySegment) hIndexJson.invokeExact(rSeg, iSeg, followIgnore ? 1 : 0);
            return consumeCString(res);
        } catch (Throwable t) {
            if (t instanceof RuntimeException rt) throw rt;
            throw new RuntimeException(t);
        }
    }
}
