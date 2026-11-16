#!/usr/bin/env bun
// ay upstream: patch stacks of the bun and Chromium forks. Doc: docs/upstream/STRATEGY.md.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  deleteHead,
  existingPr,
  forkHeads,
  mergeUpstream,
  repoExists,
  review,
} from "./forge.ts";
import {
  commitTree,
  gh,
  ghApi,
  git,
  isRepo,
  pickTree,
  revParse,
} from "./git.ts";
import {
  headRef,
  recommendation,
  upstreamMessage,
  type Review,
  type Status,
} from "./patch.ts";
import {
  mirrorStatus,
  mirrorSync,
  type MirrorRow,
  type MirrorStack,
} from "./mirror.ts";
import { applyRegistry, saveEntry } from "./registry.ts";
import { bunPrBody, check, type Finding } from "./rules.ts";
import {
  addedLines,
  branchSeries,
  checkSeries,
  ensureCheckout,
  exportSeries,
  fetchBoth,
  fileSeries,
  findPatch,
  loadStacks,
  moveBranch,
  push,
  readState,
  replay,
  repoRoot,
  rewriteMessage,
  stackDir,
  STATUSES,
  writeState,
  type Patch,
  type StackConfig,
} from "./stack.ts";

const USAGE = `ay upstream <command> [stack] [options]   (stacks: tools/upstream/stacks.toml)

  status [stack...] [--json] [--markdown] [--no-fetch]  state of the stacks, patches, statuses, reviews in progress
  sync <stack[,stack]|all> [--push] [--no-fetch]        replays the stack on upstream, drops merged patches,
                                                        stops at the first conflict (code 3)
  check <stack> [patch]                                 upstream contribution rules (code 1 on error)
  pr <stack> <patch> [--push-head] [--lint] [--open] [--force]
                                                        ephemeral head up/<name> = upstream + this single patch;
                                                        --lint runs the fork's upstream CI on it; --open opens the PR
  mark <stack> <patch> <status> [note] [--pr URL] [--owner NAME] [--trailer [--push]]
                                                        status: ${STATUSES.join(" | ")}; written to
                                                        tools/upstream/status/<stack>.toml, or into the
                                                        commit message with --trailer (rewrites the stack)
  gc <stack> [--dry-run]                                deletes the up/* heads whose PR is merged or closed
  export <stack> <folder>                               .patch files + .patches (Electron format)

A patch is designated by its rank (1..n), a sha prefix or its name (slug).`;

type Opts = { flags: Set<string>; values: Map<string, string>; args: string[] };

function parse(argv: string[]): Opts {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--pr" || a === "--owner")
      values.set(a.slice(2), argv[++i] ?? "");
    else if (a.startsWith("--")) flags.add(a.slice(2));
    else args.push(a);
  }
  return { flags, values, args };
}

function pick(stacks: StackConfig[], name: string | undefined): StackConfig {
  const s = stacks.find((x) => x.name === name);
  if (!s)
    throw new Error(
      `unknown stack "${name ?? ""}" (known: ${stacks.map((x) => x.name).join(", ")})`,
    );
  return s;
}

const STATUS_FR: Record<Status, string> = {
  pending: "to propose",
  submitted: "proposed",
  backport: "merged upstream",
  denied: "denied",
  inappropriate: "Aphrody-specific",
  unknown: "no status",
};

type StackReport = {
  stack: string;
  model: string;
  fork: string;
  upstream: string;
  present: boolean;
  source?: "checkout" | "api";
  upstream_tip?: string;
  fork_tip?: string;
  base?: string;
  behind?: number;
  ahead?: number;
  last_sync?: unknown;
  mirror?: MirrorRow[];
  patches: {
    index: number;
    id: string;
    subject: string;
    status: Status;
    note: string;
    owner: string | null;
    pr: string | null;
    review: Review | null;
    action: string;
    errors: number;
  }[];
  error?: string;
};

