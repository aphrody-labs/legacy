import { isIP } from "node:net";
/** This filter restricts an already authenticated identity, never granting a role. */
export function ipAdministration(
  req: Request,
  env: Record<string, string | undefined> = Bun.env,
): { restreint: boolean; autorise: boolean; adresse: string | null } {
  const liste =
    env.AUTO_ADMIN_IPS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const normaliser = (s: string) =>
    isIP(s) === 4 ? s : isIP(s) === 6 && !s.includes("%") ? new URL("http://[" + s + "]/").hostname : null;
  const brute = req.headers.get("cf-connecting-ip") ?? "",
    adresse = normaliser(brute);
  if (!liste.length) return { restreint: false, autorise: true, adresse };
  if (env.AUTO_ADMIN_IP_SOURCE !== "cloudflare-tunnel") return { restreint: true, autorise: false, adresse: null };
  const permises = liste.map(normaliser);
  return { restreint: true, adresse, autorise: !!adresse && !permises.includes(null) && permises.includes(adresse) };
}
