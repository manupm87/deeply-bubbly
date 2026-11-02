"""Pickups, buoys, rest stations and the backdrop reef of each zone."""
import math

from creatures import _ribs, _shell_fan
from kit import Asset, Bone, Clip, INK, Mesh, WHITE, Z1, Z2, lit, mix, seeded, solid


# ---------------------------------------------------------------------------------------------
# Pickups: boxes are 2 * radius of core's airPocket / pearl / shell
# ---------------------------------------------------------------------------------------------

def aire():
    rng = seeded("pickup_aire")
    m = Mesh()
    bones = [Bone("root", (0, 0, 0))]
    m.bone = "root"
    m.layer = "glass"
    bubble = lit(mix(Z1["foam"], WHITE, 0.3), rng, jitter=0.02)
    # A cluster, so it can't be mistaken for Bur, who is the only single round bubble on screen.
    lobes = (((-1.6, 0, -1.2), 4.4), ((3.8, 0, 2.6), 2.2), ((-3.0, 0, 4.5), 1.5))
    for center, radius in lobes:
        m.ico(center, radius, bubble, subdiv=1)
    # A thin bright rim, as on Bur: without it the glass nearly vanishes against Zone 2's darker water.
    m.layer = "contour"
    for center, radius in lobes:
        m.ico(center, radius + 0.45, solid(WHITE), subdiv=1)
    m.invert_layer("contour")
    m.layer = "opaque"
    m.ico((-3.2, -3.6, 0.3), (1.0, 0.3, 0.7), solid(WHITE), subdiv=0)
    m.ico((3.1, -1.8, 3.3), (0.5, 0.2, 0.4), solid(WHITE), subdiv=0)
    m.fit(12, 12, bones)
    clips = [Clip("Bob", 1.0).wave("root", "tz", 0.6, 1).wave("root", "sx", 0.05, 1, base=0.95).wave("root", "sz", 0.05, 1, phase=0.5, base=0.95)]
    return Asset("pickup_aire", "pickup", 0, 12, 12, m, bones, clips, pickupType="aire", depth=9,
                 source="core: airPocket radius 6", zones=[1, 2])


def perla():
    rng = seeded("pickup_perla")
    m = Mesh()
    bones = [Bone("root", (0, 0, 0))]
    m.bone = "root"
    m.ico((0, 0, 0), 4, lit(mix(WHITE, Z1["accent"], 0.18), rng, jitter=0.02), subdiv=2)
    m.ico((-1.4, -3.4, 1.5), (0.9, 0.3, 0.7), solid(WHITE), subdiv=0)
    m.fit(8, 8, bones)
    clips = [Clip("Shine", 1.6).wave("root", "spin", 20, 1).wave("root", "tz", 0.4, 1)]
    return Asset("pickup_perla", "pickup", 0, 8, 8, m, bones, clips, pickupType="perla", depth=8,
                 source="core: pearl radius 4", zones=[1, 2])


def concha():
    rng = seeded("pickup_concha")
    m = Mesh()
    bones = [Bone("root", (0, 0, 0))]
    m.bone = "root"
    pale = mix(Z1["jelly"], Z1["foam"], 0.45)
    shade = _ribs(pale, mix(Z1["jelly"], Z1["coral"], 0.3), 0, -5, rng)
    _shell_fan(m, 0, -5, 10, 22, 158, -1.2, 1.2, shade, ribs=6, notch=0.95)
    # The hinge ears are what make it a scallop rather than a fan.
    m.prism([(-4.2, -5), (4.2, -5), (3.4, -2.4), (-3.4, -2.4)], -1.5, 1.5, lit(mix(Z1["jelly"], Z1["rock"], 0.3), rng), center=(0, -3.8))
    m.fit(10, 10, bones)
    clips = [Clip("Bob", 1.8).wave("root", "rot", 8, 1).wave("root", "tz", 0.4, 1, phase=0.25)]
    return Asset("pickup_concha", "pickup", 0, 10, 10, m, bones, clips, pickupType="concha", depth=3,
                 source="core: shell radius 5", zones=[1, 2])


