# nushell 0.117 — repository config.nu (stub: $nu.config-path -> this file, manifest.toml).
# Keys verified with `config nu --doc` (0.117.0). Startup: no external process here;
# zoxide and carapace are pre-generated in vendor/autoload by shells.ts (loaded after this file).

$env.config.show_banner = false
$env.config.history.file_format = "plaintext"
$env.config.history.max_size = 100_000
$env.config.history.sync_on_enter = true
$env.config.history.ignore_space_prefixed = true
$env.config.completions.algorithm = "fuzzy"
$env.config.completions.case_sensitive = false
$env.config.completions.quick = true
$env.config.completions.partial = true
$env.config.completions.external.enable = true
$env.config.completions.external.max_results = 100
$env.config.table.index_mode = "auto"
$env.config.footer_mode = 25

# Aliases: never on a nu internal command (ls, find, du, ps stay structured).
alias ll = eza -la --git --icons=auto --time-style=relative
alias la = eza -a --git --icons=auto
alias tree = eza --tree --icons=auto
alias gs = git status -sb
alias gd = git diff
alias gl = git log --oneline --graph --decorate -20
alias gp = git pull --ff-only
alias gaa = git add -A
alias b = bun
alias bx = bunx
alias lg = lazygit
alias ff = fastfetch

def --env y [...args] {
  let tmp = (mktemp -t "yazi-cwd.XXXXXX")
  yazi ...$args $"--cwd-file=($tmp)"
  let cwd = (open $tmp)
  if $cwd != "" and $cwd != $env.PWD { cd $cwd }
  rm -fp $tmp
}

# Native completion of `ay` (external signatures generated from `ay --help`).
source ../completions/ay.nu
