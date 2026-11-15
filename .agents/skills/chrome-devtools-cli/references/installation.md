# Installation

Install the package globally to make the `chrome-devtools` command available. You only need to do this the first time you use it.

```sh
bun add -g chrome-devtools-mcp
chrome-devtools status # check if install worked.
```

## Troubleshooting

- **Command not found:** `~/.bun/bin` (bun's global bin, holds `chrome-devtools.exe`) must be on PATH.
- **Old version running:** `chrome-devtools stop && bun remove -g chrome-devtools-mcp`, then `bun add -g chrome-devtools-mcp`.
- **Runtime:** the package declares node ^20.19 || ^22.12 || >=23 but runs under bun's shim (verified with 1.13.0: initialize and tools/list succeed). Report a crash instead of installing node.
