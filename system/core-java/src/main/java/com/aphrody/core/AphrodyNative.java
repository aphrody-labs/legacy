package com.aphrody.core;

/** JNI native entrypoints backed by `aphrody_jni` (`system/core/jni`). */
public final class AphrodyNative {
    static {
        NativeLibraryLoader.loadJniLibrary("aphrody_jni", "release", "debug");
    }

    private AphrodyNative() {}

    public static native int abiVersion();

    public static native String languages();

    public static native String parseJson(String path, String content);

    public static native String queryJson(String path, String content, String query);

    public static native String blake3Hex(byte[] data);

    public static native String indexJson(String root, String includes, boolean followIgnore);

    public static native String reTriageJson(byte[] data, int stringsLimit);

    public static native String reAuditBytesJson(String label, byte[] data);

    public static native String reDisasmJson(byte[] data, long rip, int limit);

    public static native String rePdataJson(byte[] data, int maxRoots);

    public static native String reGhidraDecompileBytesJson(byte[] data, int maxFunctions);

    public static native String reMingwAuditJson(String path, int maxFunctions);

    public static native String reLua52AuditJson(byte[] data);

    public static native byte[] reLua52Transcode(byte[] data, int targetInt, int targetSizeT);
}
