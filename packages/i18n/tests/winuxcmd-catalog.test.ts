import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { convert, toMf2 } from "../../../scripts/winuxcmd-i18n-import.ts";
import { packageRoot } from "../src/config.ts";
import { getAdapter } from "../src/adapter.ts";
import "../src/mf2.ts";

const dir = join(packageRoot, "catalogs", "winuxcmd");

describe("winuxcmd-i18n catalogs in the stack", () => {
  test("placeholders become MF2 variables", () => {
    expect(toMf2("extra operand '{operand}' {0} {a_b} {} {}")).toBe("extra operand '{$operand}' {$arg0} {$a_b} {$arg0} {$arg1}");
    expect(toMf2("{{x}} {a,b} \\n 100%")).toBe("\\{x\\} \\{a,b\\} \\\\n 100%");
    expect(convert({ locale: "x", messages: { b: "{n}", a: "z" } })).toEqual({ locale: "x", messages: { a: "z", b: "{$n}" } });
  });

  test("every imported message compiles with the stack's MF2 adapter and keeps its placeholders", async () => {
    const adapter = getAdapter("mf2");
    const messages = (await Bun.file(join(dir, "zh-CN.json")).json()) as Record<string, string>;
    const keys = Object.keys(messages);
    expect(keys.length).toBeGreaterThan(3000);
    expect(keys).toContain("command.arch.synopsis");
    const bad: string[] = [];
    for (const k of keys) {
      try {
        adapter.compile(messages[k]!, "zh-CN");
      } catch {
        bad.push(k);
      }
    }
    expect(bad).toEqual([]);
    expect(adapter.compile(messages["command.arch.error.extra_operand"]!, "zh-CN").argNames()).toEqual(["operand"]);
  });
});