async function stackStatus(
  root: string,
  s: StackConfig,
  fetch: boolean,
): Promise<StackReport> {
  const rep: StackReport = {
    stack: s.name,
    model: s.model,
    fork: s.fork,
    upstream: s.upstream,
    present: true,
    patches: [],
  };
  try {
    if (s.optional && !repoExists(s.fork)) return { ...rep, present: false };
    if (s.model === "mirror")
      return { ...rep, source: "api", mirror: mirrorStatus(s as MirrorStack) };
    const dir = stackDir(root, s);
    let patches: Patch[] = [];
    if (s.model === "series") {
      patches = fileSeries(root, s);
      if (isRepo(dir)) {
        rep.source = "checkout";
        if (fetch) fetchBoth(dir, s);
        rep.upstream_tip = revParse(
          dir,
          `refs/remotes/upstream/${s.ref}`,
        )?.slice(0, 12);
      }
      const cmp = ghApi<{ ahead_by: number; behind_by: number }>(
        `repos/${s.fork}/compare/${(s.github_upstream ?? s.upstream).replace("/", ":")}:${s.ref}...${s.fork.replace("/", ":")}:${s.branch}`,
      );
      if (cmp) {
        rep.ahead = cmp.ahead_by;
        rep.behind = cmp.behind_by;
      }
    } else if (isRepo(dir)) {
      rep.source = "checkout";
      if (fetch) fetchBoth(dir, s);
      const tip = `refs/remotes/origin/${s.branch}`;
      const series = branchSeries(dir, s, tip);
      patches = series.patches;
      rep.base = series.base.slice(0, 12);
      rep.fork_tip = revParse(dir, tip)?.slice(0, 12);
      rep.upstream_tip = revParse(dir, `refs/remotes/upstream/${s.ref}`)?.slice(
        0,
        12,
      );
      rep.ahead = patches.length;
      rep.behind = Number(
        git(dir, [
          "rev-list",
          "--count",
          `${series.base}..refs/remotes/upstream/${s.ref}`,
        ]),
      );
    } else {
      // No checkout here: the compare API gives the series (messages only).
      rep.source = "api";
      const cmp = ghApi<any>(
        `repos/${s.upstream}/compare/${s.ref}...${s.fork.split("/")[0]}:${s.fork.split("/")[1]}:${s.branch}`,
      );
      if (!cmp) throw new Error("comparaison GitHub impossible");
      rep.ahead = cmp.ahead_by;
      rep.behind = cmp.behind_by;
      rep.base = String(cmp.merge_base_commit?.sha ?? "").slice(0, 12);
      const { parseMessage, slug } = await import("./patch.ts");
      patches = (cmp.commits as any[]).map((c, i) => ({
        index: i + 1,
        sha: c.sha,
        slug: slug(String(c.commit.message).split("\n")[0]),
        meta: parseMessage(String(c.commit.message)),
        authorEmail: c.commit.author?.email ?? "",
        files: [],
      }));
    }
    applyRegistry(root, s, patches);
    rep.last_sync = readState(root, s, "last-sync.json");
    for (const p of patches) {
      const rv = await review(p.meta.pr);
      let errors = 0;
      if (
        (rep.source === "checkout" || p.file) &&
        (p.meta.status === "pending" || p.meta.status === "unknown")
      )
        errors = check(s.rules, {
          meta: p.meta,
          files: p.files,
          added: addedLines(dir, p),
          authorEmail: p.authorEmail,
        }).filter((f) => f.level === "error" && f.rule !== "status").length;
      rep.patches.push({
        index: p.index,
        id: p.file ? p.sha : p.sha.slice(0, 10),
        subject: p.meta.subject,
        status: p.meta.status,
        note: p.meta.statusNote,
        owner: p.meta.owner,
        pr: p.meta.pr,
        review: rv,
        action: recommendation(p.meta, rv),
        errors,
      });
    }
  } catch (e) {
    rep.error = (e as Error).message;
  }
  return rep;
}

