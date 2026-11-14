// Python `os` / `os.path` subset.
import * as fs from "node:fs";
import * as p from "node:path";
import { FileNotFoundError } from "./index";

export const sep = p.sep;
export const linesep = "\n";
export const name = process.platform === "win32" ? "nt" : "posix";
export const environ = new Map<string, string>(Object.entries(process.env) as [string, string][]);
export const getenv = (k: string, d: any = null) => process.env[k] ?? d;
export const getcwd = () => process.cwd();
export const listdir = (d = ".") => {
  try {
    return fs.readdirSync(d);
  } catch {
    throw new FileNotFoundError(`[Errno 2] No such file or directory: '${d}'`);
  }
};
export const makedirs = (d: string, ..._a: any[]) => void fs.mkdirSync(d, { recursive: true });
export const mkdir = (d: string) => void fs.mkdirSync(d);
export const remove = (f: string) => void fs.rmSync(f);
export const unlink = remove;
export const rename = (a: string, b: string) => void fs.renameSync(a, b);
export const getpid = () => process.pid;
export const path = {
  join: (...a: string[]) => a.reduce((acc, x) => (p.isAbsolute(x) ? x : acc ? p.join(acc, x) : x), ""),
  basename: p.basename,
  dirname: (x: string) => (p.dirname(x) === "." && !x.includes("/") ? "" : p.dirname(x)),
  exists: (x: string) => fs.existsSync(x),
  isfile: (x: string) => fs.existsSync(x) && fs.statSync(x).isFile(),
  isdir: (x: string) => fs.existsSync(x) && fs.statSync(x).isDirectory(),
  abspath: (x: string) => p.resolve(x),
  normpath: (x: string) => p.normalize(x),
  splitext: (x: string) => {
    const e = p.extname(x);
    return [e ? x.slice(0, -e.length) : x, e];
  },
  split: (x: string) => [p.dirname(x), p.basename(x)],
  expanduser: (x: string) => x.replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? "~"),
  getsize: (x: string) => fs.statSync(x).size,
  sep: p.sep,
};
