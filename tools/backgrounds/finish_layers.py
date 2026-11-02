"""Turns the Blender renders into shipping WebP layers, paints water and rays, writes the manifest.

    python tools/backgrounds/finish_layers.py RAW_DIR

Needs Pillow and numpy. Deterministic given the config.
"""
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import OVERSCAN_PX, RAY_LAYERS, REEF_LAYERS, WATER_LAYERS, Z1, Z2, ZONES, hx  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "apps" / "web3d" / "public" / "backgrounds"
QUALITY = {"far": 90, "mid": 92, "near": 92}
SS = 3


def periodic_close(raw, m):
    """`raw` is the period plus an overscan margin m per side. The margin re-renders the opposite edge, so blending
    across it removes the only non-periodic thing left, the path tracer's sampling noise."""
    a = raw.astype(np.float32)
    h, w = a.shape[:2]
    H, W = h - 2 * m, w - 2 * m
    out = a[m:m + H, m:m + W].copy()
    r = (np.arange(m, dtype=np.float32) + 0.5) / m
    wx = r[None, :, None]
    out[:, :m] = out[:, :m] * wx + a[m:m + H, m + W:m + W + m] * (1 - wx)
    wy = r[:, None, None]
    out[:m, :] = out[:m, :] * wy + a[m + H:m + H + m, m:m + W] * (1 - wy)
    return out


def bleed(rgb, alpha):
    """Spreads colour under the transparent pixels so filtering and mip maps cannot fringe."""
    H, W = alpha.shape
    known = alpha > 0.02
    result = rgb.copy()
    c = rgb * known[..., None]
    w = known.astype(np.float32)
    level = 1
    while not known.all() and min(c.shape[:2]) > 1:
        h2, w2 = c.shape[0] // 2 * 2, c.shape[1] // 2 * 2
        c = c[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2, 3).mean((1, 3))
        w = w[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2).mean((1, 3))
        level *= 2
        col = c / np.maximum(w[..., None], 1e-4)
        up = np.repeat(np.repeat(col, level, 0), level, 1)[:H, :W]
        up_w = np.repeat(np.repeat(w, level, 0), level, 1)[:H, :W]
        fill = ~known & (up_w > 0)
        fill[up.shape[0]:] = False
        result[fill] = up[fill]
        known = known | fill
    return result


def blur_periodic(rgb, alpha, sigma):
    """Gaussian blur that wraps around the tile, on premultiplied colour so the transparent side cannot fringe."""
    h, w = alpha.shape
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.rfftfreq(w)[None, :]
    kernel = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))

    def conv(a):
        return np.fft.irfft2(np.fft.rfft2(a) * kernel, s=(h, w))

    soft = np.clip(conv(alpha), 0, 1).astype(np.float32)
    colour = np.dstack([conv(rgb[..., i] * alpha) for i in range(3)]).astype(np.float32)
    return np.clip(colour / np.maximum(soft[..., None], 1e-3), 0, 1), soft


def finish_reef(name, cfg, raw_dir):
    im = np.asarray(Image.open(raw_dir / f"{name}.png").convert("RGBA"))
    tile = periodic_close(im, OVERSCAN_PX) / 255.0
    rgb, alpha = tile[..., :3], tile[..., 3]
    post = cfg["post"]
    rgb = rgb * (1 - post["mix"]) + np.array(hx(post["haze"]), np.float32) * post["mix"]
    rgb = np.clip(rgb * post["gain"], 0, 1)
    rgb, alpha = blur_periodic(rgb, alpha, post["blur"] * cfg["size"][0] / cfg["tile"][0])
    rgb = bleed(rgb, alpha)
    out = np.dstack([rgb, alpha])
    img = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
    role = name.split("_")[1]
    path = OUT / f"{name}.webp"
    img.save(path, "WEBP", quality=QUALITY[role], alpha_quality=100, method=6, exact=True)
    return path


