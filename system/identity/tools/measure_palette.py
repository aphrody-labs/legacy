# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow", "numpy"]
# ///
"""Measure the colour palette of the official character renders (reproducible).

Method (recorded in assets/character/visual.json, palette.method):
  1. Keep the pixels whose alpha is >= 250 (the render is cut out on a transparent background).
  2. Convert sRGB to OKLab (Bjorn Ottosson's matrices), the same space as `pixel mesurer`.
  3. k-means (k-means++ seeding, fixed seed, 40 iterations) over the pixels of all inputs pooled.
  4. Report each centroid as sRGB hex with its pixel share, OKLCH, and the input that holds most of it.
  5. Roles: the median OKLab colour of every pixel whose OKLCH falls in a stated window
     (ROLES below), so that hair, skin and iris are measured on their own pixels instead of
     being averaged into a cluster. The windows are part of the method and are written to the output.
Usage: uv run tools/measure_palette.py K out.json image1.png image2.png ...
"""
import json, sys, math
import numpy as np
from PIL import Image

def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
               [0.2119034982, 0.6806995451, 0.1073969566],
               [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
               [1.9779984951, -2.4285922050, 0.4505937099],
               [0.0259040371, 0.7827717662, -0.8086757660]])

def to_oklab(rgb):
    lms = srgb_to_lin(rgb) @ M1.T
    return np.cbrt(lms) @ M2.T

def from_oklab(lab):
    lms = (lab @ np.linalg.inv(M2).T) ** 3
    return lin_to_srgb(lms @ np.linalg.inv(M1).T)

def kmeans(x, k, seed=7, iters=40):
    rng = np.random.default_rng(seed)
    cent = [x[rng.integers(len(x))]]
    for _ in range(k - 1):
        d = np.min(((x[:, None, :] - np.array(cent)[None]) ** 2).sum(-1), axis=1)
        cent.append(x[rng.choice(len(x), p=d / d.sum())])
    cent = np.array(cent)
    for _ in range(iters):
        lab = ((x[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        new = np.array([x[lab == i].mean(0) if (lab == i).any() else cent[i] for i in range(k)])
        if np.allclose(new, cent, atol=1e-6):
            break
        cent = new
    lab = ((x[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
    return cent, lab

# role: (hue_min, hue_max, chroma_min, chroma_max, lightness_min, lightness_max, box)
# box = (x0, y0, x1, y1) in the 256 x 256 render, or None for the whole image.
ROLES = {
    "hair": (95, 125, 0.06, 0.20, 0.78, 0.93, None),
    "skin": (60, 85, 0.05, 0.11, 0.88, 1.0, None),
    "iris": (10, 55, 0.08, 0.40, 0.0, 0.75, (85, 120, 185, 170)),
    "outline": (0, 360, 0.0, 1.0, 0.0, 0.15, None),
    "garment_white": (0, 360, 0.0, 0.01, 0.93, 1.0, None),
    "sash_blue": (225, 265, 0.03, 0.40, 0.0, 1.0, None),
}

def measure_roles(x, owner, files, xy):
    L = x[:, 0]; C = np.hypot(x[:, 1], x[:, 2]); H = (np.degrees(np.arctan2(x[:, 2], x[:, 1])) + 360) % 360
    out = {}
    for name, (h0, h1, c0, c1, l0, l1, box) in ROLES.items():
        sel = (H >= h0) & (H <= h1) & (C >= c0) & (C <= c1) & (L >= l0) & (L <= l1)
        if box is not None:
            sel &= (xy[:, 0] >= box[0]) & (xy[:, 0] < box[2]) & (xy[:, 1] >= box[1]) & (xy[:, 1] < box[3])
        if not sel.any():
            continue
        med = np.median(x[sel], axis=0)
        srgb = np.rint(from_oklab(med[None])[0] * 255).astype(int)
        by = np.bincount(owner[sel], minlength=len(files))
        out[name] = {"hex": "#%02X%02X%02X" % tuple(srgb), "pixels": int(sel.sum()),
                     "share_pct": round(100 * sel.mean(), 2),
                     "window": {"h": [h0, h1], "c": [c0, c1], "l": [l0, l1], "box": box},
                     "per_input_pixels": {files[j].replace("\\", "/").split("/")[-1]: int(by[j]) for j in range(len(files))}}
    return out

def main():
    k = int(sys.argv[1]); out = sys.argv[2]; files = sys.argv[3:]
    pix, owner, coords = [], [], []
    for i, f in enumerate(files):
        a = np.asarray(Image.open(f).convert("RGBA"), dtype=np.float64) / 255.0
        m = a[..., 3] >= 250 / 255
        p = a[..., :3][m]
        yy, xx = np.nonzero(m)
        coords.append(np.stack([xx, yy], axis=1))
        pix.append(p); owner += [i] * len(p)
    rgb = np.concatenate(pix); owner = np.array(owner); xy = np.concatenate(coords)
    x = to_oklab(rgb)
    cent, lab = kmeans(x, k)
    res = []
    for i in range(k):
        sel = lab == i
        c = cent[i]
        srgb = np.rint(from_oklab(c[None])[0] * 255).astype(int)
        L, A, B = c
        C = math.hypot(A, B); H = (math.degrees(math.atan2(B, A)) + 360) % 360
        by = np.bincount(owner[sel], minlength=len(files))
        res.append({"hex": "#%02X%02X%02X" % tuple(srgb), "share_pct": round(100 * sel.mean(), 2),
                    "oklch": {"l": round(L, 4), "c": round(C, 4), "h": round(H, 2)},
                    "pixels": int(sel.sum()), "per_input_pixels": {files[j].replace("\\", "/").split("/")[-1]: int(by[j]) for j in range(len(files))}})
    res.sort(key=lambda r: -r["share_pct"])
    json.dump({"k": k, "inputs": [f.replace("\\", "/").split("/")[-1] for f in files], "opaque_pixels": int(len(rgb)), "clusters": res, "roles": measure_roles(x, owner, files, xy)}, open(out, "w"), indent=1)
    for r in res: print(r["hex"], r["share_pct"], r["oklch"])

main()
