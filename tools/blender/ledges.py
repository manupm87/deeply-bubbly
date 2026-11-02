"""Ledges (`Ceiling`) and side walls (`Wall`): the solid rectangles of the world.

A ledge is 10 px tall with a flat underside, because the underside is the face Bur rests against
(GDD 2.3). Materials differ only above it, so each reads by the shape of its top edge:
rock = angular steps, coral = branches, foam = round puffs, kelp = thin blades.

Each set comes as short/medium/long ready pieces plus a three-slice form for any other width:
    W = capW + n * midW + capW,   n = max(1, round((W - 2 * capW) / midW)),   mid scale x = (W - 2 * capW) / (n * midW)
The mid piece's two end rings are identical by construction, so slices join without a crack at any
scale. The same formula tiles walls along y.
"""
from kit import Asset, Mesh, Z1, Z2, lit, mix, seeded

LEDGE_H = 10          # core: level/content/builders.ts LEDGE_H
LEDGE_DEPTH = 16
SHORT, MEDIUM, LONG = 40, 60, 120
CAP_W, MID_W = 10, 20

WALL_W = 44           # the only wall width core uses (level/content/ladder.ts)
WALL_DEPTH = 28
WALL_CAP_H, WALL_MID_H = 15, 30

BOTTOM = -LEDGE_H / 2.0
TOP = LEDGE_H / 2.0

# Height of the solid body per material. What rises above it is that material's silhouette.
BODY_TOP = {"rock": TOP, "coral": 0.8, "foam": 1.2, "kelp": -1.6}

# Cross-section as (depth fraction, height fraction of the body), from the front-bottom edge round to the back.
SECTION = [(-0.68, 0.0), (-1.0, 0.33), (-0.82, 0.78), (-0.32, 1.0), (0.32, 1.0), (0.82, 0.78), (1.0, 0.33), (0.68, 0.0)]


def _ring(x, body_top, half_depth, y_scale=1.0, jitter=0.0, rng=None):
    ring = []
    for fy, fz in SECTION:
        y = fy * half_depth * y_scale
        z = BOTTOM + (body_top - BOTTOM) * fz
        if jitter and 0.0 < fz:
            y += rng.uniform(-jitter, jitter)
        ring.append((x, y, z))
    return ring


def _ledge_rings(mat, x0, x1, cap_l, cap_r, rng):
    """Rings left to right. Seam rings are canonical; only rings strictly inside may vary."""
    body = BODY_TOP[mat]
    half = LEDGE_DEPTH / 2.0
    span = x1 - x0
    steps = max(2, round(span / (5.5 if mat == "rock" else 7.0)))
    rings = []
    for i in range(steps + 1):
        x = x0 + span * i / steps
        at_left, at_right = i == 0, i == steps
        if at_left and cap_l:
            rings.append(_ring(x, BOTTOM + (body - BOTTOM) * 0.42, half, 0.42))
        elif at_right and cap_r:
            rings.append(_ring(x, BOTTOM + (body - BOTTOM) * 0.42, half, 0.42))
        elif at_left or at_right:
            rings.append(_ring(x, body, half))
        else:
            # The middle ring always reaches the top, so a capped piece fills its box however the dice fall.
            if i == steps // 2:
                dip = 1.0
            else:
                dip = rng.choice((0.6, 0.74, 0.86, 1.0)) if mat == "rock" else rng.uniform(0.88, 1.0)
            xjit = rng.uniform(-span / steps * 0.2, span / steps * 0.2)
            rings.append(_ring(x + xjit, BOTTOM + (body - BOTTOM) * dip, half, rng.uniform(0.86, 1.0), 0.7, rng))
    return rings


def _coral_top(m, x0, x1, pal, rng):
    color = mix(pal["coral"], (1.0, 1.0, 1.0), 0.06)
    tip = mix(pal["coral"], pal["foam"], 0.55)
    shade = lit(color, rng, top=tip, top_from=3.4)
    count = max(2, round((x1 - x0) / 7.5))
    for i in range(count):
        x = x0 + (x1 - x0) * (i + 0.5) / count + rng.uniform(-1.0, 1.0)
        y = rng.uniform(-4.0, 3.0)
        tall = TOP if i % 2 == 0 else rng.uniform(3.0, 4.2)
        lean = rng.uniform(-1.5, 1.5)
        m.tube([(x, y, 0.0), (x + lean * 0.5, y, (tall + 0.5) / 2.0), (x + lean, y, tall)], [1.3, 1.05, 0.8], shade, sides=4)
        fork = 1.9 if lean >= 0 else -1.9
        m.tube([(x + lean * 0.4, y, 1.5), (x + lean * 0.4 + fork, y, tall - 1.1)], [0.8, 0.55], shade, sides=4)