def water_colour(zone, x, y, W, H, rng):
    pal = Z1 if zone == 1 else Z2
    top, bottom = np.array(hx(pal["waterTop"])), np.array(hx(pal["waterBottom"]))
    t = min(1.0, max(0.0, y / (H * 0.92))) ** 0.85
    col = top + (bottom - top) * t
    if zone == 1:
        # The light of the surface, not a sun: a wide, faint warm bloom that sinks into a pale band across the tile.
        d = min(abs(x - 118), W - abs(x - 118))
        r = math.hypot(d * 0.55, (y + 20) * 0.9) / 210.0
        glow = max(0.0, 1 - r) ** 2.4
        col = col + (np.array(hx(0xf4f0b4)) - col) * glow * 0.3
        d2 = max(0.0, 1 - y / 300.0)
        col = col + (np.array(hx(0xa6ece4)) - col) * d2 * d2 * 0.34
    else:
        # dusk light from above and a low coral glow, the zone's accent
        d2 = max(0.0, 1 - y / 240.0)
        col = col + (np.array(hx(0x3fb1b8)) - col) * d2 * d2 * 0.32
        d = min(abs(x - 225), W - abs(x - 225))
        r = math.hypot(d * 0.7, (y - 320) * 0.9) / 215.0
        col = col + (np.array(hx(0xff8c5a)) - col) * max(0.0, 1 - r) ** 2 * 0.07
    return np.clip(col + rng.uniform(-0.009, 0.009), 0, 1)


def paint_water(name, cfg):
    W, H = cfg["tile"]
    px, py = cfg["size"]
    k = px / W * SS
    rng = random.Random(cfg["seed"])
    cols, rows = 16, 34
    jx = [[(rng.uniform(-0.34, 0.34), rng.uniform(-0.34, 0.34)) for _ in range(cols)] for _ in range(rows + 3)]

    def vert(i, j):
        a, b = jx[max(0, min(rows + 2, j + 1))][i % cols]
        return ((i + a) * W / cols, (j + b) * H / rows)

    img = Image.new("RGB", (px * SS, py * SS))
    dr = ImageDraw.Draw(img)

    def poly(pts, col):
        for dx in (-W, 0, W):
            dr.polygon([((p[0] + dx) * k, p[1] * k) for p in pts], fill=tuple(int(c * 255 + 0.5) for c in col))

    for j in range(-1, rows + 1):
        for i in range(cols):
            a, b, c, d = vert(i, j), vert(i + 1, j), vert(i, j + 1), vert(i + 1, j + 1)
            tris = [(a, b, d), (a, d, c)] if (i + j) % 2 else [(a, b, c), (b, d, c)]
            for tri in tris:
                cx, cy = sum(p[0] for p in tri) / 3, sum(p[1] for p in tri) / 3
                poly(tri, water_colour(cfg["zone"], cx % W, cy, W, H, rng))
    if cfg["zone"] == 1:
        paint_surface(poly, W, rng)
    out = img.resize((px, py), Image.BOX)
    path = OUT / f"{name}.webp"
    out.save(path, "WEBP", quality=94, method=6)
    return path


def paint_surface(poly, W, rng):
    """The sea's surface seen from below: faceted swells at the top edge, same language as bd_z1_surface_wave."""
    bands = [(30, 7.0, 0x63d4d9, 15), (20, 6.0, 0x7fe0df, 12), (11, 4.0, 0x9eeae6, 9)]
    for base, amp, colour, step in bands:
        n = round(W / (step * 2)) * 2
        pts = []
        for i in range(n):
            x = i * W / n
            y = base + (amp if i % 2 else -amp * 0.5) * rng.uniform(0.55, 1.15) + 3 * math.sin(math.tau * 3 * i / n)
            pts.append((x, y))
        c = np.array(hx(colour))
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            bx = b[0] if i + 1 < n else W
            shade = rng.uniform(-0.06, 0.06)
            poly([(a[0], -2), (bx, -2), (bx, b[1]), (a[0], a[1])], np.clip(c + shade, 0, 1))
            # a darker facet below each crest gives the swell its volume
            poly([(a[0], a[1]), (bx, b[1]), ((a[0] + bx) / 2, max(a[1], b[1]) + amp * 0.9)], np.clip(c * 0.93 + shade, 0, 1))


def paint_rays(name, cfg):
    W, H = cfg["tile"]
    px, py = cfg["size"]
    xs = (np.arange(px) + 0.5) / px * W
    ys = (np.arange(py) + 0.5) / py * H
    gx, gy = np.meshgrid(xs, ys)
    alpha = np.zeros_like(gx)
    rng = random.Random(cfg["seed"])
    for x0, half in cfg["beams"]:
        # An exact shear keeps the x wrap perfect; each beam has its own reach and strength.
        u = (gx + gy * cfg["slant"] - x0 + W / 2) % W - W / 2
        edge = np.clip((half - np.abs(u)) / (half * 0.42), 0, 1)
        edge = edge * edge * (3 - 2 * edge)
        reach = H * cfg["reach"] * rng.uniform(0.72, 1.0)
        fall = np.clip(1 - gy / reach, 0, 1) ** 1.25
        alpha = 1 - (1 - alpha) * (1 - edge * fall * rng.uniform(0.6, 1.0))
    alpha *= cfg["peak"]
    a = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
    col = tuple(int(c * 255) for c in hx(cfg["colour"]))
    rgb = np.dstack([np.full_like(a, col[0]), np.full_like(a, col[1]), np.full_like(a, col[2])])
    path = OUT / f"{name}.webp"
    Image.fromarray(np.dstack([rgb, a]), "RGBA").save(path, "WEBP", quality=80, alpha_quality=90, method=6, exact=True)
    return path


