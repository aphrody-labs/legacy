# Replacing Git Bash and pwsh — research and proofs (2026-11-12)

Sources: `claude.exe` 2.1.318 binary (`~/.local/bin`), GitHub (MCP + `gh api`), Microsoft Learn (MCP), Context7 (`/unixwin/niubash`), tests on the machine. No claim from memory.

## 1. What Claude Code requires (proof: code extracted from `claude.exe`)

- Windows: the Bash tool uses `CLAUDE_CODE_GIT_BASH_PATH` **only if** its file name is `bash.exe`, `sh.exe`, `bash` or `sh`; otherwise it searches for Git Bash (`C:\Program Files\Git\bin\bash.exe`, then the `git` in PATH). Without bash: Bash tool unavailable.
- Shell snapshot launched by `spawn(shell, ["-c", "-l", script])`; the script uses `declare -F`, `compgen -v`, `shopt -s expand_aliases`, `unalias -a`, `\builtin eval`.
- `CLAUDE_CODE_USE_POWERSHELL_TOOL=0` disables the PowerShell tool (explicit error message if no bash is found).

## 2. Defect found: truncated snapshot

The 3 snapshots `~/.claude/shell-snapshots/snapshot-bash-*.sh` are exactly 70,927 bytes and stop in the middle of `export PATH='…` (line 203). `bash -c 'source …'` → `unexpected EOF`, rc=2: the saved PATH is never reapplied. Current PATH: 4,365 characters, 87 entries. → PATH cleanup required whatever the shell.

## 3. Bash candidates

| Candidate                                       | Version                                                                    | Proof                                                                                                                                                                                                                            | Verdict                       |
| ----------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **niubash** (unixwin, MIT, Rust; rubash engine) | v1.5.0 (2026-11-03), `winget Unixwin.Niubash`, portable zip + `SHA256SUMS` | SHA256 OK; PE imports without `msys-2.0.dll`/`cygwin1.dll` (dumpbin); `git.exe` niu-git imports `VCRUNTIME140` (MSVC); **end-to-end `claude -p` test passed**: `SHELL=…\winuxcmd\bin\bash.exe`, `BASH_VERSION=5.3.20(1)-release` | **chosen**                    |
| brush (reubeno, MIT, Rust)                      | 0.4.0 installed (2026-05-03)                                               | `claude -p` test **fails**: `a value is required for '-c <COMMAND>'`; fixed by PR #1398 (`d220c79d`, 2026-09-22), **not released** (383 commits since 0.4.0)                                                                     | fallback: pinned `main` build |
| Git Bash (Git for Windows)                      | —                                                                          | MSYS, forbidden by the user                                                                                                                                                                                                      | to remove                     |

Third-party report (brush#1296): GNU Bash `.tests` suite (83 files) on Windows, brush 5/83 semantic matches — not verified locally.

## 4. POSIX/GNU utilities

| Set                                                                                                                              | Language   | Status                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| **Coreutils for Windows** (`microsoft/coreutils`, `winget Microsoft.Coreutils`): uutils coreutils + findutils + grep, multi-call | Rust       | documented on Learn (`learn.microsoft.com/windows/core-utils/overview`), preview |
| WinuxCmd (embedded by niubash, `winuxcmd.exe` + links)                                                                           | mostly C++ | shipped with niubash; to be placed **after** Coreutils in PATH                   |
| sudo, curl, tar, Edit                                                                                                            | —          | built into Windows 11 (Learn)                                                    |
| `gawk` embedded by niubash                                                                                                       | C (GNU)    | only non-Rust/non-MS component of the shell                                      |

## 5. pwsh

No "drop-in" replacement: pwsh is a distinct .NET language. Replacement by use:

- Claude: PowerShell tool disabled (`CLAUDE_CODE_USE_POWERSHELL_TOOL=0`), everything goes through niubash.
- Windows Terminal: niubash default profile (`niu --install-wt-profile --set-default`, Context7).
- `justfile` (`src`, `nt`): `windows-shell` pwsh → niubash, after testing each recipe.
- Windows PowerShell 5.1 stays (system component); pwsh 7 stays installed but is no longer called.

## 6. Reproducibility

- Microsoft: **WinGet Configuration** (YAML, `winget configure -f`) — mechanism documented on Learn for a repeatable installation.
- `src` monorepo: `tools.toml` + `ay up` (`github` sources with checksum). **Blocking**: the installed `ay` 0.2.0 no longer reads `tools.toml` (`unknown variant "ubi"`) and its rebuild from `src/src/ay` failed (`failed to compile aphrody v0.2.0`, cause not yet analyzed).