function printStatus(reps: StackReport[], markdown: boolean): void {
  for (const r of reps) {
    if (!r.present) {
      console.log(`${r.stack}  ${r.fork}: missing (optional stack)\n`);
      continue;
    }
    const head =
      `${r.stack}  ${r.fork} <- ${r.upstream}  model ${r.model}` +
      (r.ahead !== undefined
        ? `  ${r.ahead} patch(es), ${r.behind} upstream commit(s) to integrate`
        : "") +
      (r.base ? `  base ${r.base}` : "") +
      (r.upstream_tip ? `  amont ${r.upstream_tip}` : "");
    if (markdown) {
      console.log(`### ${r.stack}\n\n${head.replace(/  +/g, " ; ")}\n`);
      if (r.error) console.log(`Erreur : ${r.error}\n`);
      if (r.patches.length) {
        console.log(
          "| # | Patch | Statut | Revue | Action |\n|---|---|---|---|---|",
        );
        for (const p of r.patches)
          console.log(
            `| ${p.index} | ${p.subject.replace(/\|/g, "\\|")} (\`${p.id}\`) | ${STATUS_FR[p.status]}${p.note ? ` [${p.note}]` : ""} | ${p.pr ? `${p.pr} (${p.review?.state ?? "?"})` : "-"} | ${p.action}${p.errors ? ` ; ${p.errors} erreur(s) check` : ""} |`,
          );
        console.log("");
      } else console.log("Aucun patch.\n");
      continue;
    }
    console.log(head);
    if (r.error) console.log(`  error: ${r.error}`);
    if (r.mirror) {
      for (const m of r.mirror)
        console.log(
          `  ${m.branch.padEnd(16)} ${m.in_sync ? "à jour" : "en retard"}  ${m.fork_tip?.slice(0, 12) ?? "absente"} <- ${m.source_tip?.slice(0, 12) ?? "?"}  ${m.source}`,
        );
      console.log("");
      continue;
    }
    for (const p of r.patches)
      console.log(
        `  ${String(p.index).padStart(2)} ${p.id.padEnd(10)} ${STATUS_FR[p.status].padEnd(18)} ${p.subject.slice(0, 70)}\n` +
          `     -> ${p.action}${p.pr ? `  ${p.pr} (${p.review?.state ?? "?"})` : ""}${p.owner ? `  porteur ${p.owner}` : ""}${p.errors ? `  ${p.errors} erreur(s) check` : ""}`,
      );
    if (!r.patches.length) console.log("  no patch");
    console.log("");
  }
}

async function sync(root: string, s: StackConfig, o: Opts): Promise<number> {
  if (s.optional && !repoExists(s.fork)) {
    console.log(`${s.name}: ${s.fork} missing, skipped`);
    return 0;
  }
  if (s.model === "mirror")
    return mirrorSync(root, s as MirrorStack, o.flags.has("push"));
  const dir = ensureCheckout(root, s);
  if (!o.flags.has("no-fetch")) fetchBoth(dir, s);
  const at = new Date().toISOString();
  if (s.model === "series") {
    const patches = fileSeries(root, s);
    const r = checkSeries(root, dir, s, patches);
    const mirror = o.flags.has("push") ? mergeUpstream(s.fork, s.branch) : null;
    const state = {
      at,
      upstream_tip: revParse(dir, `refs/remotes/upstream/${s.ref}`),
      patches: patches.length,
      ok: r.ok,
      failed: r.failed?.sha,
      err: r.err,
      mirror,
    };
    writeState(root, s, "last-sync.json", state);
    console.log(
      r.ok
        ? `${s.name}: ${patches.length} patch(es) applied on ${state.upstream_tip?.slice(0, 12)}${mirror ? `; mirror ${s.fork}: ${mirror.message}` : ""}`
        : `${s.name} : CONFLIT ${r.failed!.sha}\n${r.err}`,
    );
    return r.ok ? 0 : 3;
  }
  const originTip = revParse(dir, `refs/remotes/origin/${s.branch}`)!;
  const local = revParse(dir, `refs/heads/${s.branch}`);
  if (
    local &&
    local !== originTip &&
    git(dir, ["merge-base", local, originTip]) !== local
  ) {
    console.error(
      `${s.name}: local ${s.branch} has commits missing from ${s.fork}; push or rebase first`,
    );
    return 2;
  }
  const upTip = revParse(dir, `refs/remotes/upstream/${s.ref}`)!;
  const { base, patches } = branchSeries(dir, s, originTip);
  applyRegistry(root, s, patches);
  const reviews = new Map<Patch, Review | null>();
  for (const p of patches) reviews.set(p, await review(p.meta.pr));
  const drop = (p: Patch) =>
    reviews.get(p)?.state === "merged"
      ? `merged upstream (${p.meta.pr})`
      : p.meta.status === "backport"
        ? "Upstream-Status: Backport"
        : null;
  if (base === upTip && !patches.some(drop)) {
    console.log(
      `${s.name}: up to date (base ${upTip.slice(0, 12)}, ${patches.length} patch(es))`,
    );
    writeState(root, s, "last-sync.json", {
      at,
      result: "up-to-date",
      base: upTip,
      patches: patches.length,
    });
    return 0;
  }
  const r = replay(dir, patches, upTip, drop);
  if (!r.ok) {
    const state = {
      at,
      result: "conflict",
      upstream_tip: upTip,
      patch: r.patch.meta.subject,
      sha: r.patch.sha,
      conflicts: r.conflicts,
      applied: r.applied,
      dropped_before: r.dropped.map((d) => ({
        subject: d.patch.meta.subject,
        why: d.why,
      })),
    };
    writeState(root, s, "last-sync.json", state);
    console.error(
      `${s.name}: CONFLICT on patch ${r.patch.index} "${r.patch.meta.subject}" (${r.patch.sha.slice(0, 10)})`,
    );
    for (const f of r.conflicts) console.error(`  ${f}`);
    console.error(
      `  ${r.applied} patch(es) replayed before; fork unchanged. Resolve: docs/upstream/STRATEGY.md, "Conflict".`,
    );
    return 3;
  }
  moveBranch(dir, s, r.head, local ?? originTip);
  if (o.flags.has("push")) push(dir, s, r.head, originTip);
  const state = {
    at,
    result: "rebased",
    from_base: base,
    upstream_tip: upTip,
    previous_head: originTip,
    head: r.head,
    pushed: o.flags.has("push"),
    kept: r.kept.map((p) => p.meta.subject),
    dropped: r.dropped.map((d) => ({
      subject: d.patch.meta.subject,
      why: d.why,
    })),
  };
  writeState(root, s, "last-sync.json", state);
  console.log(
    `${s.name}: ${base.slice(0, 12)} -> ${upTip.slice(0, 12)}, ${r.kept.length} patch(es) kept, ${r.dropped.length} dropped` +
      (o.flags.has("push")
        ? `, pushed (previous ${originTip.slice(0, 12)})`
        : ", not pushed (--push)"),
  );
  for (const d of r.dropped)
    console.log(`  dropped: ${d.patch.meta.subject}: ${d.why}`);
  return 0;
}

