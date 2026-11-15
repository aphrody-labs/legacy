# From Claude Code to the NT kernel: layers, latencies, levers (2026-11-12)

Sources: `claude.exe` 2.1.318 binary (embedded code read), Anthropic docs (code.claude.com, platform.claude.com — gathered by an agent, URLs in the report), Microsoft Learn (MCP on Windows, Windows AI security book, Policy CSP WindowsAI), GitHub (microsoft/_, vercel-labs/_), hyperfine measurements on this machine. Machine: `~/.claude/skills/windows-machine/profile.md`.

## 1. The chain, layer by layer

| #   | Layer                 | What happens there                                                                                                                                                     | Proof                                           |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0   | Model (Anthropic API) | inference, one decision per turn                                                                                                                                       | — (off machine)                                 |
| 1   | `claude.exe`          | standalone **Bun 1.4.4** executable (Windows x64, 342 MB), tools launched by `Bun.spawn`                                                                               | string `Bun v1.4.4 (Windows x64)` in the binary |
| 2a  | Bash tool             | one process per command: `bash.exe -c "source <snapshot> && eval <cmd>"`; snapshot created at session start through `spawn(shell, ["-c","-l",script])`                 | code extracted from the binary; shell agent     |
| 2b  | PowerShell tool       | `cmd.exe` → `chcp 65001` → `pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass` (disabled here: `CLAUDE_CODE_USE_POWERSHELL_TOOL=0`)                              | binary + tools-reference doc                    |
| 2c  | MCP servers           | stdio (persistent process) or HTTP; preferred to the GUI by Claude (documented order: MCP > Bash > Chrome > computer use)                                              | computer-use doc                                |
| 2d  | Claude in Chrome      | `claude.exe` ↔ pipe `\\.\pipe\claude-mcp-browser-bridge-<user>` ↔ native host (`cmd.exe` → `.bat` → `claude.exe --chrome-native-host`) ↔ extension (`chrome.debugger`) | Chrome agent                                    |
| 3   | Win32 / subsystems    | `CreateProcessW`, consoles (conhost/ConPTY), UI Automation (cross-process COM), `SendInput`, Windows.Graphics.Capture                                                  | agent-desktop sources (`crates/windows`)        |
| 4   | Security              | Defender (scan of every new process), UIPI (integrity), secure desktop (UAC), VBS active                                                                               | machine profile; agent-desktop skill            |
| 5   | Kernel                | `ntoskrnl` (processes, objects, ALPC), `win32k*.sys` including `win32kbase_rs.sys` (Rust), DWM for composition                                                         | `rust-in-windows.md`                            |

## 2. Measured latencies (this machine, hyperfine)

| Operation                                                  | Cost                                                |
| ---------------------------------------------------------- | --------------------------------------------------- |
| niubash startup `-c exit`                                  | 16.3 ms (Git Bash 19.2 ms, brush 8.4 ms)            |
| Claude Bash tool call (shell agent)                        | ~20 ms; PowerShell ~185 ms (.NET)                   |
| Session snapshot creation (Git Bash, before/after cleanup) | 1,452 → 100 ms                                      |
| `agent-desktop` idle launch                                | 10.8 ms                                             |
| `list-windows`                                             | 25.7 ms                                             |
| UIA tree of a window (Windows Terminal, 8 KB JSON)         | 91.9 ms                                             |
| PNG capture window / 2560x1440 screen                      | 335 / 317 ms                                        |
| Capture through the computer use API                       | 1,000–1,800 input tokens per image (Anthropic docs) |

Finding: for each action, the **model turn** (inference) dominates by several orders of magnitude; on the machine side, the screenshot GUI is the most expensive path, the accessibility tree ~3.5× cheaper and far fewer tokens.

## 3. What keeps Claude away from the kernel (and the lever)

| Brake                                                                                                       | Lever applied / proposed                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| One process per Bash command, MSYS `fork()` emulation, arguments truncated at ~8,186 characters by Git Bash | native **niubash** (done), repaired snapshot (done), Microsoft Coreutils (done)                                                            |
| PowerShell = .NET startup ~185 ms + intermediate `cmd.exe`                                                  | PowerShell tool disabled (done)                                                                                                            |
| No computer use in the Claude Code CLI on Windows (macOS only)                                              | **persistent MCP `agent-desktop mcp --headed`** (UIA + SendInput + WGC, 67 tools) and `agent-browser mcp`, registered at user scope (done) |
| One process launch per GUI action                                                                           | MCP mode: single process, no launch cost                                                                                                   |
| Full-resolution PNG capture (317 ms)                                                                        | patch of the `aphrody-labs/agent-desktop` fork: configurable format/scale, frame pool reuse (to do)                                        |
| UI polling                                                                                                  | `wait --event` / `--wait-for` (UIA events) instead of repeated captures                                                                    |
| Model round trips                                                                                           | `desktop_batch` (several actions per turn); accessibility tree rather than images                                                          |
| Windows isolation of agents (contained ODR MCP, agent workspace)                                            | enabled by the user only (section 4)                                                                                                       |

## 4. Settings that belong to the user (security)

These settings are not changed by the agents; they alter the security posture of the machine.

| Setting                            | Path                                            | Effect                                                                                                                       | Source                                          |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Experimental agentic features      | Settings > System > AI components > Agent tools | agent account, agent workspace; condition of the MCP surface (`odr mcp list` currently answers "MCP surface is not enabled") | Learn, Windows security book (agentic security) |
| Reduce agent connector protections | Settings > System > Advanced > AI components    | unpackaged MCP servers outside the container (less safe)                                                                     | Learn, MCP containment                          |
| Claude Desktop computer use        | Claude Desktop > Settings > This computer       | native GUI control by Anthropic on Windows (preview, Pro/Max/Ultra plans)                                                    | Anthropic desktop docs                          |
| UAC / secure desktop               | —                                               | no agent (including agent-desktop) drives the secure desktop; leave as is                                                    | agent-desktop skill                             |
