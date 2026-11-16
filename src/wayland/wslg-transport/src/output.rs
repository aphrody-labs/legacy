//! Display outputs as the host reports them. No output is invented: on Windows they come from DXGI
//! (`dxgi::enumerate_outputs`), elsewhere from `OutputSpec::parse` (the `--output` flag of `wslg-rs serve`).

use std::fmt;

/// One display mode. `refresh_mhz` is in millihertz, as in `wl_output.mode` (60000 = 60 Hz).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModeSpec {
    pub width: i32,
    pub height: i32,
    pub refresh_mhz: i32,
}

/// A display output and its mode list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputSpec {
    pub name: String,
    pub make: String,
    pub model: String,
    /// Physical size in millimetres; `(0, 0)` when the host cannot report it.
    pub physical_mm: (i32, i32),
    /// Position in the global compositor space.
    pub position: (i32, i32),
    /// `wp_fractional_scale_v1` numerator over 120 (120 = 1.0x, 180 = 1.5x).
    pub scale_120ths: u32,
    pub modes: Vec<ModeSpec>,
    pub current: usize,
    pub preferred: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputParseError(pub String);

impl fmt::Display for OutputParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid output spec: {}", self.0)
    }
}

impl std::error::Error for OutputParseError {}

/// Refresh rate in millihertz from a DXGI rational (`numerator / denominator` Hz), rounded.
pub fn refresh_mhz(numerator: u32, denominator: u32) -> i32 {
    if denominator == 0 {
        return 0;
    }
    ((u64::from(numerator) * 1000 + u64::from(denominator) / 2) / u64::from(denominator)) as i32
}

impl OutputSpec {
    pub fn current_mode(&self) -> ModeSpec {
        self.modes[self.current]
    }

    pub fn preferred_mode(&self) -> ModeSpec {
        self.modes[self.preferred]
    }

    /// Parses `NAME:WxH@HZ[,WxH@HZ...]` (the first mode is current and preferred; the refresh rate may
    /// be fractional, e.g. `DP-1:2560x1440@119.88,1920x1080@60`).
    pub fn parse(spec: &str) -> Result<Self, OutputParseError> {
        let err = |m: &str| OutputParseError(format!("{spec:?}: {m}"));
        let (name, modes) = spec.split_once(':').ok_or_else(|| err("expected NAME:WxH@HZ"))?;
        if name.is_empty() {
            return Err(err("empty name"));
        }
        let mut list = Vec::new();
        for part in modes.split(',') {
            let (size, hz) = part.split_once('@').ok_or_else(|| err("mode needs @HZ"))?;
            let (w, h) = size.split_once('x').ok_or_else(|| err("mode needs WxH"))?;
            let width: i32 = w.parse().map_err(|_| err("bad width"))?;
            let height: i32 = h.parse().map_err(|_| err("bad height"))?;
            let hz: f64 = hz.parse().map_err(|_| err("bad refresh"))?;
            if width <= 0 || height <= 0 || !hz.is_finite() || hz <= 0.0 {
                return Err(err("mode values must be positive"));
            }
            list.push(ModeSpec {
                width,
                height,
                refresh_mhz: (hz * 1000.0).round() as i32,
            });
        }
        Ok(Self {
            name: name.to_string(),
            make: String::new(),
            model: String::new(),
            physical_mm: (0, 0),
            position: (0, 0),
            scale_120ths: 120,
            modes: list,
            current: 0,
            preferred: 0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_modes_and_fractional_refresh() {
        let o = OutputSpec::parse("DP-1:2560x1440@119.88,1920x1080@60").unwrap();
        assert_eq!(o.name, "DP-1");
        assert_eq!(
            o.modes,
            vec![
                ModeSpec { width: 2560, height: 1440, refresh_mhz: 119_880 },
                ModeSpec { width: 1920, height: 1080, refresh_mhz: 60_000 },
            ]
        );
        assert_eq!(o.current_mode(), o.preferred_mode());
        assert_eq!(o.scale_120ths, 120);
    }

    #[test]
    fn parse_rejects_garbage() {
        for bad in ["", "DP-1", ":1x1@1", "DP-1:1920x1080", "DP-1:0x1080@60", "DP-1:axb@60", "DP-1:1x1@0"] {
            assert!(OutputSpec::parse(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn dxgi_rational_to_millihertz() {
        assert_eq!(refresh_mhz(60, 1), 60_000);
        assert_eq!(refresh_mhz(120_000, 1001), 119_880);
        assert_eq!(refresh_mhz(60, 0), 0);
    }
}