function seriesOf(
  root: string,
  s: StackConfig,
  dir: string,
): { base: string; patches: Patch[]; tip: string } {
  if (s.model === "series")
    return {
      base: "",
      patches: applyRegistry(root, s, fileSeries(root, s)),
      tip: "",
    };
  const tip = revParse(dir, `refs/remotes/origin/${s.branch}`)!;
  const series = branchSeries(dir, s, tip);
  return {
    base: series.base,
    patches: applyRegistry(root, s, series.patches),
    tip,
  };
}

function findingsOf(
  root: string,
  s: StackConfig,
  dir: string,
  p: Patch,
): Finding[] {
  let authors: string | null | undefined;
  if (s.rules === "chromium") {
    try {
      authors = git(dir, ["show", `refs/remotes/upstream/${s.ref}:AUTHORS`]);
    } catch {
      authors = null;
    }
  }
  return check(s.rules, {
    meta: p.meta,
    files: p.files,
    added: addedLines(dir, p),
    authorEmail: p.authorEmail,
    authors,
  });
}

function printFindings(p: Patch, f: Finding[]): number {
  const errors = f.filter((x) => x.level === "error").length;
  console.log(
    `${p.index}. ${p.meta.subject}  ${errors ? `${errors} error(s)` : "compliant"}`,
  );
  for (const x of f) console.log(`   ${x.level.padEnd(5)} ${x.rule}: ${x.msg}`);
  return errors;
}

