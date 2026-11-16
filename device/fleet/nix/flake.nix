# Fleet Linux shells through home-manager (standalone): same environment as the Windows workstation,
# lu depuis system/machine-ts/shells (env.toml -> env.sh/env.nu/env.fish, configs nu/fish/bash, spec ay).
# Nix is installed on no host (2026-11-13); evaluated in the nixos/nix container on prd.
# Usage (host with nix, git checkout of src):
#   nix run home-manager/master -- switch --flake ~/src/device/fleet/nix#root@prd
{
  description = "aphrody fleet shells (bash, brush, nushell, fish) — home-manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, home-manager, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      mk =
        username: homeDirectory:
        home-manager.lib.homeManagerConfiguration {
          inherit pkgs;
          modules = [
            ./home.nix
            { home = { inherit username homeDirectory; }; }
          ];
        };
    in
    {
      homeConfigurations = {
        "root@prd" = mk "root" "/root";
        "ubuntu@fr2" = mk "ubuntu" "/home/ubuntu";
        "ubuntu@fr1" = mk "ubuntu" "/home/ubuntu";
      };
    };
}
