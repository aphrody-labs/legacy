# SPDX-License-Identifier: MIT OR Apache-2.0
# kernel/Makefile - Central Pure C, Assembly & WebAssembly Core (`libaysys` / `aysys.dll` / `aysys.wasm` / `wayland.wasm`)
#
# Subsystems:
#   arch/           x86_64, aarch64, wasm32 assembly & CPU entry
#   core/           syscalls, freestanding runtime, FNV-1a, CPUID
#   ../hardware/drivers/gpu/  Linux 7.4-rc2 DRM/KMS + Mesa 26.3 GBM/EGL 1.5/D3D12
#   ../system/wayland/ Wayland 1.26 wire, XCB 1.17, XWayland 26.0.99 XWM, dynamic tiler
#   ../system/nt/      NT Executive / ReactOS NTSTATUS <-> POSIX -errno
#   ../system/wine/    wineserver 64-byte fixed request protocol
#   wasm/           WebAssembly 3.0 binary parser, SIMD128 kernels, WASI-SDK 34 CLI, browser Wayland compositor

# make's built-in default CC is `cc`, absent on Windows: only an explicit CC overrides clang.
ifeq ($(origin CC),default)
CC        := clang
endif
WASI_CC   ?= $(HOME)/.local/share/ay/tools/wasi-sdk-34.0-x86_64-windows/bin/clang
WASM_OPT  ?= wasm-opt
WASM_VAL  ?= wasm-validate
OUT_DIR   ?= ../target/sys

CFLAGS_BASE := \
	-std=gnu11 \
	-O3 \
	-funsigned-char \
	-fno-common \
	-fno-strict-aliasing \
	-fintegrated-as \
	-Wall \
	-Wextra \
	-Werror \
	-Iinclude

WASM_FEATURES := -msimd128 -mbulk-memory -mmultivalue -mnontrapping-fptoint -msign-ext

C_SRCS := \
	core/sys.c \
	../hardware/drivers/gpu/drm/drm_mesa.c \
	../system/wayland/wire.c \
	../system/wayland/xwm.c \
	../system/wayland/tiler.c \
	../system/nt/status.c \
	../system/wine/server_proto.c \
	wasm/module.c \
	../frameworks/ui/m3.c \
	../frameworks/ui/shell_kit.c \
	../frameworks/ui/vterm.c

ASM_X86_64 := arch/x86/entry_64.S

.PHONY: all linux windows android-x64 wasm wasi compositor verify clean sanitize tidy format size

all: wasm compositor verify

linux:
	mkdir -p $(OUT_DIR)
	$(CC) $(CFLAGS_BASE) -fPIC -flto=thin -fuse-ld=lld -shared \
		$(C_SRCS) $(ASM_X86_64) -o $(OUT_DIR)/libaysys.so

windows:
	mkdir -p $(OUT_DIR)
	$(CC) $(CFLAGS_BASE) --target=x86_64-pc-windows-msvc -flto=thin -fuse-ld=lld \
		-nostdlib -Wl,/NOENTRY -Wl,/DLL \
		$(C_SRCS) $(ASM_X86_64) -o $(OUT_DIR)/aysys.dll

# Android x86_64 (bionic): NDK clang resolved from ANDROID_NDK_HOME (build/android/android.toml, scripts/android-setup.ts env).
ANDROID_API ?= 29
NDK_LLVM    ?= $(ANDROID_NDK_HOME)/toolchains/llvm/prebuilt/linux-x86_64/bin
ANDROID_CC  ?= $(NDK_LLVM)/clang --target=x86_64-linux-android$(ANDROID_API)
ANDROID_OUT ?= $(OUT_DIR)/android-x86_64

android-x64:
	@test -n "$(ANDROID_NDK_HOME)" || { echo "ANDROID_NDK_HOME unset: bun scripts/android-setup.ts env"; exit 1; }
	mkdir -p $(ANDROID_OUT)
	$(ANDROID_CC) $(CFLAGS_BASE) -fPIC -flto=thin -fuse-ld=lld -shared -Wl,-soname,libaysys.so \
		-Wl,-z,max-page-size=16384 $(C_SRCS) $(ASM_X86_64) -o $(ANDROID_OUT)/libaysys.so
	$(ANDROID_CC) -std=gnu11 -O2 -Wall -Wextra -Werror -Iinclude -fuse-ld=lld -Wl,-z,max-page-size=16384 \
		android/smoke.c -L$(ANDROID_OUT) -laysys -Wl,-rpath,'$$ORIGIN' -o $(ANDROID_OUT)/ay_smoke
	# JNI shim + jniLibs staging for apps/android-shell of aphrody-labs/open (Gradle jniLibs.srcDir = target/sys/android-x86_64/jniLibs)
	$(ANDROID_CC) -std=gnu11 -O2 -Wall -Wextra -Werror -Iinclude -fPIC -shared -fuse-ld=lld -Wl,-z,max-page-size=16384 \
		android/jni.c -L$(ANDROID_OUT) -laysys -Wl,-rpath,'$$ORIGIN' -o $(ANDROID_OUT)/libayjni.so
	mkdir -p $(ANDROID_OUT)/jniLibs/x86_64
	cp $(ANDROID_OUT)/libaysys.so $(ANDROID_OUT)/libayjni.so $(ANDROID_OUT)/jniLibs/x86_64/