async function pr(root: string, s: StackConfig, o: Opts): Promise<number> {
  const dir = ensureCheckout(root, s);
  if (!o.flags.has("no-fetch")) fetchBoth(dir, s);
  const { patches } = seriesOf(root, s, dir);
  const p = findPatch(patches, o.args[2] ?? "");
  const findings = findingsOf(root, s, dir, p);
  const errors = printFindings(p, findings);
  if (errors && !o.flags.has("force")) {
    console.error(
      "Upstream rules not met: fix the patch (or --force to prepare the head anyway).",
    );
    if (o.flags.has("open")) return 4;
  }
  if (s.forge === "gerrit") {
    const name = headRef(p.meta.subject).slice(3);
    console.log(`
Gerrit (${s.gerrit}), on ${s.runner} in the Chromium checkout, owner's account:
  git new-branch up-${name} --upstream origin/${s.ref}     # ephemeral local branch, never pushed to a fork
  git am -3 ${p.file ?? p.sha}
  git cl format && git cl presubmit --upload --force
  git cl upload --no-squash --send-mail=false              # the owner reviews, then "Start review" in Gerrit
  git checkout origin/${s.ref} && git branch -D up-${name}  # after merge or abandonment
Owner prerequisites (final click): CLA https://cla.developers.google.com/about/google-individual;
Gerrit credentials https://chromium-review.googlesource.com/new-password (or luci-auth) on ${s.runner}.
The description keeps its "AI assistance:" paragraph (agents/ai_policy.md); the owner answers reviewers personally.`);
    return 0;
  }
  const upTip = revParse(dir, `refs/remotes/upstream/${s.ref}`)!;
  const picked = pickTree(dir, p.commit!, upTip);
  if ("conflicts" in picked) {
    console.error(
      `"${p.meta.subject}" does not apply alone on ${s.upstream}@${upTip.slice(0, 12)}:`,
    );
    for (const f of picked.conflicts) console.error(`  ${f}`);
    console.error(
      "It depends on an earlier patch of the stack or on the upstream state: make it standalone before the PR.",
    );
    return 3;
  }
  const head = commitTree(
    dir,
    p.commit!,
    picked.tree,
    upTip,
    upstreamMessage(p.commit!.message),
  );
  const ref = headRef(p.meta.subject);
  const body = bunPrBody(p.meta);
  const bodyFile = writeState(root, s, `pr-${p.slug}.md`, "");
  writeFileSync(bodyFile, body);
  console.log(
    `\nhead ${ref} = ${s.upstream}@${upTip.slice(0, 12)} + ${p.sha.slice(0, 10)} -> ${head.slice(0, 12)}\nbody: ${bodyFile}`,
  );
  if (o.flags.has("push-head") || o.flags.has("lint") || o.flags.has("open")) {
    git(dir, [
      "push",
      "--quiet",
      "--force",
      "origin",
      `${head}:refs/heads/${ref}`,
    ]);
    console.log(`pushed: ${s.fork}:${ref}`);
  }
  if (o.flags.has("lint"))
    for (const wf of s.lint_workflows ?? []) {
      const r = gh(["workflow", "run", wf, "-R", s.fork, "--ref", ref]);
      console.log(
        `  upstream CI ${wf}: ${r.code === 0 ? "launched" : `failed (${r.err.trim()})`}`,
      );
    }
  if (!o.flags.has("open")) return 0;
  if (errors && !o.flags.has("force")) return 4;
  const prev = existingPr(s.upstream, s.fork, ref);
  if (prev) {
    console.log(`PR already open for ${ref}: ${prev.url} (${prev.state})`);
    return 0;
  }
  const r = gh([
    "pr",
    "create",
    "-R",
    s.upstream,
    "--head",
    `${s.fork.split("/")[0]}:${ref}`,
    "--base",
    s.ref,
    "--title",
    p.meta.subject,
    "--body-file",
    bodyFile,
  ]);
  if (r.code !== 0) {
    console.error(`gh pr create : ${r.err.trim()}`);
    return 1;
  }
  const url = r.out.trim().split("\n").at(-1)!;
  console.log(`PR ouverte : ${url}`);
  const f = saveEntry(root, s, p.slug, {
    subject: p.meta.subject,
    status: "submitted",
    note: url,
    pr: url,
    owner: p.meta.owner ?? undefined,
  });
  console.log(
    `status: "${p.meta.subject}" Submitted in ${f} (to commit in src)`,
  );
  return 0;
}