# ---------------------------------------------------------------------------------------------
# Buoy: a bubble anchored by a line (3.1)
# ---------------------------------------------------------------------------------------------

def boya(zone, pal):
    name = f"boya_z{zone}"
    rng = seeded(name)
    m = Mesh()
    bones = [Bone("root", (0, 0, -14)), Bone("bubble", (0, 0, 2), "root")]
    m.bone = "root"
    m.lathe((0, 0, -14), [(5.5, 0), (4.5, 1.8), (2.0, 3.2)], lit(pal["rockLight"], rng), sides=6)
    m.tube([(0, 0, -11), (0.7, 0, -6), (0, 0, -1)], 0.45, solid(mix(pal["foam"], pal["rock"], 0.3)), sides=3)
    m.bone = "bubble"
    m.lathe((0, 0, -0.8), [(2.0, -0.7), (2.6, 0.7)], lit(pal["accent"], rng), sides=6)
    m.layer = "glass"
    m.ico((0, 0, 7), 7.5, lit(mix(pal["foam"], pal["accent"], 0.18), rng, jitter=0.02), subdiv=2)
    m.layer = "opaque"
    m.ico((0, 0, 7), 2.5, lit(pal["accent"], rng, jitter=0.02), subdiv=1)
    m.ico((-3.2, -6.0, 9.5), (1.3, 0.3, 0.9), solid(WHITE), subdiv=0)
    m.fit(16, 28, bones)
    clips = [
        Clip("Bob", 3.0).wave("bubble", "tx", 0.6, 1).wave("bubble", "tz", 0.5, 2),
        # 200 ms flash when Bur crosses (3.1); the shell adds the light.
        Clip("Ping", 0.2, False).keys("bubble", "sx", [(0, 1), (0.4, 0.9), (1, 1)]).keys("bubble", "sz", [(0, 1), (0.4, 0.9), (1, 1)]),
    ]
    return Asset(name, "buoy", zone, 16, 28, m, bones, clips, depth=15,
                 source="design: core's Boya only has a worldY; centre it on that line")


# ---------------------------------------------------------------------------------------------
# Rest stations: the set piece that marks a station band; ledges and walls come from the chunk
# ---------------------------------------------------------------------------------------------

def _branch(m, x, y, z, height, spread, radius, shade, rng, depth=2):
    top = (x + spread, y, z + height)
    m.tube([(x, y, z), (x + spread * 0.3, y, z + height * 0.55), top], [radius, radius * 0.8, radius * 0.55], shade, sides=5)
    if depth > 0:
        for sign in (-1, 1):
            start = (x + spread * 0.3, y, z + height * 0.55)
            _branch(m, start[0], y + sign * 0.6, start[2], height * 0.55, spread * 0.3 + sign * height * 0.32,
                    radius * 0.62, shade, rng, depth - 1)


