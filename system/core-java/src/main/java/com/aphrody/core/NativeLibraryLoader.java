package com.aphrody.core;

import java.lang.foreign.SymbolLookup;
import java.lang.foreign.Arena;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Resolves and loads Aphrody C ABI / JNI native libraries across env overrides, system path, and repo target dirs. */
public final class NativeLibraryLoader {
    private static final String OS = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
    private static final boolean WINDOWS = OS.contains("win");
    private static final boolean MAC = OS.contains("mac") || OS.contains("darwin");
    private static final String LIB_EXT = WINDOWS ? ".dll" : (MAC ? ".dylib" : ".so");
    private static final String LIB_PREFIX = WINDOWS ? "" : "lib";

    private NativeLibraryLoader() {}

    public static Path findLibrary(String baseName, String... subdirs) {
        String envOverride = System.getenv("APHRODY_" + baseName.toUpperCase(Locale.ROOT) + "_LIB");
        if (envOverride != null && !envOverride.isBlank()) {
            Path p = Path.of(envOverride);
            if (Files.isRegularFile(p)) {
                return p.toAbsolutePath().normalize();
            }
        }

        String fileName = LIB_PREFIX + baseName + LIB_EXT;
        List<Path> candidates = new ArrayList<>();

        String prop = System.getProperty("aphrody.lib.dir");
        if (prop != null && !prop.isBlank()) {
            candidates.add(Path.of(prop, fileName));
        }
        String envDir = System.getenv("APHRODY_LIB_DIR");
        if (envDir != null && !envDir.isBlank()) {
            candidates.add(Path.of(envDir, fileName));
        }

        Path repoRoot = findRepoRoot();
        if (repoRoot != null) {
            for (String sub : subdirs) {
                candidates.add(repoRoot.resolve("target").resolve(sub).resolve(fileName));
            }
        }

        String javaLibPath = System.getProperty("java.library.path", "");
        String sep = System.getProperty("path.separator", WINDOWS ? ";" : ":");
        for (String entry : javaLibPath.split(java.util.regex.Pattern.quote(sep))) {
            if (!entry.isBlank()) {
                candidates.add(Path.of(entry, fileName));
            }
        }

        for (Path cand : candidates) {
            if (Files.isRegularFile(cand)) {
                return cand.toAbsolutePath().normalize();
            }
        }
        throw new UnsatisfiedLinkError("Native library `" + fileName + "` not found; checked: " + candidates);
    }

    public static SymbolLookup lookupLibrary(String baseName, String... subdirs) {
        Path path = findLibrary(baseName, subdirs);
        return SymbolLookup.libraryLookup(path, Arena.global());
    }

    public static void loadJniLibrary(String baseName, String... subdirs) {
        Path path = findLibrary(baseName, subdirs);
        System.load(path.toString());
    }

    private static Path findRepoRoot() {
        Path cur = Path.of("").toAbsolutePath().normalize();
        while (cur != null) {
            if (Files.isRegularFile(cur.resolve("Cargo.toml")) && Files.isDirectory(cur.resolve("system/core"))) {
                return cur;
            }
            cur = cur.getParent();
        }
        return null;
    }
}