async function mark(root: string, s: StackConfig, o: Opts): Promise<number> {
  const statusArg = (o.args[3] ?? "").toLowerCase() as Status;
  if (!o.flags.has("trailer")) {
    // Default: the registry in src, no rewrite of the fork history.
    if (!STATUSES.includes(statusArg))
      throw new Error(
        `status "${o.args[3] ?? ""}": ${STATUSES.join(" | ")}`,
      );
    const dir = ensureCheckout(root, s);
    if (!o.flags.has("no-fetch")) fetchBoth(dir, s);
    const p = findPatch(seriesOf(root, s, dir).patches, o.args[2] ?? "");
    const f = saveEntry(root, s, p.slug, {
      subject: p.meta.subject,
      status: statusArg,
      note: o.args.slice(4).join(" "),
      pr: o.values.get("pr") ?? p.meta.pr ?? undefined,
      owner: o.values.get("owner") ?? p.meta.owner ?? undefined,
    });
    console.log(`"${p.meta.subject}": ${statusArg} (${f})`);
    return 0;
  }
  if (s.model !== "branch")
    throw new Error(
      "mark --trailer: \"branch\" stacks only (series: edit the .patch file)",
    );
  const dir = ensureCheckout(root, s);
  if (!o.flags.has("no-fetch")) fetchBoth(dir, s);
  const { base, patches, tip } = seriesOf(root, s, dir);
  const p = findPatch(patches, o.args[2] ?? "");
  const status = (o.args[3] ?? "").toLowerCase() as Status;
  if (!STATUSES.includes(status))
    throw new Error(`status "${o.args[3] ?? ""}": ${STATUSES.join(" | ")}`);
  const local = revParse(dir, `refs/heads/${s.branch}`);
  if (local && local !== tip)
    throw new Error(
      `${s.branch} local (${local.slice(0, 10)}) != ${s.fork} (${tip.slice(0, 10)}) : synchroniser d'abord`,
    );
  const next = rewriteMessage(dir, base, patches, p, {
    status,
    statusNote: o.args.slice(4).join(" "),
    pr: o.values.get("pr") ?? p.meta.pr,
    owner: o.values.get("owner") ?? p.meta.owner,
  });
  moveBranch(dir, s, next, local ?? tip);
  if (o.flags.has("push")) push(dir, s, next, tip);
  console.log(
    `"${p.meta.subject}": ${status}${o.flags.has("push") ? `, ${s.fork}:${s.branch} pushed` : " (local; --push to publish)"}`,
  );
  return 0;
}

function gc(s: StackConfig, o: Opts): number {
  if (s.forge !== "github") return 0;
  for (const h of forkHeads(s.fork)) {
    const p = existingPr(s.upstream, s.fork, h);
    const gone = p && (p.state === "MERGED" || p.state === "CLOSED");
    console.log(
      `${h} : ${p ? `${p.url} ${p.state}` : "sans PR"}${gone ? (o.flags.has("dry-run") ? " -> à supprimer" : deleteHead(s.fork, h) ? " -> supprimé" : " -> échec suppression") : ""}`,
    );
  }
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const o = parse(argv);
  const cmd = o.args[0];
  if (!cmd || cmd === "help" || o.flags.has("help")) {
    console.log(USAGE);
    return cmd ? 0 : 2;
  }
  const root = repoRoot();
  const stacks = loadStacks(root);
  switch (cmd) {
    case "status": {
      const chosen =
        o.args.length > 1
          ? o.args.slice(1).map((n) => pick(stacks, n))
          : stacks;
      const reps = await Promise.all(
        chosen.map((s) => stackStatus(root, s, !o.flags.has("no-fetch"))),
      );
      if (o.flags.has("json")) console.log(JSON.stringify(reps, null, 2));
      else printStatus(reps, o.flags.has("markdown"));
      return reps.some((r) => r.error) ? 1 : 0;
    }
    case "sync": {
      const chosen =
        o.args[1] === "all"
          ? stacks
          : (o.args[1] ?? "")
              .split(",")
              .flatMap((n) =>
                stacks.some((x) => x.group === n && x.name !== n)
                  ? stacks.filter((x) => x.group === n)
                  : [pick(stacks, n)],
              );
      let code = 0;
      for (const s of chosen) code = Math.max(code, await sync(root, s, o));
      return code;
    }
    case "check": {
      const s = pick(stacks, o.args[1]);
      const dir = ensureCheckout(root, s);
      if (!o.flags.has("no-fetch")) fetchBoth(dir, s);
      const { patches } = seriesOf(root, s, dir);
      const list = o.args[2] ? [findPatch(patches, o.args[2])] : patches;
      let errors = 0;
      for (const p of list)
        errors += printFindings(p, findingsOf(root, s, dir, p));
      return errors ? 1 : 0;
    }
    case "pr":
      return pr(root, pick(stacks, o.args[1]), o);
    case "mark":
      return mark(root, pick(stacks, o.args[1]), o);
    case "gc":
      return gc(pick(stacks, o.args[1]), o);
    case "export": {
      const s = pick(stacks, o.args[1]);
      const dir = ensureCheckout(root, s);
      const { base, tip } = seriesOf(root, s, dir);
      const names = exportSeries(
        dir,
        `${base}..${tip}`,
        o.args[2] ?? join(root, "var", "upstream", s.name, "patches"),
      );
      console.log(`${names.length} patch(es) exported`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (e) {
    console.error(`ay upstream: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