def station_z1():
    name = "station_z1"
    rng = seeded(name)
    p = Z1
    m = Mesh()
    bones = [Bone("root", (0, 0, -28))]
    for i in range(4):
        bones.append(Bone(f"tuft{i}", (-44 + 29 * i, 0, -22), "root"))
    m.bone = "root"
    # The coral bench of 3.3: one wide flat table, unlike anything else in the zone.
    rock = lit(p["rock"], rng, jitter=0.06, top=p["rockLight"], top_from=-18)
    m.ico((0, 0, -24), (58, 14, 8), rock, subdiv=2, wobble=0.04, rng=rng)
    coral = lit(p["coral"], rng, top=mix(p["coral"], p["foam"], 0.5), top_from=4)
    _branch(m, -32, -2, -20, 26, -4, 3.2, coral, rng)
    _branch(m, 34, 0, -20, 34, 4, 3.6, coral, rng)
    m.ico((-4, -3, -14), (16, 8, 8), lit(p["accent"], rng, jitter=0.05), subdiv=1, wobble=0.06, rng=rng)
    shell = lit(mix(p["jelly"], p["foam"], 0.4), rng)
    _shell_fan(m, 12, -18, 8, 25, 155, -7, -5, shell, ribs=4)
    grass = lit(p["kelp"], rng, top=mix(p["kelp"], p["accent"], 0.3), top_from=-2)
    for i in range(4):
        m.bone = f"tuft{i}"
        x = -44 + 29 * i
        for k in range(3):
            lean = (k - 1) * 3.0
            base = x + (k - 1) * 2.5
            m.prism([(base - 1.3, -22), (base + 1.3, -22), (base + 1 + lean, -9), (base + lean * 1.5, 2 - k * 3), (base - 1 + lean, -9)],
                    -8.5, -7.9, grass, center=(base + lean * 0.4, -12))
    m.fit(120, 56, bones)
    sway = Clip("Breathe", 3.0)
    for i in range(4):
        sway.wave(f"tuft{i}", "rot", 7, 1, phase=i * 0.2)
    return Asset(name, "station", 1, 120, 56, m, bones, [sway], depth=28,
                 source="design: dressing for the 240 px station band; core's RestStation has no box")


def station_z2():
    name = "station_z2"
    rng = seeded(name)
    p = Z2
    m = Mesh()
    bones = [Bone("root", (0, 0, -28))]
    centers = [-44, -24, -4, 18, 40]
    for i in range(len(centers)):
        bones.append(Bone(f"crown{i}", (centers[i], 0, -14), "root"))
    m.bone = "root"
    m.ico((0, 0, -24), (58, 14, 8), lit(p["rock"], rng, jitter=0.06, top=p["rockLight"], top_from=-18), subdiv=2, wobble=0.04, rng=rng)
    # The anemone garden of 3.3: big soft crowns with rounded tips, friendly versions of the Z2 trap.
    colors = [p["jelly"], p["coral"], p["foam"], p["jelly"], p["coral"]]
    for i, cx in enumerate(centers):
        size = 1.0 + (i % 3) * 0.28
        stem = lit(mix(colors[i], p["rock"], 0.35), rng)
        arm = lit(colors[i], rng, top=mix(colors[i], WHITE, 0.45), top_from=-8 + 8 * size)
        m.bone = "root"
        m.lathe((cx, -3, -22), [(5.5 * size, 0), (4 * size, 8 * size)], stem, sides=7)
        m.bone = f"crown{i}"
        for k in range(7):
            side = -1 + 2 * k / 6.0
            y = -3 + (1.8 if k % 2 else -1.8)
            bx, tip_x = cx + side * 3.5 * size, cx + side * 11 * size
            bz = -22 + 8 * size
            tip_z = bz + (14 - abs(side) * 7) * size
            m.tube([(bx, y, bz), (cx + side * 8 * size, y, bz + 6 * size), (tip_x, y, tip_z)],
                   [1.6 * size, 1.3 * size, 1.0 * size], arm, sides=4)
            m.ico((tip_x, y, tip_z), 1.4 * size, arm, subdiv=0)
    m.fit(120, 56, bones)
    sway = Clip("Breathe", 3.0)
    for i in range(len(centers)):
        sway.wave(f"crown{i}", "rot", 5, 1, phase=i * 0.21)
    return Asset(name, "station", 2, 120, 56, m, bones, [sway], depth=28,
                 source="design: dressing for the 240 px station band; core's RestStation has no box")


# ---------------------------------------------------------------------------------------------
# Backdrop reef: no collision; the shell places them in front of or behind Z = 0
# ---------------------------------------------------------------------------------------------

def _backdrop(name, zone, w, h, m, layer, depth, bones=(), clips=(), **meta):
    m.fit(w, h, bones)
    return Asset(name, "backdrop", zone, w, h, m, bones, clips, layer=layer, depth=depth,
                 source="design: decoration, no collision", **meta)


