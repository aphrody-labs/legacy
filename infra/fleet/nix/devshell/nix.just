# Nix dev shell (imported by the root justfile).

# Nix alternative to containers: dev shell from infra/fleet/nix/devshell/flake.nix
[group('docker')]
nix-shell:
    nix develop "{{root}}/infra/fleet/nix/devshell"
