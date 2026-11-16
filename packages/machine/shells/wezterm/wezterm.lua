-- Cross-platform WezTerm configuration (Nerd Font v3 + dynamic shell resolution, zero broken hardcoded paths)
local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action

local is_win = wezterm.target_triple:find("windows") ~= nil

local function file_exists(path)
  if not path or path == "" then return false end
  local f = io.open(path, "rb")
  if f then f:close() return true end
  return false
end

local function first_existing(candidates)
  for _, entry in ipairs(candidates) do
    if file_exists(entry.path) then return entry end
  end
  return nil
end

config.font = wezterm.font_with_fallback({
  { family = "Google Sans Code", weight = "Regular" },
  "Symbols Nerd Font Mono",
  "Material Symbols Rounded",
  { family = "CaskaydiaCove Nerd Font", weight = "Regular" },
  "Cascadia Mono",
  "Consolas",
})
config.font_size = 20.0
config.line_height = 1.08
config.harfbuzz_features = { "calt=1", "clig=1", "liga=1" }

-- Theme: Catppuccin Mocha aligned with Aphrody M3 Dark terminal contrast
config.color_scheme = "Catppuccin Mocha"
config.colors = {
  background = "#1E1E2E",
  foreground = "#CDD6F4",
  cursor_bg = "#F5E0DC",
  cursor_fg = "#1E1E2E",
  selection_bg = "#45475A",
  selection_fg = "#CDD6F4",
  tab_bar = {
    background = "#181825",
    active_tab = { bg_color = "#1E1E2E", fg_color = "#89B4FA", intensity = "Bold" },
    inactive_tab = { bg_color = "#181825", fg_color = "#7F849C" },
    new_tab = { bg_color = "#181825", fg_color = "#A6ADC8" },
  },
}

config.front_end = "WebGpu"
config.webgpu_power_preference = "HighPerformance"
config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true
config.window_padding = { left = 8, right = 8, top = 6, bottom = 6 }
config.scrollback_lines = 50000
config.default_cursor_style = "BlinkingBar"

if is_win then
  local localapp = os.getenv("LOCALAPPDATA") or ""
  local home = os.getenv("USERPROFILE") or ""
  local prog_candidates = {
    { label = "Niubash", path = localapp .. "\\Programs\\Niubash\\winuxcmd\\bin\\bash.exe", args = { localapp .. "\\Programs\\Niubash\\winuxcmd\\bin\\bash.exe", "-l", "-i" } },
    { label = "PowerShell 7", path = "C:\\Program Files\\PowerShell\\7\\pwsh.exe", args = { "C:\\Program Files\\PowerShell\\7\\pwsh.exe", "-NoLogo" } },
    { label = "Nushell", path = localapp .. "\\Programs\\nu\\bin\\nu.exe", args = { localapp .. "\\Programs\\nu\\bin\\nu.exe" } },
    { label = "Git Bash", path = "C:\\Program Files\\Git\\bin\\bash.exe", args = { "C:\\Program Files\\Git\\bin\\bash.exe", "-l", "-i" } },
    { label = "Brush", path = home .. "\\.cargo\\bin\\brush.exe", args = { home .. "\\.cargo\\bin\\brush.exe" } },
  }
  local chosen = first_existing(prog_candidates)
  if chosen then
    config.default_prog = chosen.args
  end
  local menu = {}
  for _, c in ipairs(prog_candidates) do
    if file_exists(c.path) then
      table.insert(menu, { label = c.label, args = c.args })
    end
  end
  config.launch_menu = menu
else
  config.default_prog = { os.getenv("SHELL") or "/bin/bash", "-l" }
end

config.keys = {
  { key = "t", mods = "CTRL|SHIFT", action = act.SpawnTab("CurrentPaneDomain") },
  { key = "w", mods = "CTRL|SHIFT", action = act.CloseCurrentTab({ confirm = false }) },
  { key = "|", mods = "CTRL|SHIFT", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
  { key = "_", mods = "CTRL|SHIFT", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
  { key = "Enter", mods = "ALT", action = act.ToggleFullScreen },
}

return config