def _mound(m, w, h, pal, rng, lumps=6):
    rock = lit(pal["rock"], rng, jitter=0.07, top=pal["rockLight"], top_from=-h * 0.05)
    m.ico((0, 0, -h * 0.28), (w * 0.5, 16, h * 0.42), rock, subdiv=2, wobble=0.07, rng=rng)
    for i in range(lumps):
        x = (-0.38 + 0.76 * i / (lumps - 1)) * w
        peak = (1.0 - abs(x) / (w * 0.55)) * h * 0.5
        m.ico((x, rng.uniform(-6, 6), -h * 0.2 + peak * 0.55), (w * 0.12, 8, peak * 0.62 + 2), rock, subdiv=1, wobble=0.12, rng=rng)


def _fan_coral(m, pal, color, height, rng):
    """A sea fan: an upright lattice, flat in depth, the one silhouette full of holes."""
    shade = lit(color, rng, jitter=0.04)
    _fan_lobe(m, shade, 0.0, -height / 2.0, height, 0.0, 66, rng)


def _fan_lobe(m, shade, bx, bz, reach, tilt, half_angle, rng):
    """Ribs from a foot out to an arc, crossed by rungs: a net, because a branching tree is what it must not be."""
    ribs, rungs = 9, 3
    grid = []
    for i in range(ribs):
        ang = math.radians(90 + tilt - half_angle + 2 * half_angle * i / (ribs - 1))
        length = reach * rng.uniform(0.9, 1.0)
        spoke = [(bx + math.cos(ang) * length * t, 0.0, bz + math.sin(ang) * length * t)
                 for t in (0.0, 0.36, 0.58, 0.8, 1.0)]
        m.tube(spoke, [2.0, 1.5, 1.2, 1.0, 0.8], shade, sides=3)
        grid.append(spoke)
    for ring in range(1, rungs + 1):
        for i in range(ribs - 1):
            m.tube([grid[i][ring + 0], grid[i + 1][ring + 0]], 0.8, shade, sides=3)


def _blades(m, x, shade, count, height, spread, rng, bone_fmt=None):
    for k in range(count):
        if bone_fmt:
            m.bone = bone_fmt.format(k)
        bx = x + (k - (count - 1) / 2.0) * spread
        lean = rng.uniform(-3, 3)
        tall = height * rng.uniform(0.72, 1.0)
        y = rng.uniform(-3, 3)
        m.prism([(bx - 1.6, 0), (bx + 1.6, 0), (bx + 1.4 + lean, tall * 0.55), (bx + lean * 2.0, tall), (bx - 1.4 + lean, tall * 0.55)],
                y - 0.3, y + 0.3, shade, center=(bx + lean * 0.5, tall * 0.25))