def entry(name, cfg, role, order, path):
    W, H = cfg["tile"]
    px, py = cfg["size"]
    return dict(id=name, file=path.name, zone=cfg["zone"], role=role, order=order, sizePx=dict(w=px, h=py),
                tileDesignPx=dict(w=W, h=H), parallax=dict(x=cfg["parallax"][0], y=cfg["parallax"][1]),
                tiling=dict(x="repeat", y="repeat"), blend="normal", opacity=1.0, alpha=True, anchor="zoneTop", bytes=path.stat().st_size)


def main():
    raw = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    layers = []
    for name, cfg in WATER_LAYERS.items():
        path = paint_water(name, cfg)
        e = entry(name, cfg, "water", 0, path)
        e.update(alpha=False, tiling=dict(x="repeat", y="clamp"))
        if cfg["zone"] == 1:
            e["animation"] = dict(kind="surfaceWobble", maskTopDesignPx=45, amplitudeDesignPx=1.2, waveNumberPerDesignPx=0.05, radPerS=1.2,
                                  note="Optional: offset v by sin(layerX * waveNumber + t * radPerS) * amplitude, masked to the wave band at the top of the texture.")
        layers.append(e)
    for name, cfg in REEF_LAYERS.items():
        path = finish_reef(name, cfg, raw)
        role = name.split("_")[1]
        e = entry(name, cfg, role, {"far": 1, "mid": 2, "near": 3}[role], path)
        if cfg.get("fade"):
            e["fadeIn"] = dict(fromLayerY=cfg["fade"][0], toLayerY=cfg["fade"][1], note="alpha *= smoothstep(from, to, layerY), so the reef never crosses the sea surface")
        layers.append(e)
    for name, cfg in RAY_LAYERS.items():
        path = paint_rays(name, cfg)
        e = entry(name, cfg, "rays", 4, path)
        e.update(blend="additive", tiling=dict(x="repeat", y="clamp"), anchor="viewTop", fit="stretch the texture's height to the view height; layerY is unused")
        strong = cfg["zone"] == 1
        e["animation"] = dict(kind="dualScrollPulse", note="Add two samples of the texture at half strength, each with its own scroll and the second with x scaled, then pulse opacity. Beams cross and breathe and never loop visibly.",
                              scrollDesignPxPerS=[3.0, -2.0] if strong else [1.6, -1.1], secondCopyScaleX=0.73, pulseOpacity=[0.75, 1.0], pulsePeriodS=7.0 if strong else 9.0)
        layers.append(e)
    layers.sort(key=lambda e: (e["zone"], e["order"]))
    total = sum(e["bytes"] for e in layers)
    manifest = dict(
        version=1, world=dict(widthDesignPx=540, viewWidthDesignPx=180, maxViewHeightDesignPx=420),
        sampling=("Draw in ascending `order`, all behind the play plane (Z = 0). A view pixel at (vx, vy) design px from the view's top-left samples "
                  "layerX = vx + camera.x * parallax.x and layerY = vy + (camera.y - zone.worldY[0]) * parallax.y, then u = layerX / tile.w, v = layerY / tile.h, "
                  "row 0 at the top. camera.x and camera.y are the view's top-left in design px."),
        textures=dict(colorSpace="srgb", premultipliedAlpha=False, generateMipmaps=True,
                      note="Transparent pixels hold bled colour: straight alpha, do not premultiply on load."),
        zones={str(z): dict(worldY=list(v["worldY"]), crossfadeDesignPx=240,
                            crossfadeNote="Fade the zone groups over this many design px centred on the boundary, inside a rest station. z1_water's bottom equals z2_water's top.")
               for z, v in ZONES.items()},
        totalBytes=total, layers=layers)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    for e in layers:
        print(f"{e['file']:22} {e['bytes'] / 1024:7.0f} KB")
    print(f"total {total / 1048576:.2f} MB")


main()
