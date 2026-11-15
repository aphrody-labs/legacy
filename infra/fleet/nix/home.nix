# Options verified in nix-community/home-manager (modules/programs/{bash,fish,nushell,carapace,zoxide}.nix, master).
{ pkgs, ... }:
let
  # Copied as is into the store: the relative paths of the configs (../env.nu, status dirname) stay valid.
  shells = ../../../packages/machine/shells;
in
{
  home.stateVersion = "25.11";
  programs.home-manager.enable = true;

  home.packages = with pkgs; [
    brush
    eza
    fd
    ripgrep
    just
  ];

  # Bash family: shared bashrc (agent A), which sources ../env.sh.
  programs.bash = {
    enable = true;
    bashrcExtra = ''. "${shells}/bash/bashrc"'';
  };

  programs.fish = {
    enable = true;
    shellInit = "source ${shells}/fish/config.fish";
  };
  xdg.configFile."fish/completions/ay.fish".source = "${shells}/completions/ay.fish";

  programs.nushell = {
    loadSessionVariables = false; # the repository env.nu sets the variables
    enable = true;
    extraEnv = "source ${shells}/nu/env.nu";
    extraConfig = "source ${shells}/nu/config.nu";
  };

  # Shared completion (ay + git/cargo/just spec); fish keeps its native completions.
  programs.carapace = {
    enable = true;
    enableFishIntegration = false;
  };
  xdg.configFile."carapace/specs/ay.yaml".source = "${shells}/completions/ay.yaml";

  # zoxide : nu via home-manager ; bash et fish l'initialisent depuis leur cache ($AY_SHELL_CACHE).
  programs.zoxide = {
    enable = true;
    enableBashIntegration = false;
    enableFishIntegration = false;
    enableNushellIntegration = true;
  };
}
