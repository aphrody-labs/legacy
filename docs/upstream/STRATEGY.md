# Staying compatible with upstream

Command: `ay upstream` (`packages/upstream`, run by bun). Stacks: `tools/upstream/stacks.toml` and `tools/upstream/stacks.d/*.toml`. Statuses: `tools/upstream/status/<stack>.toml`. Live state: `ay upstream status [stack] [--json|--markdown]`.

## Models

- **Branch model** (bun and the web forks: next.js, shadcn-ui, base-ui, tailwindcss, better-auth): the fork's default branch is upstream plus a linear series of commits, one commit = one patch = one potential PR. See the stack with `git log upstream/main..origin/main`.
- **Series model** (Chromium, Linux kernels): `.patch` files in `tools/upstream/patches/<stack>/`, in the order of `.patches`, applied on the upstream tip in a temporary index. The GitHub fork stays a mirror advanced by fast-forward; Chromium contributions go through Gerrit.

The series format and export options follow Electron (`git format-patch --keep-subject --no-stat --no-signature --zero-commit --full-index`, `ay upstream export`), and the status vocabulary follows Yocto's `Upstream-Status`.

## Statuses

| Status | Meaning | Action |
| --- | --- | --- |
| `Pending` | to be proposed | `ay upstream check`, then `ay upstream pr` |
| `Submitted [url]` | proposed (PR or CL) | state read live |
| `Backport [url]` | present upstream | removed at the next `sync` |
| `Denied [reason]` | refused | rework or move to `Inappropriate` |
| `Inappropriate [reason]` | specific to this project | kept; `check` refuses to make a PR of it |

`ay upstream mark <stack> <patch> <status>` writes the register in `tools/upstream/status/`. A patch that becomes empty on a new base is dropped like a `Backport`.

## Commands

```sh
ay upstream status [stack]            # state of each stack
ay upstream sync <stack> --push       # replay the series on upstream; exit 3 at the first conflict, fork unchanged
ay upstream check <stack> [patch]     # upstream contribution rules
ay upstream pr <stack> <patch> --lint # ephemeral head = upstream + that patch, upstream CI on it
ay upstream pr <stack> <patch> --open # open the PR
ay upstream gc <stack>                # delete up/* and pr/* heads whose PR is merged or closed
```

The stack is rebuilt with git plumbing (`merge-tree --write-tree`, `commit-tree`, `update-ref`, `push --force-with-lease`): no checkout, no worktree, no local branch. After a `sync`, run `git pull --rebase` in a clone.

## Branches: the one exception

Everything lives on the default branch. GitHub needs a head branch to open a PR from a fork, so `up/<name>` and `pr/<name>` exist on the fork only, generated from one patch, and `ay upstream gc` deletes them once the PR is closed. Chromium's `git cl upload` uses an ephemeral local branch `up-<name>` on the build host.

## Schedule

`tools/upstream/install.sh` installs the daily `sync` and `gc` timer (unit `aphrody-upstream.timer`) on the hosts; Chromium builds and tests run on fr1 (`tools/upstream/chromium-verify.sh`). The `ay upstream` tests run in `ci.yml`. Nothing compiles on the workstation.

## Contribution rules checked by `check`

- bun: the upstream PR template and `on-slop.yml` (a `Tested:` paragraph, and a test under `test/` when `src/` changes); upstream format and lint workflows run on the head.
- Chromium: Google CLA, `AUTHORS` entry, 72-column description, `Bug:` or `Fixed:` footer, `git cl format` and `git cl presubmit`. The Chromium AI policy requires a human to review and answer; each CL carries an `AI assistance:` paragraph (rule `cr-ai-note`).
- Everywhere: no emoji, no secret, subject of at most 72 characters. Upstream policy prevails for an upstream contribution.

## Conflict during `sync`

`sync` stops at the first patch that no longer applies, writes `var/upstream/<stack>/last-sync.json` and leaves the fork as it is. The patch owner replays it on upstream, pushes it in place, or removes it if upstream solved the problem differently; then `ay upstream sync <stack> --push`.
