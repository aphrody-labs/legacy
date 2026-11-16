// SPDX-License-Identifier: Apache-2.0
//! Every `on-X` role of frameworks/design/tokens/tokens.rs meets WCAG contrast against `X` in all six modes.

fn luminance(argb: u32) -> f64 {
    let channel = |shift: u32| {
        let c = f64::from((argb >> shift) & 0xFF) / 255.0;
        if c <= 0.039_28 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
    };
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

fn contrast(a: u32, b: u32) -> f64 {
    let (la, lb) = (luminance(a), luminance(b));
    (la.max(lb) + 0.05) / (la.min(lb) + 0.05)
}

#[test]
fn every_on_role_meets_contrast_in_all_six_modes() {
    mod tokens {
        include!(concat!(env!("SRC_ROOT"), "/frameworks/design/tokens/tokens.rs"));
    }
    use tokens::md;
    let modes: [(&str, &[(&str, u32)]); 6] = [
        ("light", md::light::ALL),
        ("dark", md::dark::ALL),
        ("light-medium-contrast", md::light_medium_contrast::ALL),
        ("dark-medium-contrast", md::dark_medium_contrast::ALL),
        ("light-high-contrast", md::light_high_contrast::ALL),
        ("dark-high-contrast", md::dark_high_contrast::ALL),
    ];
    let argb = |rgba: u32| rgba.rotate_right(8);
    for (mode, roles) in modes {
        let get = |name: &str| roles.iter().find(|(k, _)| *k == name).map(|(_, v)| argb(*v));
        let min = if mode.ends_with("high-contrast") { 7.0 } else { 4.5 };
        let mut checked = 0;
        for (name, value) in roles {
            let Some(base) = name.strip_prefix("on-") else { continue };
            let bg = match base {
                "surface-variant" => "surface",
                other => other,
            };
            let Some(bg) = get(bg) else { continue };
            let ratio = contrast(argb(*value), bg);
            assert!(ratio >= min, "{mode} {name}: {ratio:.2} < {min}");
            checked += 1;
        }
        assert!(checked >= 14, "{mode}: only {checked} pairs");
        let outline = contrast(get("outline").unwrap(), get("surface").unwrap());
        assert!(outline >= 3.0, "{mode} outline/surface: {outline:.2}");
    }
}
