#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// gcp accounts <status|init-gcloud|switch|iam-bindings> | gcp billing <status|plan|apply|lift|relink>
// (`env-kit accounts` and `env-kit billing` delegate here.)
import { resolve } from "node:path";
import { DEFAULT_MONOREPO_ENV_PATH } from "@aphrody/env-kit";
import {
  buildAphrodyIamBindingsPlan,
  formatAccountsStatusReport,
  formatIamBindingsPlan,
  initGcloudConfigurations,
  inspectAccountsStatus,
  switchGcloudPrincipal,
} from "./accounts";
import { runBillingCommand } from "./billing";

function runAccountsCommand(envPath: string, args: readonly string[]): number {
  const sub = args[0] ?? "status";

  if (sub === "status") {
    const asJson = args.includes("--json");
    const report = inspectAccountsStatus({ envPath });
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatAccountsStatusReport(report));
    }
    return 0;
  }

  if (sub === "init-gcloud") {
    const res = initGcloudConfigurations();
    console.log(
      `[gcp] Initialized gcloud configurations (${res.updatedConfigs.join(", ")}) [created=${res.createdConfigs.length}, active=${res.preservedActiveConfig ?? "NONE"}].`,
    );
    return 0;
  }

  if (sub === "switch") {
    const target = args[1];
    if (!target) {
      console.error("Usage: gcp accounts switch <ai|owner|org|sa>");
      return 1;
    }
    const res = switchGcloudPrincipal(target);
    console.log(
      `[gcp] Activated gcloud configuration "${res.principal.gcloudConfig}" (${res.principal.email}, project=${res.principal.project}).`,
    );
    if (!res.oauthCached && res.loginHint) {
      console.log(
        `[gcp] OAuth token not cached yet for ${res.principal.email}. Run:\n  ${res.loginHint}`,
      );
    }
    return 0;
  }

  if (sub === "iam-bindings") {
    const asJson = args.includes("--json");
    const plan = buildAphrodyIamBindingsPlan();
    if (asJson) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(formatIamBindingsPlan(plan));
    }
    return 0;
  }

  console.error(
    `Unknown accounts subcommand: ${sub}. Expected one of: status, init-gcloud, switch, iam-bindings`,
  );
  return 1;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const envPath = process.env.ENV_KIT_FILE ?? DEFAULT_MONOREPO_ENV_PATH;
  if (argv[0] === "accounts") return runAccountsCommand(envPath, argv.slice(1));
  if (argv[0] === "billing") return runBillingCommand(resolve(import.meta.dir, "../../.."), argv.slice(1));
  console.error("Usage: gcp accounts <status [--json]|init-gcloud|switch <ai|owner|org|sa>|iam-bindings [--json]> | gcp billing <status|plan|apply|lift|relink>");
  return 1;
}

if (import.meta.main) process.exitCode = await main();
