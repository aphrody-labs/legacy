# fish 4.x — repository config.fish (stub ~/.config/fish/config.fish -> this file, manifest.toml).
# Linux only. Common environment: ../env.fish, generated from ../env.toml.
source (status dirname)/../env.fish

status is-interactive; or return 0

set -g fish_greeting
# Cached init (regenerate: rm $AY_SHELL_CACHE/fish/*): no fork at startup once the cache exists.
set -l c $AY_SHELL_CACHE/fish
if type -q zoxide
    test -s $c/zoxide.fish; or begin; mkdir -p $c; zoxide init fish >$c/zoxide.fish; end
    source $c/zoxide.fish
end
if type -q starship
    test -s $c/starship.fish; or begin; mkdir -p $c; starship init fish >$c/starship.fish; end
    source $c/starship.fish
end
if type -q atuin
    test -s $c/atuin.fish; or begin; mkdir -p $c; atuin init fish --disable-up-arrow >$c/atuin.fish; end
    source $c/atuin.fish
end

abbr -a gs git status -sb
abbr -a gd git diff
abbr -a gl git log --oneline --graph --decorate -20
abbr -a gp git pull --ff-only
abbr -a gaa git add -A
abbr -a b bun
abbr -a bx bunx
abbr -a lg lazygit
abbr -a ff fastfetch
if type -q eza
    abbr -a ll eza -la --git --icons=auto --group-directories-first
    abbr -a lt eza -T --level=2 --icons=auto
end
if type -q bat
    alias cat='bat --paging=never'
end
# Completions: git, cargo, just provided by fish; ay = ~/.config/fish/completions/ay.fish (manifest).
