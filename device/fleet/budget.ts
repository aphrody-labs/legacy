#!/usr/bin/env bun
// Monthly cost and renewals of OVH and Hostinger as JSON (zero deps). Read-only.
//   bun device/fleet/budget.ts [--raw]   credentials: OVH_ENDPOINT/OVH_APPLICATION_KEY/OVH_APPLICATION_SECRET/OVH_CONSUMER_KEY,
//                                       HOSTINGER_API_TOKEN (process env, else C:/aphrody/.env; values are never printed)
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const raw = process.argv.includes("--raw");
const envFile = join(import.meta.dir, "..", "..", ".env");
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/);
    if (m && !(m[1] in Bun.env)) Bun.env[m[1]] = m[2];
  }
}

const OVH_BASE: Record<string, string> = {
  "ovh-eu": "https://eu.api.ovh.com/1.0",
  "ovh-ca": "https://ca.api.ovh.com/1.0",
  "ovh-us": "https://api.us.ovhcloud.com/1.0",
};
const ovhBase =
  OVH_BASE[Bun.env.OVH_ENDPOINT ?? "ovh-eu"] ?? OVH_BASE["ovh-eu"];
let delta = 0;

async function ovh(path: string, method = "GET"): Promise<any> {
  const url = ovhBase + path;
  const ts = Math.floor(Date.now() / 1000) + delta;
  const sig =
    "$1$" +
    createHash("sha1")
      .update(
        [
          Bun.env.OVH_APPLICATION_SECRET,
          Bun.env.OVH_CONSUMER_KEY,
          method,
          url,
          "",
          ts,
        ].join("+"),
      )
      .digest("hex");
  const r = await fetch(url, {
    method,
    headers: {
      "X-Ovh-Application": Bun.env.OVH_APPLICATION_KEY!,
      "X-Ovh-Consumer": Bun.env.OVH_CONSUMER_KEY!,
      "X-Ovh-Timestamp": String(ts),
      "X-Ovh-Signature": sig,
    },
  });
  if (!r.ok) return { error: r.status, path };
  return r.json();
}
const safe = async <T>(p: Promise<T>): Promise<T | { error: string }> =>
  p.catch((e) => ({ error: String(e) }));

async function ovhReport() {
  if (!Bun.env.OVH_APPLICATION_KEY || !Bun.env.OVH_CONSUMER_KEY)
    return { error: "OVH credentials missing" };
  delta = Math.floor(Date.now() / 1000);
  delta = (await (await fetch(ovhBase + "/auth/time")).json()) - delta;
  const ids: number[] = await ovh("/services");
  const services = await Promise.all(
    (Array.isArray(ids) ? ids : []).map(async (id) => {
      const s = await ovh(`/services/${id}`);
      const b = s.billing ?? {};
      return {
        id,
        product: s.resource?.product?.name ?? s.route?.path,
        name: s.resource?.displayName || s.resource?.name,
        state: s.resource?.state,
        price: b.pricing?.price?.value ?? b.pricing?.price,
        currency: b.pricing?.price?.currencyCode,
        interval: b.pricing?.interval,
        renew: b.nextBillingDate ?? b.expirationDate,
        engagement: b.engagement?.endDate,
        lifecycle: b.lifecycle?.current?.state,
        pending: b.lifecycle?.current?.pendingActions,
        ...(raw ? { raw: s } : {}),
      };
    }),
  );
  const since = new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10);
  const billIds: string[] = await ovh(`/me/bill?date.from=${since}`);
  const bills = await Promise.all(
    (Array.isArray(billIds) ? billIds : []).map(async (id) => {
      const b = await ovh(`/me/bill/${id}`);
      return {
        id,
        date: b.date?.slice(0, 10),
        ttc: b.priceWithTax?.value,
        ht: b.priceWithoutTax?.value,
        cur: b.priceWithTax?.currencyCode,
      };
    }),
  );
  const lists = Object.fromEntries(
    await Promise.all(
      [
        "/vps",
        "/dedicated/server",
        "/cloud/project",
        "/ip",
        "/domain",
        "/domain/zone",
        "/email/domain",
        "/email/pro",
        "/email/exchange",
        "/vrack",
        "/ipLoadbalancing",
        "/hosting/web",
        "/me/order",
      ].map(async (p) => [p, await safe(ovh(p))] as const),
    ),
  );
  const monthly = services.reduce((a, s) => a + (Number(s.price) || 0), 0);
  return {
    endpoint: Bun.env.OVH_ENDPOINT,
    monthly_list_price_sum: Math.round(monthly * 100) / 100,
    services,
    bills,
    lists,
  };
}

async function hostinger(path: string) {
  const r = await fetch("https://developers.hostinger.com" + path, {
    headers: { Authorization: `Bearer ${Bun.env.HOSTINGER_API_TOKEN}` },
  });
  return r.ok ? r.json() : { error: r.status, path };
}

async function hostingerReport() {
  if (!Bun.env.HOSTINGER_API_TOKEN)
    return { error: "HOSTINGER_API_TOKEN missing" };
  const vms: any = await hostinger("/api/vps/v1/virtual-machines");
  const list = Array.isArray(vms) ? vms : (vms?.data ?? []);
  const backups = await Promise.all(
    list.map(async (v: any) => ({
      id: v.id,
      backups: await safe(
        hostinger(`/api/vps/v1/virtual-machines/${v.id}/backups`),
      ),
    })),
  );
  const subs: any = await hostinger("/api/billing/v1/subscriptions");
  const domains = await hostinger("/api/domains/v1/portfolio");
  const sl = Array.isArray(subs) ? subs : (subs?.data ?? []);
  return {
    vms: list.map((v: any) => ({
      id: v.id,
      hostname: v.hostname,
      plan: v.plan,
      state: v.state,
      cpus: v.cpus,
      memory: v.memory,
      disk: v.disk,
      ipv4: v.ipv4?.map?.((i: any) => i.address),
    })),
    backups,
    subscriptions: sl.map((s: any) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      price_cents: s.renewal_price ?? s.price,
      currency: s.currency_code,
      period: s.billing_period,
      unit: s.billing_period_unit,
      next_billing: s.next_billing_at,
      expires: s.expires_at,
      auto_renew: s.is_auto_renewed,
    })),
    domains,
  };
}

const [o, h] = await Promise.all([safe(ovhReport()), safe(hostingerReport())]);
console.log(
  JSON.stringify(
    { generated: new Date().toISOString(), ovh: o, hostinger: h },
    null,
    2,
  ),
);