def _foam_top(m, x0, x1, pal, rng):
    white = mix(pal["foam"], (1.0, 1.0, 1.0), 0.45)
    shade = lit(white, rng, jitter=0.02, under=0.08)
    count = max(2, round((x1 - x0) / 7.0))
    for i in range(count):
        radius = rng.uniform(2.9, 3.8)
        x = x0 + radius + (x1 - x0 - 2 * radius) * (i + 0.5) / count
        z = TOP - radius if i % 2 == 0 else TOP - radius - rng.uniform(0.3, 1.0)
        m.ico((x, rng.uniform(-3.0, 3.0), z), radius, shade, subdiv=1, wobble=0.05, rng=rng)


def _kelp_top(m, x0, x1, pal, rng):
    count = max(3, round((x1 - x0) / 3.6))
    light = mix(pal["kelp"], pal["accent"], 0.22)
    shade = lit(pal["kelp"], rng, top=light, top_from=2.8)
    for i in range(count):
        x = x0 + (x1 - x0) * (i + 0.5) / count + rng.uniform(-0.5, 0.5)
        y = rng.uniform(-4.5, 4.0)
        tall = TOP if i % 3 == 0 else rng.uniform(1.8, 4.2)
        lean = rng.choice((-1.0, 1.0)) * rng.uniform(0.6, 1.5)
        outline = [(x - 0.9, -2.0), (x + 0.9, -2.0), (x + 0.75 + lean, (tall - 1) * 0.55), (x + lean * 1.6, tall),
                   (x - 0.75 + lean, (tall - 1) * 0.55)]
        m.prism(outline, y - 0.3, y + 0.3, shade, center=(x + lean * 0.5, (tall - 2.0) * 0.4))


def ledge_mesh(mat, pal, x0, x1, cap_l, cap_r, rng):
    m = Mesh()
    base = {"rock": pal["rock"], "coral": mix(pal["coral"], pal["rock"], 0.28),
            "foam": pal["foam"], "kelp": mix(pal["kelp"], pal["rock"], 0.35)}[mat]
    top_col = {"rock": pal["rockLight"], "coral": pal["coral"], "foam": pal["foam"], "kelp": pal["kelp"]}[mat]
    top_from = {"rock": 2.0, "coral": -1.0, "foam": -1.0, "kelp": -2.6}[mat]
    m.rings(_ledge_rings(mat, x0, x1, cap_l, cap_r, rng), lit(base, rng, top=top_col, top_from=top_from))
    body_tris = len(m.tris)
    inset = 1.5
    tx0, tx1 = x0 + (inset if cap_l else 0.8), x1 - (inset if cap_r else 0.8)
    if mat == "coral":
        _coral_top(m, tx0, tx1, pal, rng)
    elif mat == "foam":
        _foam_top(m, tx0, tx1, pal, rng)
    elif mat == "kelp":
        _kelp_top(m, tx0, tx1, pal, rng)
    # Whatever the decoration did, the box and the seam stay exact.
    half = LEDGE_DEPTH / 2.0

    def clamp(p, margin):
        return (min(max(p[0], x0 + margin), x1 - margin), min(max(p[1], -half), half), min(max(p[2], BOTTOM), TOP))

    # Decoration stops just short of the ends: a point of it on a seam plane would break the cap-mid match.
    m.tris = [(clamp(a, k), clamp(b, k), clamp(c, k), col, bone, lay)
              for k, (a, b, c, col, bone, lay) in ((0.0 if i < body_tris else 0.05, t) for i, t in enumerate(m.tris))]
    return m


def _ledge_asset(name, zone, mat, pal, w, cap_l, cap_r, role, tileset=None):
    rng = seeded(name)
    m = ledge_mesh(mat, pal, -w / 2.0, w / 2.0, cap_l, cap_r, rng)
    meta = {"material": mat, "role": role, "source": "core: LEDGE_H; widths used by content", "depth": LEDGE_DEPTH}
    if tileset:
        meta["tileset"] = tileset
    return Asset(name, "ledge", zone, w, LEDGE_H, m, **meta)


