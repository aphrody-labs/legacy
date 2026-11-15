#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";
import { srcRoot } from "./dx12-hal";

const benchCrateDir = join(srcRoot(), "bench");
const stackBenchExe = join(
  benchCrateDir,
  "target",
  "release",
  "stack-bench.exe",
);
const tier5Script = join(import.meta.dir, "tier5-bun-bench.ts");

console.log(
  "====================================================================",
);
console.log("Hardware & Compiler Benchmark Suite (Bun Entrypoint)");
console.log(
  "Intel i7-13700F 16C/24T | 32GB DDR5-5800 | RTX 4070 sm_89 CUDA 13.4",
);
console.log(
  "Runtime: Bun v" + Bun.version + " (Full-Rust Engine + JavaScriptCore C++)",
);
console.log(
  "====================================================================",
);

if (!existsSync(stackBenchExe)) {
  console.log(
    "\nBuilding stack-bench.exe with fat LTO, codegen-units=1, panic=abort...",
  );
  const buildRes = Bun.spawnSync(
    ["cargo", "build", "--release", "--target-dir", join(benchCrateDir, "target")],
    { stdio: ["inherit", "inherit", "inherit"], cwd: benchCrateDir },
  );
  if (buildRes.exitCode !== 0) {
    console.error("Cargo release build failed");
    process.exit(1);
  }
}

console.log("\n[Tier 5] Executing Bun + WASM Kernel...");
Bun.spawnSync(["bun", "run", tier5Script], {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: benchCrateDir,
});

console.log("\n[All Tiers] Executing stack-bench.exe report...");
Bun.spawnSync([stackBenchExe, "report"], {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: benchCrateDir,
});

const workloads = [
  "gpu-compute",
  "compositor",
  "systems-cli",
  "web-edge",
  "wasm-app",
];
console.log(
  "\n====================================================================",
);
console.log("Running Deterministic Stack Picker across Workloads");
console.log(
  "====================================================================",
);

for (const w of workloads) {
  console.log(`\n>>> Evaluating Workload: ${w}`);
  Bun.spawnSync([stackBenchExe, "pick", "--workload", w], {
    stdio: ["inherit", "inherit", "inherit"],
    cwd: benchCrateDir,
  });
}

console.log(
  "\nAll benchmarks complete. Report verified at C:\\src\\crates\\bench\\BENCHMARK_REPORT.md",
);
