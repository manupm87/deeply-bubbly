"""Reads the shipped WebPs and the manifest back, and only those, and writes the review images and seam numbers.

    python tools/backgrounds/review.py RAW_DIR

parallax_z1.png, parallax_z2.png   phone portrait composites, background alone next to one with real GLB plates
parallax_seams_z1.png, _z2.png     per layer: the tile against itself; plus two camera offsets with wrap lines in view
Seam metric: mean absolute step across the wrap, compared with the same step measured between neighbouring rows or
columns everywhere else in the layer. A true seam would make the first far larger than the second.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

REPO = Path(__file__).resolve().parents[2]
BG = REPO / "apps" / "web3d" / "public" / "backgrounds"
OUT = REPO / "docs" / "art" / "review"
SCALE = 4
VIEW = (180, 390)
MAN = json.loads((BG / "manifest.json").read_text(encoding="utf-8"))


def load(layer):
    return np.asarray(Image.open(BG / layer["file"]).convert("RGBA")).astype(np.float32) / 255.0


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def sample(tex, layer, cam, view=VIEW, scale=SCALE, zone_top=0):
    tw, th = layer["tileDesignPx"]["w"], layer["tileDesignPx"]["h"]
    px, py = layer["parallax"]["x"], layer["parallax"]["y"]
    h, w = tex.shape[:2]
    vx = (np.arange(view[0] * scale) + 0.5) / scale
    vy = (np.arange(view[1] * scale) + 0.5) / scale
    lx = vx + cam[0] * px
    if layer["anchor"] == "viewTop":
        ly = vy / view[1] * th
    else:
        ly = vy + (cam[1] - zone_top) * py
    fu = lx / tw * w - 0.5
    fv = ly / th * h - 0.5
    x0 = np.floor(fu).astype(int)
    y0 = np.floor(fv).astype(int)
    ax = (fu - x0)[None, :, None]
    ay = (fv - y0)[:, None, None]
    if layer["tiling"]["y"] == "repeat":
        yi, yj = y0 % h, (y0 + 1) % h
    else:
        yi, yj = np.clip(y0, 0, h - 1), np.clip(y0 + 1, 0, h - 1)
    xi, xj = x0 % w, (x0 + 1) % w
    a = tex[np.ix_(yi, xi)] * (1 - ax) + tex[np.ix_(yi, xj)] * ax
    b = tex[np.ix_(yj, xi)] * (1 - ax) + tex[np.ix_(yj, xj)] * ax
    out = a * (1 - ay) + b * ay
    if "fadeIn" in layer:
        out[..., 3] *= smooth(layer["fadeIn"]["fromLayerY"], layer["fadeIn"]["toLayerY"], ly)[:, None]
    return out


def compose(zone, cam, plate=None, view=VIEW, scale=SCALE, extra=None):
    layers = [l for l in MAN["layers"] if l["zone"] == zone]
    top = MAN["zones"][str(zone)]["worldY"][0]
    out = None
    for l in layers:
        s = sample(load(l), l, cam, view, scale, top)
        if out is None:
            out = s[..., :3].copy()
        elif l["blend"] == "additive":
            out = np.clip(out + s[..., :3] * s[..., 3:], 0, 1)
        else:
            out = out * (1 - s[..., 3:]) + s[..., :3] * s[..., 3:]
    if plate is not None:
        out = out * (1 - plate[..., 3:]) + plate[..., :3] * plate[..., 3:]
    return out


def seam_numbers(layer, tex):
    a = tex[..., 3:] if layer["alpha"] else 1
    t = tex[..., :3] * a if layer["alpha"] else tex[..., :3]
    # Premultiplied so colour bled under transparency is not counted.
    res = {}
    dx = np.abs(t - np.roll(t, 1, axis=1)).mean((0, 2))
    res["x"] = (float(dx[0]), float(np.delete(dx, 0).mean()), float(np.delete(dx, 0).max()))
    if layer["tiling"]["y"] == "repeat":
        dy = np.abs(t - np.roll(t, 1, axis=0)).mean((1, 2))
        res["y"] = (float(dy[0]), float(np.delete(dy, 0).mean()), float(np.delete(dy, 0).max()))
    return res


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def panel_row(images, gap=24, bg=(24, 28, 34)):
    w = sum(i.width for i in images) + gap * (len(images) + 1)
    h = max(i.height for i in images) + gap * 2
    out = Image.new("RGB", (w, h), bg)
    x = gap
    for i in images:
        out.paste(i, (x, gap))
        x += i.width + gap
    return out


def seam_sheet(zone):
    layers = [l for l in MAN["layers"] if l["zone"] == zone]
    top = MAN["zones"][str(zone)]["worldY"][0]
    tiles = []
    for l in layers:
        tex = load(l)
        tw, th = tex.shape[1], tex.shape[0]
        # Tile against itself, cut so that the wrap lines sit in the middle of the crop, over a test colour.
        crop = 700
        rolled = np.roll(np.roll(tex, tw // 2, 1), th // 2 if l["tiling"]["y"] == "repeat" else 0, 0)
        cy = th // 2 if l["tiling"]["y"] == "repeat" else crop // 2
        c = rolled[max(0, cy - crop // 2):cy + crop // 2, tw // 2 - crop // 2:tw // 2 + crop // 2]
        back = np.array((0.75, 0.2, 0.75))
        if l["blend"] == "additive":
            back = np.array((0.05, 0.15, 0.2))
            img = np.clip(back + c[..., :3] * c[..., 3:], 0, 1)
        else:
            img = back * (1 - c[..., 3:]) + c[..., :3] * c[..., 3:]
        i = to_img(img)
        dr = ImageDraw.Draw(i)
        m = c.shape[1] // 2
        dr.line((m, 0, m, 14), fill=(255, 255, 0), width=3)
        dr.line((m, c.shape[0] - 14, m, c.shape[0]), fill=(255, 255, 0), width=3)
        if l["tiling"]["y"] == "repeat":
            my = c.shape[0] // 2
            dr.line((0, my, 14, my), fill=(255, 255, 0), width=3)
            dr.line((c.shape[1] - 14, my, c.shape[1], my), fill=(255, 255, 0), width=3)
        tiles.append(i.resize((400, 400), Image.LANCZOS))
    row1 = panel_row(tiles)
    # Two camera offsets chosen so that the near and mid wrap lines cross the view; ticks mark every wrap.
    frames = []
    for cam in wrap_cams(layers, top):
        frame = to_img(compose(zone, cam))
        dr = ImageDraw.Draw(frame)
        colours = {"far": (255, 255, 0), "mid": (255, 150, 0), "near": (255, 60, 60)}
        for l in layers:
            if l["role"] not in colours:
                continue
            tw, th = l["tileDesignPx"]["w"], l["tileDesignPx"]["h"]
            for k in range(-3, 40):
                xx = (k * tw - cam[0] * l["parallax"]["x"]) * SCALE
                yy = (k * th - (cam[1] - top) * l["parallax"]["y"]) * SCALE
                if 0 <= xx < frame.width:
                    dr.line((xx, 0, xx, 22), fill=colours[l["role"]], width=4)
                if 0 <= yy < frame.height:
                    dr.line((0, yy, 22, yy), fill=colours[l["role"]], width=4)
        frames.append(frame)
    row2 = panel_row(frames)
    out = Image.new("RGB", (max(row1.width, row2.width), row1.height + row2.height), (24, 28, 34))
    out.paste(row1, (0, 0))
    out.paste(row2, (0, row1.height))
    return out


def wrap_cams(layers, top):
    near = next(l for l in layers if l["role"] == "near")
    mid = next(l for l in layers if l["role"] == "mid")
    far = next(l for l in layers if l["role"] == "far")
    cams = []
    for l in (near, mid, far):
        # Puts this layer's x wrap at 90 px and its y wrap at 195 px, the middle of the view.
        cx = (l["tileDesignPx"]["w"] - 90) / l["parallax"]["x"]
        cy = top + (l["tileDesignPx"]["h"] - 195) / l["parallax"]["y"]
        cams.append((cx, cy))
    return cams[:3]


def lab(a):
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def contrast(zone, cam, plate):
    """Delta E (CIE76) between each asset's own pixels and a ring of background around it, against the background's
    own contrast at the same distance. Pillar 5 wants the first clearly above the second."""
    from config import LAYOUTS
    bg = lab(compose(zone, cam))
    full = lab(plate[..., :3])
    mask = plate[..., 3] > 0.9
    ring_w = 6 * SCALE
    internal = np.linalg.norm(bg[ring_w:] - bg[:-ring_w], axis=-1)
    rows = []
    for name, x, y in LAYOUTS[f"z{zone}"]:
        x0, x1 = max(0, int((x - 45) * SCALE)), int((x + 45) * SCALE)
        y0, y1 = max(0, int((y - 30) * SCALE)), int((y + 30) * SCALE)
        m = mask[y0:y1, x0:x1]
        if m.sum() < 50:
            continue
        pad = Image.fromarray((plate[y0:y1, x0:x1, 3] > 0.05).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(ring_w | 1))
        ring = (np.asarray(pad) > 0) & (plate[y0:y1, x0:x1, 3] < 0.02)
        if ring.sum() < 50:
            continue
        de = np.linalg.norm(np.median(full[y0:y1, x0:x1][m], axis=0) - np.median(bg[y0:y1, x0:x1][ring], axis=0))
        rows.append((name, float(de)))
    return rows, float(np.median(internal)), float(np.percentile(internal, 95))


def main():
    raw = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    shots = {1: ((180, 0, "top"), (40, 900, "mid"), (330, 2500, "deep")), 2: ((180, 2960, "top"), (40, 4500, "mid"), (330, 6600, "deep"))}
    for zone, cams in shots.items():
        plate = np.asarray(Image.open(raw / f"plate_z{zone}.png").convert("RGBA")).astype(np.float32) / 255.0
        frames = []
        for i, (cx, cy, _) in enumerate(cams):
            frames.append(to_img(compose(zone, (cx, cy), plate if i != 0 or zone == 2 else None)))
        frames.insert(1, to_img(compose(zone, (cams[1][0], cams[1][1]))))
        panel_row(frames).save(OUT / f"parallax_z{zone}.png")
        seam_sheet(zone).save(OUT / f"parallax_seams_z{zone}.png")
    print(f"{'layer':12} {'axis':4} {'wrap step':>10} {'mean elsewhere':>15} {'max elsewhere':>14} verdict")
    bad = 0
    for l in MAN["layers"]:
        for axis, (seam, mean, mx) in seam_numbers(l, load(l)).items():
            ok = seam <= max(mx, 1.0 / 255)  # one 8-bit step is the floor of what a seam can be
            bad += not ok
            print(f"{l['id']:12} {axis:4} {seam:10.5f} {mean:15.5f} {mx:14.5f} {'ok' if ok else 'SEAM'}")
    for zone, cams in shots.items():
        plate = np.asarray(Image.open(raw / f"plate_z{zone}.png").convert("RGBA")).astype(np.float32) / 255.0
        for cx, cy, tag in cams:
            rows, med, p95 = contrast(zone, (cx, cy), plate)
            low = min(rows, key=lambda r: r[1])
            print(f"contrast z{zone} {tag:5} asset dE median {np.median([r[1] for r in rows]):5.1f}, lowest {low[1]:5.1f} ({low[0]}); background own dE median {med:4.1f}, p95 {p95:4.1f}")
    print(f"total {sum((BG / l['file']).stat().st_size for l in MAN['layers']) / 1048576:.2f} MB, seam failures {bad}")


main()
