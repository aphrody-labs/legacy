package com.aphrody.core;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** Standalone verification runner for Java 25 FFM (`aysys`, `aphrody_core_capi`) and JNI (`aphrody_jni`). */
public final class AphrodyCoreTest {
    private static void check(boolean cond, String message) {
        if (!cond) {
            throw new AssertionError("Verification failed: " + message);
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Layer-0 C ABI (`aysys.dll`) via Java 25 FFM API
        check(AphrodySys.sysAbiVersion() >= 1, "ay_sys_abi_version >= 1");
        long h1 = AphrodySys.fnv1a64("aphrody");
        long h2 = AphrodySys.fnv1a64("aphrody");
        check(h1 != 0L && h1 == h2, "ay_fnv1a64 deterministic non-zero");
        AphrodySys.CpuCaps caps = AphrodySys.cpuProbe();
        check(caps.family() > 0, "cpuProbe family > 0");
        check(AphrodySys.uiWindowClass(1280) >= 0, "uiWindowClass >= 0");
        check(AphrodySys.uiColorArgb(1, 0) != 0, "uiColorArgb non-zero");

        // 2. Core C ABI (`aphrody_core_capi.dll`) via Java 25 FFM API + JNI parity (`aphrody_jni.dll`)
        check(AphrodyCore.abiVersion() >= 1, "core_abi_version >= 1");
        check(AphrodyNative.abiVersion() >= 1, "JNI abiVersion >= 1");
        List<String> langs = AphrodyCore.languages();
        check(langs.contains("rust") && langs.contains("python"), "languages contain rust & python");
        check(AphrodyNative.languages().contains("python"), "JNI languages contain python");

        String parsedFfm = AphrodyCore.parseJson("sample.rs", "pub fn hello() -> i32 { 42 }");
        String parsedJni = AphrodyNative.parseJson("sample.rs", "pub fn hello() -> i32 { 42 }");
        check(parsedFfm.contains("\"rust\"") && parsedJni.contains("\"rust\""), "parseJson Rust AST");

        String query = AphrodyNative.queryJson(
            "Sample.rs",
            "pub fn hello() -> i32 { 42 }",
            "(function_item name: (identifier) @fn)"
        );
        check(query.contains("hello"), "queryJson matched hello");

        byte[] sample = "aphrody".getBytes(StandardCharsets.UTF_8);
        String b3Ffm = AphrodyCore.blake3Hex(sample);
        String b3Jni = AphrodyNative.blake3Hex(sample);
        check(b3Ffm.length() == 64 && b3Ffm.equals(b3Jni), "BLAKE3 FFM == JNI");

        // 3. RE (`aphrody_core_capi.dll` FFM + `aphrody_jni.dll` JNI)
        check(AphrodyRe.ffiAbiVersion() >= 1, "aphrody_abi_version >= 1");
        Path sysDll = Path.of("target/sys/aysys.dll");
        if (Files.isRegularFile(sysDll)) {
            byte[] dllBytes = Files.readAllBytes(sysDll);
            String auditFfm = AphrodyRe.auditBytesJson("aysys.dll", dllBytes);
            String auditJni = AphrodyNative.reAuditBytesJson("aysys.dll", dllBytes);
            check(auditFfm.contains("\"PE\"") && auditJni.contains("\"PE\""), "RE auditBytesJson FFM & JNI");
            check(AphrodyRe.auditFileJson(sysDll.toString()).contains("\"PE\""), "RE auditFileJson aysys.dll");
        }

        byte[] elf64 = new byte[64];
        elf64[0] = 0x7F;
        elf64[1] = 'E';
        elf64[2] = 'L';
        elf64[3] = 'F';
        elf64[4] = 2;
        elf64[5] = 1;
        elf64[6] = 1;
        String triage = AphrodyRe.triageJson(elf64, 16);
        check(triage.contains("\"elf64\""), "RE triage ELF64");

        byte[] x64Code = new byte[] {
            0x55, 0x48, (byte) 0x89, (byte) 0xe5, (byte) 0xb8, 0x2a, 0x00, 0x00, 0x00, 0x5d, (byte) 0xc3
        };
        String disasm = AphrodyRe.disassembleX64Json(x64Code, 0x1000L, 16);
        check(disasm.contains("ret"), "RE x64 disasm");

        System.out.println("PASS: Aphrody Java 25 FFM + JNI core tests passed cleanly.");
    }
}
