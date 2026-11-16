# Nix dev shell (imported by the root justfile).

# Nix alternative to containers: dev shell from device/fleet/nix/devshell/flake.nix
[group('docker')]
nix-shell:
    nix develop "{{root}}/device/fleet/nix/devshell"
