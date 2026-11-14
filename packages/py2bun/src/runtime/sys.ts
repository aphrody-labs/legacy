// Python `sys` subset.
import { exit as pyexit } from "./index";
export const argv: string[] = [process.argv[1] ?? "", ...process.argv.slice(2)];
export const platform = process.platform === "win32" ? "win32" : process.platform;
export const maxsize = Number.MAX_SAFE_INTEGER;
export const version_info = [3, 12, 0];
export const version = "3.12.0 (py2bun/bun)";
export const path: string[] = [];
export const modules = new Map<string, any>();
export const stdout = { write: (s: string) => process.stdout.write(s), flush() {} };
export const stderr = { write: (s: string) => process.stderr.write(s), flush() {} };
export const stdin = { read: () => "", readline: () => "" };
export const exit = (c?: any) => pyexit(c);
