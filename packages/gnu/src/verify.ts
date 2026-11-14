// Detached OpenPGP signature check through sequoia `sqv` and the GSRC per-package gpg-keyring.
import { join } from "node:path";
import type { Signature } from "./types.ts";

export const sqvPath = () => Bun.which("sqv");

/** Keyring of a package in a GSRC checkout (pkg/gnu/<id>/gpg-keyring), or null. */
export async function gsrcKeyring(
  gsrcRoot: string,
  id: string,
): Promise<string | null> {
  const f = join(gsrcRoot, "pkg", "gnu", id, "gpg-keyring");
  return (await Bun.file(f).exists()) ? f : null;
}

export async function verifySignature(
  file: string,
  sig: string | null,
  keyring: string | null,
): Promise<Signature> {
  if (!sig) return { status: "missing", detail: "no .sig on ftp.gnu.org" };
  const sqv = sqvPath();
  if (!sqv) return { status: "unverified", detail: "sqv not installed" };
  if (!keyring)
    return {
      status: "unverified",
      detail: "no GSRC gpg-keyring for this package",
    };
  const r =
    await Bun.$`${sqv} --keyring ${keyring} --signature-file ${sig} ${file}`
      .quiet()
      .nothrow();
  if (r.exitCode === 0)
    return {
      status: "verified",
      detail: `sqv, keyring ${keyring.split(/[\\/]/).slice(-3).join("/")}`,
    };
  const err =
    (r.stderr.toString() || r.stdout.toString()).trim().split("\n").at(-1) ??
    "";
  // A missing certificate is not proof of forgery; a failed check against a matching key is.
  return /no (valid|acceptable)|not (found|issued)|unknown|missing/i.test(err)
    ? { status: "unverified", detail: err.slice(0, 160) }
    : { status: "invalid", detail: err.slice(0, 160) };
}

export async function sha256File(file: string): Promise<string> {
  const h = new Bun.CryptoHasher("sha256");
  for await (const c of Bun.file(file).stream()) h.update(c);
  return h.digest("hex");
}