def backdrop_assets():
    out = []

    # Zone 1 -----------------------------------------------------------------------------------
    rng = seeded("bd_z1_rock_mound")
    m = Mesh()
    _mound(m, 110, 44, Z1, rng)
    out.append(_backdrop("bd_z1_rock_mound", 1, 110, 44, m, "back", 34))

    rng = seeded("bd_z1_coral_fan")
    m = Mesh()
    _fan_coral(m, Z1, Z1["coral"], 60, rng)
    out.append(_backdrop("bd_z1_coral_fan", 1, 44, 56, m, "back", 4))

    rng = seeded("bd_z1_coral_branch")
    m = Mesh()
    shade = lit(mix(Z1["accent"], Z1["coral"], 0.25), rng, top=mix(Z1["accent"], WHITE, 0.4), top_from=14)
    _branch(m, 0, 0, -25, 26, 0, 3.0, shade, rng, depth=3)
    _branch(m, -3, 2, -25, 18, -10, 2.2, shade, rng, depth=2)
    _branch(m, 3, -2, -25, 18, 10, 2.2, shade, rng, depth=2)
    m.lathe((0, 0, -25), [(9, 0), (5, 4)], lit(Z1["rock"], rng), sides=6)
    out.append(_backdrop("bd_z1_coral_branch", 1, 40, 50, m, "back", 14))

    rng = seeded("bd_z1_seagrass")
    m = Mesh()
    grass = lit(Z1["kelp"], rng, top=mix(Z1["kelp"], Z1["accent"], 0.3), top_from=32)
    bones = [Bone("root", (0, 0, 0))] + [Bone(f"blade{k}", (-14 + 7 * k, 0, 0), "root") for k in range(5)]
    m.bone = "root"
    m.lathe((0, 0, -3), [(19, 0), (14, 3.5)], lit(Z1["rockLight"], rng), sides=7, depth_scale=0.4)
    _blades(m, 0, grass, 5, 50, 7, rng, "blade{}")
    sway = Clip("Sway", 3.0)
    for k in range(5):
        sway.wave(f"blade{k}", "rot", 6, 1, phase=k * 0.17)
    out.append(_backdrop("bd_z1_seagrass", 1, 36, 48, m, "back", 14, bones, [sway]))

    # The bright edge of the water seen from below (3.2 "oleaje"); tiles along x, shared seam height.
    rng = seeded("bd_z1_surface_wave")
    m = Mesh()
    foam = lit(mix(Z1["foam"], WHITE, 0.4), rng, jitter=0.02)
    crest = [(-30.0, 0.0), (-20.0, 3.5), (-14.0, 1.0), (-4.0, 6.0), (6.0, 1.5), (16.0, 4.6), (24.0, 0.5), (30.0, 0.0)]
    outline = [(-30.0, -6.0)] + [(30.0, -6.0)] + list(reversed(crest))
    m.prism(outline, -2, 2, foam, center=(0.0, -3.0))
    out.append(_backdrop("bd_z1_surface_wave", 1, 60, 12, m, "front", 4, tiles="x", role="mid"))

    # Zone 2 -----------------------------------------------------------------------------------
    # The strong-parallax reef wall of 3.2; tiles along y with matching end rings.
    rng = seeded("bd_z2_reef_wall")
    m = Mesh()
    section = [(-45, -16), (-16, -24), (22, -24), (45, -14), (45, 14), (22, 22), (-16, 22), (-45, 14)]
    rings = []
    for i in range(7):
        z = -75 + 25 * i
        if i in (0, 6):
            rings.append([(x, y, z) for x, y in section])
        else:
            rings.append([(x * (1 - rng.uniform(0, 0.16)), y * rng.uniform(0.86, 1.0), z) for x, y in section])
    m.rings(rings, lit(Z2["rock"], rng, jitter=0.07, top=Z2["rockLight"], top_from=1e9), close_start=False, close_end=False)
    palette = (Z2["coral"], Z2["accent"], Z2["jelly"], Z2["kelp"])
    # Stratified, so the colour covers the whole wall instead of clumping where the dice fall.
    for row in range(6):
        for col in range(3):
            # Each cell is a colony of a few lumps of one colour, half sunk in the rock: evenly spaced
            # single lumps looked like the holds of a climbing wall.
            color = mix(palette[rng.randrange(len(palette))], Z2["rock"], rng.uniform(0.15, 0.45))
            x = -26 + col * 26 + rng.uniform(-11, 11)
            z = -60 + row * 24 + rng.uniform(-10, 10)
            for _lump in range(rng.randint(2, 4)):
                radius = rng.uniform(2.5, 7.5)
                m.ico((x + rng.uniform(-8, 8), -21, z + rng.uniform(-7, 7)), (radius, radius * 0.5, radius * 0.7),
                      lit(color, rng, jitter=0.05), subdiv=1, wobble=0.15, rng=rng)
    out.append(_backdrop("bd_z2_reef_wall", 2, 90, 150, m, "front", 46, tiles="y", role="mid"))

    rng = seeded("bd_z2_brain_coral")
    m = Mesh()
    def grooves(center, normal):
        band = int((center[0] + center[2] * 0.6 + 100) // 7) % 2
        return lit(Z2["coral"] if band else mix(Z2["coral"], Z2["rock"], 0.4), rng, jitter=0.03)(center, normal)
    m.ico((0, 0, 0), (28, 22, 20), grooves, subdiv=3)
    m.box((0, 0, -19), (40, 22, 4), lit(Z2["rock"], rng))
    out.append(_backdrop("bd_z2_brain_coral", 2, 56, 40, m, "back", 44))

    rng = seeded("bd_z2_tube_sponge")
    m = Mesh()
    body = lit(mix(Z2["accent"], Z2["jelly"], 0.45), rng, jitter=0.05)
    hole = solid(mix(Z2["accent"], INK, 0.7))
    for x, top, radius in ((-13, 30, 6.0), (0, 48, 7.5), (13, 22, 5.5)):
        m.lathe((x, 0, -26), [(radius * 0.7, 0), (radius, 8), (radius * 0.86, top * 0.6), (radius, top)], body, sides=7)
        m.lathe((x, 0, -26 + top - 0.1), [(radius * 0.72, 0), (radius * 0.72, 0.2)], hole, sides=7)
    out.append(_backdrop("bd_z2_tube_sponge", 2, 40, 56, m, "back", 16))

    rng = seeded("bd_z2_sea_fan")
    m = Mesh()
    # Two overlapping lobes on one foot, so it can't be confused with Zone 1's single fan.
    shade = lit(Z2["jelly"], rng, jitter=0.04)
    _fan_lobe(m, shade, 0.0, -35.0, 66, 26, 42, rng)
    _fan_lobe(m, shade, 0.0, -35.0, 54, -30, 40, rng)
    out.append(_backdrop("bd_z2_sea_fan", 2, 56, 64, m, "back", 4))

    rng = seeded("bd_z2_kelp_tall")
    m = Mesh()
    segments = 6
    bones = [Bone("seg0", (0, 0, -60))]
    for i in range(1, segments):
        bones.append(Bone(f"seg{i}", (0, 0, -60 + 20 * i), f"seg{i - 1}"))
    stalk = lit(mix(Z2["kelp"], Z2["rock"], 0.25), rng)
    leaf = lit(Z2["kelp"], rng, jitter=0.05)
    for i in range(segments):
        m.bone = f"seg{i}"
        z = -60 + 20 * i
        m.tube([(0, 0, z), (0, 0, z + 20)], [1.6, 1.3], stalk, sides=4, cap_start=i == 0, cap_end=i == segments - 1)
        for sign in (-1, 1):
            zz = z + (4 if sign < 0 else 13)
            m.prism([(0, zz), (sign * 7, zz + 3), (sign * 15, zz + 9), (sign * 6, zz + 7)], -0.3, 0.3, leaf, center=(sign * 5, zz + 4))
    sway = Clip("Sway", 4.0)
    for i in range(segments):
        sway.wave(f"seg{i}", "rot", 3 + i * 0.4, 1, phase=i * 0.09)
    out.append(_backdrop("bd_z2_kelp_tall", 2, 30, 120, m, "back", 6, bones, [sway]))

    rng = seeded("bd_z2_rock_arch")
    m = Mesh()
    shade = lit(Z2["rock"], rng, jitter=0.07, top=Z2["rockLight"], top_from=18)
    pts, radii = [], []
    for i in range(9):
        ang = math.pi * i / 8.0
        pts.append((-math.cos(ang) * 44, 0, -40 + math.sin(ang) * 66))
        radii.append(16 - math.sin(ang) * 6)
    m.tube(pts, radii, shade, sides=6)
    m.ico((-30, -13, 18), (7, 3, 5), lit(Z2["coral"], rng), subdiv=1, wobble=0.1, rng=rng)
    out.append(_backdrop("bd_z2_rock_arch", 2, 120, 80, m, "back", 32))

    return out


def prop_assets():
    return [aire(), perla(), concha(), boya(1, Z1), boya(2, Z2), station_z1(), station_z2()]
