// Pure C11 WebAssembly (`aysys.wasm`) + WebGPU / Canvas2D Material 3 Expressive Interactive Host
const WASM_URL = "/m3/aysys.wasm";

const ROLE_SURFACE = 0;
const ROLE_SURFACE_CONTAINER_LOW = 2;
const ROLE_SURFACE_CONTAINER_HIGH = 4;
const ROLE_PRIMARY = 8;
const ROLE_PRIMARY_CONTAINER = 10;
const ROLE_TERTIARY_CONTAINER = 18;
const ROLE_OUTLINE_VARIANT = 23;
const ROLE_BOLT = 24;

async function loadSysWasm() {
  if (typeof WebAssembly.instantiateStreaming === "function") {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(
        fetch(WASM_URL),
        {},
      );
      return instance;
    } catch {
      // Fallback when served without application/wasm header locally
    }
  }
  const resp = await fetch(WASM_URL);
  const { instance } = await WebAssembly.instantiate(
    await resp.arrayBuffer(),
    {},
  );
  return instance;
}

function argbToCss(argb) {
  const hex = ((argb >>> 0) & 0xffffff).toString(16).padStart(6, "0");
  return `#${hex}`;
}

async function detectWebGpu() {
  if (!navigator.gpu) return "Canvas2D fallback (WebGPU unavailable)";
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return "Canvas2D fallback (no GPU adapter)";
    return "WebGPU ready + Pure-C Wasm SIMD128";
  } catch {
    return "Canvas2D fallback";
  }
}

async function boot() {
  const canvas = document.getElementById("m3-canvas");
  const telemetry = document.getElementById("m3-telemetry");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const inst = await loadSysWasm();
  const exp = inst.exports;
  const gpuLabel = await detectWebGpu();

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? 1
    : 0;
  let targetSide = 1;

  // Allocate scratch structs in Wasm linear memory (safe offset above static data)
  const basePtr = 32768;
  const springPtr = basePtr; // 20 bytes: value, target, velocity, damping_ratio, stiffness
  const shellPtr = basePtr + 64; // 44 bytes: ay_ui_adaptive_shell

  exp.ay_ui_spring_init(springPtr, 0, 0.0, 1.0);

  function readSpring() {
    const f32 = new Float32Array(exp.memory.buffer, springPtr, 5);
    return {
      value: f32[0],
      target: f32[1],
      velocity: f32[2],
      damping: f32[3],
      stiffness: f32[4],
    };
  }

  function triggerSpring(presetId) {
    targetSide = targetSide === 1 ? 0 : 1;
    const cur = readSpring().value;
    if (reducedMotion) {
      exp.ay_ui_spring_init(springPtr, presetId, targetSide, targetSide);
    } else {
      exp.ay_ui_spring_init(springPtr, presetId, cur, targetSide);
    }
    requestFrame();
  }

  let rafId = 0;
  let lastTs = performance.now();

  function render(now) {
    rafId = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
    lastTs = now;

    const settled = exp.ay_ui_spring_step(springPtr, dt);
    const sp = readSpring();

    exp.ay_ui_compute_shell(canvas.width, canvas.height, shellPtr);
    const u32 = new Uint32Array(exp.memory.buffer, shellPtr, 11);
    const railW = u32[5];
    const margin = u32[2];
    const cols = u32[4];

    const bg = argbToCss(exp.ay_ui_color_argb(darkMode, ROLE_SURFACE));
    const railBg = argbToCss(
      exp.ay_ui_color_argb(darkMode, ROLE_SURFACE_CONTAINER_LOW),
    );
    const cardBg = argbToCss(
      exp.ay_ui_color_argb(darkMode, ROLE_SURFACE_CONTAINER_HIGH),
    );
    const primary = argbToCss(exp.ay_ui_color_argb(darkMode, ROLE_PRIMARY));
    const primaryContainer = argbToCss(
      exp.ay_ui_color_argb(darkMode, ROLE_PRIMARY_CONTAINER),
    );
    const tertiaryContainer = argbToCss(
      exp.ay_ui_color_argb(darkMode, ROLE_TERTIARY_CONTAINER),
    );
    const outline = argbToCss(
      exp.ay_ui_color_argb(darkMode, ROLE_OUTLINE_VARIANT),
    );
    const bolt = argbToCss(exp.ay_ui_color_argb(darkMode, ROLE_BOLT));

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (railW > 0) {
      ctx.fillStyle = railBg;
      ctx.fillRect(0, 0, railW, canvas.height);
      ctx.strokeStyle = outline;
      ctx.beginPath();
      ctx.moveTo(railW + 0.5, 0);
      ctx.lineTo(railW + 0.5, canvas.height);
      ctx.stroke();
    }

    const trackStart = railW + margin + 24;
    const trackEnd = canvas.width - margin - 148;
    const x = trackStart + (trackEnd - trackStart) * sp.value;
    const morphRadius = Math.max(
      12,
      Math.min(48, 16 + Math.abs(sp.velocity) * 6 + sp.value * 16),
    );

    // Track container
    ctx.fillStyle = cardBg;
    ctx.beginPath();
    ctx.roundRect(
      railW + margin,
      36,
      canvas.width - railW - margin * 2,
      188,
      20,
    );
    ctx.fill();

    // Expressive M3 spring-animated FAB / card
    ctx.fillStyle = sp.value > 0.5 ? primary : tertiaryContainer;
    ctx.beginPath();
    ctx.roundRect(x, 74, 124, 112, morphRadius);
    ctx.fill();

    // Accent indicator
    ctx.fillStyle = sp.value > 0.5 ? bolt : primaryContainer;
    ctx.beginPath();
    ctx.arc(x + 62, 130, 14, 0, Math.PI * 2);
    ctx.fill();

    if (telemetry) {
      telemetry.innerHTML = `<code>${gpuLabel} | ABI v${exp.ay_sys_abi_version()} | spring=${sp.value.toFixed(3)} (ζ=${sp.damping.toFixed(1)}, k=${sp.stiffness.toFixed(0)}) | shell cols=${cols} rail=${railW}px</code>`;
    }

    if (settled === 0) {
      rafId = requestAnimationFrame(render);
    }
  }

  function requestFrame() {
    if (!rafId) {
      lastTs = performance.now();
      rafId = requestAnimationFrame(render);
    }
  }

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = Number(btn.getAttribute("data-preset") || "0");
      triggerSpring(preset);
    });
  });

  const themeBtn = document.getElementById("btn-theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      darkMode = darkMode ? 0 : 1;
      document.documentElement.setAttribute(
        "data-theme",
        darkMode ? "dark" : "light",
      );
      requestFrame();
    });
  }

  requestFrame();
}

boot();