def ledge_assets():
    out = []
    for zone, pal, materials in ((1, Z1, ("rock", "coral", "foam", "kelp")), (2, Z2, ("rock", "coral", "kelp"))):
        for mat in materials:
            stem = f"ledge_z{zone}_{mat}"
            for label, w in (("short", SHORT), ("medium", MEDIUM), ("long", LONG)):
                out.append(_ledge_asset(f"{stem}_{label}", zone, mat, pal, w, True, True, label))
            out.append(_ledge_asset(f"{stem}_cap_l", zone, mat, pal, CAP_W, True, False, "cap_l", stem))
            out.append(_ledge_asset(f"{stem}_mid", zone, mat, pal, MID_W, False, False, "mid", stem))
            out.append(_ledge_asset(f"{stem}_cap_r", zone, mat, pal, CAP_W, False, True, "cap_r", stem))
    return out


# ---------------------------------------------------------------------------------------------
# Walls
# ---------------------------------------------------------------------------------------------

WALL_SECTION = [(-1.0, -0.62), (-0.62, -1.0), (0.62, -1.0), (1.0, -0.62), (1.0, 0.62), (0.62, 1.0), (-0.62, 1.0), (-1.0, 0.62)]


def _wall_ring(z, half_w, half_d, jitter=0.0, rng=None):
    ring = []
    for fx, fy in WALL_SECTION:
        jx = rng.uniform(0.0, jitter) if jitter else 0.0
        ring.append(((half_w - jx) * fx, half_d * fy, z))
    return ring


def wall_mesh(zone, pal, z0, z1, cap_bottom, cap_top, rng):
    m = Mesh()
    half_w, half_d = WALL_W / 2.0, WALL_DEPTH / 2.0
    steps = max(2, round((z1 - z0) / 8.0))
    rings = []
    for i in range(steps + 1):
        z = z0 + (z1 - z0) * i / steps
        if (i == 0 and cap_bottom) or (i == steps and cap_top):
            rings.append(_wall_ring(z, half_w * 0.5, half_d * 0.5))
        elif i in (0, steps):
            rings.append(_wall_ring(z, half_w, half_d))
        else:
            rings.append(_wall_ring(z, half_w, half_d, 3.5, rng))
    base = pal["rock"]
    shade = lit(base, rng, jitter=0.07, top=pal["rockLight"], top_from=1e9)
    strata = lit(pal["rockLight"], rng, jitter=0.05)

    def banded(center, normal):
        # Strata in bands: a wall reads as stone, and as rising, even without any light on it.
        return strata(center, normal) if int((center[2] + 300) // 7) % 3 == 0 else shade(center, normal)

    m.rings(rings, banded)
    if zone == 2:
        count = max(2, round((z1 - z0) / 11.0))
        coral = lit(pal["coral"], rng, top=mix(pal["coral"], pal["foam"], 0.4), top_from=1e9)
        for i in range(count):
            radius = rng.uniform(2.6, 4.2)
            z = z0 + radius + (z1 - z0 - 2 * radius) * (i + 0.5) / count
            x = rng.uniform(-half_w + radius + 2, half_w - radius - 2)
            m.ico((x, -half_d * 0.82, z), radius, coral, subdiv=1, wobble=0.1, rng=rng)
    return m


def wall_assets():
    out = []
    for zone, pal, label in ((1, Z1, "rock"), (2, Z2, "reef")):
        stem = f"wall_z{zone}_{label}"
        pieces = (("cap_top", WALL_CAP_H, False, True), ("mid", WALL_MID_H, False, False), ("cap_bottom", WALL_CAP_H, True, False))
        for role, h, cap_bottom, cap_top in pieces:
            name = f"{stem}_{role}"
            m = wall_mesh(zone, pal, -h / 2.0, h / 2.0, cap_bottom, cap_top, seeded(name))
            out.append(Asset(name, "wall", zone, WALL_W, h, m, material=label, role=role, tileset=stem,
                             source="core: walls are 44 px wide at any height", depth=WALL_DEPTH))
    return out


TILESETS_DOC = {
    "ledge": {"axis": "x", "capW": CAP_W, "midW": MID_W, "pieces": ["cap_l", "mid", "cap_r"]},
    "wall": {"axis": "y", "capH": WALL_CAP_H, "midH": WALL_MID_H, "pieces": ["cap_top", "mid", "cap_bottom"]},
}