wasm:
	mkdir -p $(OUT_DIR)
	$(CC) $(CFLAGS_BASE) $(WASM_FEATURES) --target=wasm32-unknown-unknown -nostdlib \
		-Wl,--no-entry -Wl,--export-dynamic -Wl,--lto-O3 \
		$(C_SRCS) -o $(OUT_DIR)/aysys.raw.wasm
	$(WASM_OPT) -O4 --enable-simd --enable-bulk-memory --enable-multivalue \
		--enable-nontrapping-float-to-int --enable-sign-ext --strip-debug \
		$(OUT_DIR)/aysys.raw.wasm -o $(OUT_DIR)/aysys.wasm
	rm -f $(OUT_DIR)/aysys.raw.wasm

wasi:
	mkdir -p $(OUT_DIR)
	$(WASI_CC) $(CFLAGS_BASE) $(WASM_FEATURES) --target=wasm32-wasip1 \
		$(C_SRCS) wasm/wasi_cli.c -o $(OUT_DIR)/ay-wasm-inspect.raw.wasm
	$(WASM_OPT) -O3 --enable-simd --enable-bulk-memory --enable-multivalue \
		--enable-nontrapping-float-to-int --enable-sign-ext --strip-debug \
		$(OUT_DIR)/ay-wasm-inspect.raw.wasm -o $(OUT_DIR)/ay-wasm-inspect.wasm
	rm -f $(OUT_DIR)/ay-wasm-inspect.raw.wasm
	$(WASI_CC) $(CFLAGS_BASE) $(WASM_FEATURES) --target=wasm32-wasip1 \
		$(C_SRCS) ../frameworks/ui/site_wasi.c -o $(OUT_DIR)/ay-m3-site.raw.wasm
	$(WASM_OPT) -O3 --enable-simd --enable-bulk-memory --enable-multivalue \
		--enable-nontrapping-float-to-int --enable-sign-ext --strip-debug \
		$(OUT_DIR)/ay-m3-site.raw.wasm -o $(OUT_DIR)/ay-m3-site.wasm
	rm -f $(OUT_DIR)/ay-m3-site.raw.wasm

compositor:
	mkdir -p $(OUT_DIR)
	$(CC) -std=gnu11 -O3 $(WASM_FEATURES) --target=wasm32-unknown-unknown -nostdlib \
		-Wall -Wextra -Werror -Wl,--no-entry -Wl,--export-dynamic -Wl,--lto-O3 \
		wasm/compositor.c -o $(OUT_DIR)/wayland.raw.wasm
	$(WASM_OPT) -O4 --enable-simd --enable-bulk-memory --enable-multivalue \
		--enable-nontrapping-float-to-int --enable-sign-ext --strip-debug \
		$(OUT_DIR)/wayland.raw.wasm -o ../apps/web/public/wayland.wasm
	rm -f $(OUT_DIR)/wayland.raw.wasm

# LLVM tooling on the C core (same clang/lld as every other build, scripts/toolchain.ts).
#   sanitize   ASan + UBSan over every exported function (tests/sanitize.c: exact-size heap buffers, xorshift corpus)
#   tidy       clang-tidy (.clang-tidy: clang-analyzer-* and the bug-finding bugprone-* checks) with -warnings-as-errors
#   format     clang-format --dry-run on the files given in FORMAT_SRCS (default: the sources written to .clang-format)
#   size       llvm-objdump section sizes of libaysys.so: the release-size report of the C core
CLANG_TIDY   ?= clang-tidy
CLANG_FORMAT ?= clang-format
LLVM_OBJDUMP ?= llvm-objdump
FORMAT_SRCS  ?= tests/sanitize.c
SAN_FLAGS    := -fsanitize=address,undefined -fno-sanitize-recover=undefined -fno-omit-frame-pointer

sanitize:
	mkdir -p $(OUT_DIR)
	$(CC) -std=gnu11 -g -O1 -funsigned-char -fno-common -fno-strict-aliasing -Wall -Wextra -Werror -Iinclude \
		$(SAN_FLAGS) -fuse-ld=lld $(C_SRCS) $(ASM_X86_64) tests/sanitize.c -o $(OUT_DIR)/sanitize
	$(OUT_DIR)/sanitize

tidy:
	$(CLANG_TIDY) -warnings-as-errors='*' $(C_SRCS) wasm/compositor.c tests/sanitize.c -- \
		-std=gnu11 -funsigned-char -Iinclude

format:
	$(CLANG_FORMAT) --dry-run -Werror $(FORMAT_SRCS)

size: linux
	$(LLVM_OBJDUMP) -h $(OUT_DIR)/libaysys.so

verify:
	$(WASM_VAL) --enable-all $(OUT_DIR)/aysys.wasm
	$(WASM_VAL) --enable-all $(OUT_DIR)/ay-wasm-inspect.wasm
	$(WASM_VAL) --enable-all $(OUT_DIR)/ay-m3-site.wasm
	$(WASM_VAL) --enable-all ../apps/web/public/wayland.wasm

clean:
	rm -rf $(OUT_DIR)
