"""CLI: py2bun file.py -o file.ts"""

import argparse
import sys

from ._py2bun import transpile_with_diagnostics


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="py2bun", description="Transpile a Python 3 file to Bun TypeScript")
    ap.add_argument("file", nargs="?", default="-", help="Python source ('-' = stdin)")
    ap.add_argument("-o", "--output", help="output .ts path (default: stdout)")
    ap.add_argument("--strict", action="store_true", help="exit 1 on any diagnostic, warnings included")
    ns = ap.parse_args(argv)
    src = sys.stdin.read() if ns.file == "-" else open(ns.file, encoding="utf-8").read()
    ts, diags = transpile_with_diagnostics(src)
    for line, col, sev, msg in diags:
        print(f"{ns.file}:{line}:{col}: {sev}: {msg}", file=sys.stderr)
    if ts:
        if ns.output:
            with open(ns.output, "w", encoding="utf-8", newline="\n") as f:
                f.write(ts)
        else:
            sys.stdout.write(ts)
    errors = any(s == "error" for _, _, s, _ in diags)
    return 1 if (not ts or errors or (ns.strict and diags)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
