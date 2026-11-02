"""Bur and the GDD section 5 catalogue used by Zones 1 and 2.

Each creature fits its collision box exactly (`Mesh.fit`): builders.ts sells "the silhouette a player
reads and the box the simulation tests are the same rectangle". Bind pose is the largest pose, so the
box is what is drawn at rest and clips only shrink or wobble within it. Faces +X where a facing exists;
the shell turns a creature around with a 180-degree rotation around Y.

No teeth and no blood anywhere (pillar 4).
"""
import math

from kit import Asset, Bone, Clip, INK, Mesh, WHITE, Z1, Z2, lit, mix, seeded, solid
from ledges import _ring, LEDGE_DEPTH, BOTTOM, TOP


def bur():
    rng = seeded("bur")
    m = Mesh()
    r = 7.0
    bones = [Bone("root", (0, 0, 0)), Bone("eyes", (0, -5, 1.2), "root"), Bone("glint", (-3, -5, 3.2), "root")]
    # Inverted hull: back faces only, so it draws just the rim outside the body. It is the 1 px contour of 2.6.
    m.layer = "contour"
    m.bone = "root"
    m.ico((0, 0, 0), r, solid(mix(Z1["foam"], WHITE, 0.5)), subdiv=2)
    m.invert_layer("contour")
    m.layer = "glass"
    m.ico((0, 0, 0), r * 0.9, lit(mix(Z1["waterTop"], Z1["foam"], 0.62), rng, jitter=0.03), subdiv=2)
    m.layer = "opaque"
    m.bone = "eyes"
    for sx in (-1, 1):
        m.ico((sx * 2.3, -5.6, 1.2), (1.05, 0.5, 1.5), solid(INK), subdiv=1)
    m.bone = "glint"
    m.ico((-3.0, -5.05, 3.25), (1.15, 0.3, 0.8), solid(WHITE), subdiv=1)
    m.fit(14, 14, bones)
    clips = [
        Clip("Idle", 2.0).wave("root", "sz", 0.03, 2, base=1.0).wave("root", "sx", 0.03, 2, phase=0.5, base=1.0)
        .wave("root", "tz", 0.25, 1),
        Clip("Blink", 0.25, False).keys("eyes", "sz", [(0, 1), (0.4, 0.1), (0.6, 0.1), (1, 1)]),
        # Launch: long along the travel axis (the shell aims her); Rest: flattened against a ceiling.
        Clip("Stretch", 0.3, False).keys("root", "sz", [(0, 1), (0.3, 1.28), (1, 1)]).keys("root", "sx", [(0, 1), (0.3, 0.82), (1, 1)]),
        Clip("Squash", 0.3, False).keys("root", "sz", [(0, 1), (0.3, 0.72), (0.7, 1.08), (1, 1)])
        .keys("root", "sx", [(0, 1), (0.3, 1.2), (0.7, 0.96), (1, 1)]),
        Clip("Hit", 0.4, False).keys("root", "tx", [(0, 0), (0.2, -1.2), (0.4, 1.0), (0.6, -0.6), (1, 0)])
        .keys("eyes", "sz", [(0, 1), (0.1, 0.25), (0.8, 0.25), (1, 1)]),
    ]
    return Asset("bur", "player", 0, 14, 14, m, bones, clips, catalogId=None, depth=14,
                 source="core: RADIUS_BASE = 7; scale the whole asset by bubble.radius / 7",
                 notes="Aura and the 8 px readability floor (2.6) are the shell's: they depend on the live radius.")


def medusa():
    rng = seeded("medusa")
    p = Z1
    m = Mesh()
    bones = [Bone("root", (0, 0, -3)), Bone("skirt", (0, 0, -3), "root")]
    m.bone = "root"
    m.layer = "glass"
    profile = [(19.5, -3.0), (19.0, -1.0), (15.5, 2.2), (8.5, 4.4), (0.001, 5.0)]
    m.lathe((0, 0, 0), profile, lit(p["jelly"], rng, jitter=0.03), sides=10, depth_scale=0.45)
    m.layer = "opaque"
    # The lantern inside the bell: what the "Farolillo" is named after, and it shows through the glass.
    m.ico((0, 0, 0.6), (6.5, 2.8, 2.6), lit(p["accent"], rng, jitter=0.02), subdiv=1)
    for x in (-13, -7, 7, 13):
        m.ico((x, -5.5, 0.2 - abs(x) * 0.08), 0.8, solid(p["foam"]), subdiv=0)
    m.bone = "skirt"
    for i in range(7):
        x = -16.5 + 5.5 * i
        # Round drops, not points: a row of points under a dome would read as teeth (pillar 4).
        m.ico((x, -1.0, -3.6), (1.9, 1.5, 1.4), lit(mix(p["jelly"], WHITE, 0.15), rng), subdiv=1)
    m.fit(40, 10, bones)
    clips = [
        Clip("Pulse", 1.6).wave("root", "sz", 0.1, 1, base=0.9).wave("root", "sx", 0.03, 1, phase=0.5, base=0.97)
        .wave("skirt", "sx", 0.06, 1, phase=0.25, base=0.94),
        Clip("Bounce", 0.45, False).keys("root", "sz", [(0, 1), (0.25, 0.42), (0.6, 1.0), (1, 1)])
        .keys("root", "sx", [(0, 1), (0.25, 1.0), (0.6, 0.94), (1, 1)]),
        # 600 ms, core BOUNCE_COOLDOWN_MS: Bur passes through a deflated medusa.
        Clip("Deflate", 0.6, False).keys("root", "sz", [(0, 1), (0.2, 0.3), (0.8, 0.3), (1, 1)])
        .keys("root", "sx", [(0, 1), (0.2, 0.72), (0.8, 0.72), (1, 1)]),
    ]
    return Asset("medusa_farolillo", "creature", 1, 40, 10, m, bones, clips, catalogId=1, depth=18,
                 source="core: jellyfish() w=40, h=LEDGE_H", zones=[1, 2])


def alga_cinta():
    rng = seeded("alga_cinta")
    p = Z1
    m = Mesh()
    fronds = 5
    bones = [Bone("root", (0, 0, -3))]
    for i in range(fronds):
        bones.append(Bone(f"frond{i}", (-16 + 8 * i, 0, -2), "root"))
    m.bone = "root"
    half = LEDGE_DEPTH / 2.0
    rings = [_ring(x, -2.0, half, 0.45 if abs(x) > 19 else 1.0) for x in (-20, -14, -7, 0, 7, 14, 20)]
    m.rings(rings, lit(mix(p["kelp"], p["rock"], 0.3), rng))
    shade = lit(p["kelp"], rng, top=mix(p["kelp"], p["accent"], 0.3), top_from=2.0)
    for i in range(fronds):
        m.bone = f"frond{i}"
        x = -16 + 8 * i
        for y, lean, tall in ((-4.0, 1.2, TOP), (-1.0, -1.4, 3.6), (2.5, 0.8, 4.4)):
            outline = [(x - 1.5, -2.2), (x + 1.5, -2.2), (x + 1.3 + lean, 1.4), (x + lean * 1.8, tall), (x - 1.3 + lean, 1.4)]
            m.prism(outline, y - 0.4, y + 0.4, shade, center=(x + lean * 0.5, 0.0))
    m.fit(40, 10, bones)
    sway = Clip("Sway", 2.4)
    for i in range(fronds):
        sway.wave(f"frond{i}", "rot", 9, 1, phase=i * 0.17)
    settle = Clip("Absorb", 0.5, False).keys("root", "sz", [(0, 1), (0.3, 0.86), (1, 1)])
    return Asset("alga_cinta", "creature", 1, 40, 10, m, bones, [settle, sway], catalogId=2, depth=LEDGE_DEPTH,
                 source="core: kelpIn() ledge, 40 px in content; wider kelp uses ledge_*_kelp", zones=[1])


def tortuga():
    rng = seeded("tortuga")
    p = Z1
    m = Mesh()
    bones = [Bone("root", (0, 0, 0)), Bone("head", (26, 0, -1), "root"), Bone("fin_f", (15, 0, -2.5), "root"),
             Bone("fin_b", (-20, 0, -2.5), "root")]
    m.bone = "root"
    shell_green = mix(p["kelp"], p["rock"], 0.25)
    plate = mix(p["kelp"], p["accent"], 0.28)

    def plates(center, normal):
        band = int((center[0] + 60) // 9) % 2
        return lit(plate if band else shell_green, rng, jitter=0.05)(center, normal)

    # A long low dome: the rest surface is the belly, flat as every other ledge.
    profile = [(29, -3.4), (28, -1.2), (22, 1.8), (11, 4.2), (0.001, 5.0)]
    m.lathe((0, 0, 0), profile, plates, sides=12, depth_scale=0.36)
    m.lathe((0, 0, -4.2), [(27, -0.8), (28.5, 0.8)], lit(mix(p["foam"], p["accent"], 0.35), rng), sides=12, depth_scale=0.36)
    skin = lit(mix(p["kelp"], p["foam"], 0.32), rng)
    m.bone = "head"
    m.tube([(25, -1, -1.6), (31, -1, 0.4)], [2.0, 1.8], skin, sides=5)
    m.ico((34.0, -1, 1.1), (4.0, 2.6, 2.7), skin, subdiv=1)
    m.ico((35.5, -3.2, 2.0), 0.8, solid(INK), subdiv=0)
    m.bone = "fin_f"
    m.prism([(13, -2), (21, -2), (24, -4.9), (17, -5)], -7.0, -5.8, skin, center=(17.5, -3.5))
    m.prism([(13, -2), (21, -2), (24, -4.9), (17, -5)], 5.8, 7.0, skin, center=(17.5, -3.5))
    m.bone = "fin_b"
    m.prism([(-18, -2.2), (-24, -2.2), (-38, -4.0), (-30, -5)], -6.4, -5.2, skin, center=(-26, -3.5))
    m.prism([(-18, -2.2), (-24, -2.2), (-38, -4.0), (-30, -5)], 5.2, 6.4, skin, center=(-26, -3.5))
    m.fit(76, 10, bones)
    clips = [
        Clip("Swim", 2.0).wave("fin_f", "rot", 16, 1).wave("fin_b", "rot", 12, 1, phase=0.5)
        .wave("head", "rot", 5, 1, phase=0.25),
        Clip("Tuck", 0.4, False).keys("head", "tx", [(0, 0), (0.5, -3.5), (1, 0)]),
    ]
    return Asset("tortuga_paseante", "creature", 1, 76, 10, m, bones, clips, catalogId=3, depth=20, facing="+x",
                 source="core: TURTLE_W = 76, h=LEDGE_H", zones=[1])


def peces_payaso():
    rng = seeded("peces_payaso")
    p = Z1
    m = Mesh()
    placements = [(-17, 6, 1.0), (-4, 8, 1.05), (11, 5, 0.95), (-12, -5, 0.95), (3, -7, 1.05), (18, -6, 1.0)]
    bones = [Bone("root", (0, 0, 0))]
    orange, white = p["coral"], mix(p["foam"], WHITE, 0.6)

    for i, (cx, cz, k) in enumerate(placements):
        bones.append(Bone(f"fish{i}", (cx, 0, cz), "root"))
        m.bone = f"fish{i}"
        y = -2.0 + (i % 3) * 2.0

        m.ico((cx, y, cz), (5.0 * k, 1.6 * k, 3.0 * k), lit(orange, rng, jitter=0.02), subdiv=2)
        # Bands as lenses of their own: bands painted per face come out as a row of white triangles on a
        # red body, and that reads as teeth (pillar 4).
        for u, half_z in ((-1.1, 3.0), (2.1, 2.72)):
            m.ico((cx + u * k, y, cz), (1.25 * k, 1.74 * k * half_z / 3.0, half_z * 1.08 * k), lit(white, rng, jitter=0.02), subdiv=1)
        m.prism([(cx - 4.2 * k, cz), (cx - 8 * k, cz + 2.6 * k), (cx - 7 * k, cz), (cx - 8 * k, cz - 2.6 * k)],
                y - 0.3, y + 0.3, lit(orange, rng), center=(cx - 6 * k, cz))
        m.prism([(cx - 1.5 * k, cz + 2.4 * k), (cx + 1.5 * k, cz + 2.4 * k), (cx - 2.4 * k, cz + 4.2 * k)],
                y - 0.25, y + 0.25, lit(orange, rng), center=(cx - 0.8 * k, cz + 3 * k))
        m.ico((cx + 3.1 * k, y - 1.45 * k, cz + 0.8 * k), 0.75 * k, solid(INK), subdiv=0)
    m.fit(48, 24, bones)
    swim, scatter = Clip("Swim", 1.6), Clip("Scatter", 0.7, False)
    for i, (cx, cz, _k) in enumerate(placements):
        swim.wave(f"fish{i}", "tz", 0.9, 1, phase=i * 0.19).wave(f"fish{i}", "rot", 6, 2, phase=i * 0.13)
        away_x, away_z = (1.0 if cx >= 0 else -1.0) * 7, (1.0 if cz >= 0 else -1.0) * 6
        scatter.keys(f"fish{i}", "tx", [(0, 0), (0.45, away_x), (1, 0)]).keys(f"fish{i}", "tz", [(0, 0), (0.45, away_z), (1, 0)])
    return Asset("peces_payaso", "creature", 1, 48, 24, m, bones, [swim, scatter], catalogId=4, depth=8, facing="+x",
                 source="design: decorative shoal with no core entity (5 no 4); box is not a collision box", zones=[1])


def don_hinchon():
    rng = seeded("don_hinchon")
    p = Z1
    m = Mesh()
    bones = [Bone("root", (0, 0, 0)), Bone("eye_l", (-8, -14, 6), "root"), Bone("eye_r", (8, -14, 6), "root"),
             Bone("fin_l", (-20, -2, 0), "root"), Bone("fin_r", (20, -2, 0), "root"), Bone("spines", (0, 0, 0), "root")]
    m.bone = "root"
    body = p["accent"]
    belly = mix(p["foam"], WHITE, 0.4)
    spot = mix(p["coral"], p["rock"], 0.25)

    def skin(center, normal):
        if center[2] < -6:
            color = belly
        elif (int(center[0] + 40) // 9 + int(center[2] + 40) // 8) % 4 == 0:
            color = spot
        else:
            color = body
        return lit(color, rng, jitter=0.03)(center, normal)

    m.ico((0, 0, 0), (23, 17, 20), skin, subdiv=2)
    # A round worried "o": he is scared, and has nothing to bite with.
    m.ico((0, -16.6, -6), (3.0, 0.7, 2.4), solid(mix(p["coral"], INK, 0.5)), subdiv=1)
    m.ico((0, -16.9, -6.1), (1.6, 0.4, 1.3), solid(INK), subdiv=1)
    m.bone = "spines"
    spike = lit(mix(p["accent"], p["coral"], 0.55), rng, jitter=0.03)
    directions = [(math.cos(a), math.sin(a)) for a in [2 * math.pi * i / 14 + 0.11 for i in range(14)]]
    for dx, dz in directions:
        base = (dx * 20.5, 0.0, dz * 17.5)
        tip = (dx * 30.0, 0.0, dz * 26.0)
        m.cone(base, tip, 3.2, spike, sides=4)
    for x, z in ((-13, 13), (0, 15), (13, 13), (-17, 2), (17, 2), (-11, -9), (11, -9)):
        length = (x / 40.0, -1.0, z / 40.0)
        # Base buried well inside the skin: an exposed base shows up as a black triangle on his face.
        base = (x, -10 + abs(x) * 0.28 + abs(z) * 0.2, z)
        m.cone(base, (base[0] + length[0] * 11, base[1] + length[1] * 11, base[2] + length[2] * 11), 2.6, spike, sides=4)
    for name, sx in (("eye_l", -1), ("eye_r", 1)):
        m.bone = name
        m.ico((sx * 8, -14.6, 6), (5.2, 2.2, 6.0), solid(WHITE), subdiv=1)
        m.ico((sx * 7.0, -16.4, 4.6), (2.3, 0.9, 2.8), solid(INK), subdiv=1)
    for name, sx in (("fin_l", -1), ("fin_r", 1)):
        m.bone = name
        m.prism([(sx * 19, 3), (sx * 19, -5), (sx * 28, -8), (sx * 27, 5)], -8.6, -7.4, lit(p["coral"], rng), center=(sx * 23, -1))
    m.fit(60, 52, bones)
    clips = [
        Clip("Idle", 2.0).wave("root", "sx", 0.05, 1, base=0.74).wave("root", "sz", 0.05, 1, phase=0.5, base=0.76)
        .wave("fin_l", "rot", 18, 2).wave("fin_r", "rot", 18, 2, phase=0.5).keys("spines", "sx", [(0, 0.78), (1, 0.78)])
        .keys("spines", "sz", [(0, 0.78), (1, 0.78)]),
        # Bind pose is fully inflated; he fills his 60 x 52 hazard box only at the top of this one.
        Clip("Inflate", 0.6, False).keys("root", "sx", [(0, 0.74), (0.7, 1.0), (1, 1.0)]).keys("root", "sz", [(0, 0.76), (0.7, 1.0), (1, 1.0)])
        .keys("spines", "sx", [(0, 0.78), (0.7, 1), (1, 1)]).keys("spines", "sz", [(0, 0.78), (0.7, 1), (1, 1)]),
        Clip("Deflate", 0.8, False).keys("root", "sx", [(0, 1.0), (1, 0.74)]).keys("root", "sz", [(0, 1.0), (1, 0.76)])
        .keys("spines", "sx", [(0, 1), (1, 0.78)]).keys("spines", "sz", [(0, 1), (1, 0.78)]),
        # 600 ms, the core's tellMs for this hazard: he shivers before he puffs up.
        Clip("Tell", 0.6, False).keys("root", "tx", [(i / 8.0, (0.8 if i % 2 else -0.8) if 0 < i < 8 else 0) for i in range(9)])
        .keys("root", "sx", [(0, 0.74), (1, 0.74)]).keys("root", "sz", [(0, 0.76), (1, 0.76)]),
        Clip("Laugh", 1.2).wave("root", "rot", 8, 2).wave("root", "sz", 0.05, 4, base=0.9).keys("root", "sx", [(0, 0.9), (1, 0.9)])
        .keys("eye_l", "sz", [(0, 0.35), (1, 0.35)]).keys("eye_r", "sz", [(0, 0.35), (1, 0.35)]),
    ]
    return Asset("don_hinchon", "boss", 1, 60, 52, m, bones, clips, catalogId=5, depth=42,
                 source="core: z1/boss.ts shape 60 x 52", zones=[1])


def erizo():
    rng = seeded("erizo_coralino")
    p = Z2
    m = Mesh()
    ball = lit(mix(p["accent"], INK, 0.28), rng, jitter=0.05)
    spine = lit(p["coral"], rng, jitter=0.03, top=mix(p["coral"], p["accent"], 0.2), top_from=1e9)
    center = (0, 0, -1.6)
    m.ico(center, 3.6, ball, subdiv=1)
    # Base pad: a crown grown on a lip is the same asset turned over (`growth`), so the pad marks which way is ledge.
    m.lathe((0, 0, -7), [(3.4, 0.0), (2.2, 2.8)], lit(mix(p["rock"], p["accent"], 0.2), rng), sides=6)
    count = 13
    for i in range(count):
        ang = math.pi * (-0.26 + 1.52 * i / (count - 1))
        d = (math.cos(ang), math.sin(ang))
        y = -2.0 if i % 2 else 2.0
        base = (d[0] * 2.8, y * 0.5, center[2] + d[1] * 2.8)
        tip = (d[0] * 7.0, y, center[2] + d[1] * 8.6)
        m.cone(base, tip, 1.05, spine, sides=3)
    m.fit(14, 14)
    return Asset("erizo_coralino", "hazard", 2, 14, 14, m, catalogId=6, depth=10, zones=[2],
                 source="core: ERIZO_W x ERIZO_H", growth="grows upward; for growth='lip' rotate 180 degrees around Z",
                 notes="No actions on purpose: 5 no 6, 'nunca se mueve'.")


def anemona():
    rng = seeded("anemona_pegajosa")
    p = Z2
    m = Mesh()
    bones = [Bone("root", (0, 0, -7)), Bone("left", (-2, 0, -2), "root"), Bone("mid", (0, 0, -2), "root"),
             Bone("right", (2, 0, -2), "root")]
    stem = lit(mix(p["jelly"], p["rock"], 0.3), rng)
    arm = lit(p["jelly"], rng, top=mix(p["jelly"], WHITE, 0.55), top_from=3.0)
    m.bone = "root"
    m.lathe((0, 0, -7), [(4.6, 0), (3.2, 2.0), (3.6, 5.0)], stem, sides=7)
    fans = [("left", -1.0), ("left", -0.72), ("left", -0.42), ("mid", -0.12), ("mid", 0.12), ("right", 0.42), ("right", 0.72), ("right", 1.0)]
    for i, (bone, side) in enumerate(fans):
        m.bone = bone
        y = 1.6 if i % 2 else -1.6
        sx = side * 3.0
        tip_x = side * 7.8
        tall = 7.0 - abs(side) * 2.8
        m.tube([(sx, y, -2.2), (sx + side * 2.8, y, 1.2), (tip_x, y, tall - 0.8)], [1.25, 1.05, 0.85], arm, sides=4)
        m.ico((tip_x, y, tall - 0.3), 1.15, arm, subdiv=0)
    m.fit(16, 14, bones)
    clips = [
        Clip("Sway", 2.2).wave("left", "rot", 7, 1).wave("mid", "rot", 5, 1, phase=0.12).wave("right", "rot", 7, 1, phase=0.24),
        # TRAP_HOLD_MS: the crown shuts around Bur, then lets go.
        Clip("Grab", 0.8, False).keys("left", "rot", [(0, 0), (0.2, -24), (0.85, -24), (1, 0)]).keys("right", "rot", [(0, 0), (0.2, 24), (0.85, 24), (1, 0)])
        .keys("root", "sz", [(0, 1), (0.2, 0.86), (0.85, 0.86), (1, 1)]),
        Clip("Vent", 0.5, False).keys("root", "sz", [(0, 1), (0.3, 0.7), (0.6, 1.0), (1, 1)]).keys("root", "sx", [(0, 1), (0.3, 0.9), (1, 1)]),
    ]
    return Asset("anemona_pegajosa", "hazard", 2, 16, 14, m, bones, clips, catalogId=7, depth=10, zones=[2],
                 source="core: ANEMONA_W x ANEMONA_H", growth="grows upward; for growth='lip' rotate 180 degrees around Z")


def corriente():
    rng = seeded("corriente_mota")
    m = Mesh()
    color = lit(mix(Z2["foam"], Z2["waterTop"], 0.2), rng, jitter=0.02)
    m.prism([(-7, -0.2), (-2, 1.6), (3, 1.3), (7, 0), (3, -0.5), (-2, -1.0)], -0.3, 0.3, color, center=(0, 0.2))
    m.prism([(-5, -2.0), (0, -1.1), (2, -1.2), (0.5, -2.0), (-1, -2.0)], -0.25, 0.25, color, center=(-0.5, -1.6))
    m.fit(14, 4)
    return Asset("corriente_mota", "field", 2, 14, 4, m, catalogId=8, depth=1, facing="+x", zones=[2],
                 source="design: one drifting mark; 5 no 8 is drawn as particles and band sizes vary, so the shell instances this",
                 notes="Not a collision box: the field's rect comes from core. Mirror on dir = -1.")


def pulpo():
    rng = seeded("pulpo_camuflado")
    p = Z2
    m = Mesh()
    bones = [Bone("root", (0, 0, -5)), Bone("lid_l", (-6, -7, 1.5), "root"), Bone("lid_r", (6, -7, 1.5), "root"),
             Bone("arm_l", (-16, 0, -2), "root"), Bone("arm_r", (16, 0, -2), "root")]
    # Parece repisa: same section and colours as rock, so the trick survives a glance. What gives him away
    # is the soft dome in the middle, the curled ends and, 0.4 s before he moves, his eyes.
    base = lit(p["rock"], rng, jitter=0.06, top=p["rockLight"], top_from=2.0)
    m.bone = "root"
    half = LEDGE_DEPTH / 2.0
    rings = []
    for x, top in ((-15, 1.6), (-10, 3.0), (-5, 4.2), (0, TOP), (5, 4.2), (10, 3.0), (15, 1.6)):
        rings.append(_ring(x, top, half, 0.92, 0.25, rng))
    m.rings(rings, base)
    for x in (-9, -3, 3, 9):
        m.ico((x, -half * 0.55, BOTTOM + 0.7), (1.8, 1.0, 0.7), solid(mix(p["rockLight"], p["jelly"], 0.35)), subdiv=0)
    for name, sx in (("lid_l", -1), ("lid_r", 1)):
        m.bone = name
        # Eye behind a lid that matches the rock: only the Blink action opens it.
        m.ico((sx * 6, -6.9, 1.5), (2.4, 0.7, 1.9), solid(p["rockLight"]), subdiv=1)
    m.bone = "root"
    for sx in (-1, 1):
        # Round, white and surprised like Don Hinchon's. Red slits would make him a villain (pillar 4).
        m.ico((sx * 6, -6.5, 1.5), (2.2, 0.8, 1.7), solid(WHITE), subdiv=1)
        m.ico((sx * 6, -7.1, 1.5), (1.0, 0.4, 1.0), solid(INK), subdiv=0)
    for name, sx in (("arm_l", -1), ("arm_r", 1)):
        m.bone = name
        pts = [(sx * 14, 0, -2.5), (sx * 18, 0, -3.2), (sx * 20, 0, -1.4), (sx * 18.5, 0, 0.2)]
        m.tube(pts, [2.6, 1.9, 1.2, 0.8], base, sides=5)
    m.fit(40, 10, bones)
    clips = [
        Clip("Idle", 3.0).wave("root", "sz", 0.02, 1, base=0.98),
        # 0.4 s tell (5 no 9): lids shut in the bind pose and open here.
        Clip("Blink", 0.4, False).keys("lid_l", "sz", [(0, 1), (0.25, 0.1), (0.75, 0.1), (1, 1)]).keys("lid_r", "sz", [(0, 1), (0.25, 0.1), (0.75, 0.1), (1, 1)]),
        Clip("Shove", 0.5, False).keys("root", "tz", [(0, 0), (0.3, -1.0), (1, 0)]).keys("root", "sz", [(0, 1), (0.3, 1.0), (1, 1)])
        .keys("arm_l", "rot", [(0, 0), (0.35, 26), (1, 0)]).keys("arm_r", "rot", [(0, 0), (0.35, -26), (1, 0)]),
    ]
    return Asset("pulpo_camuflado", "creature", 2, 40, 10, m, bones, clips, catalogId=9, depth=LEDGE_DEPTH, zones=[2],
                 source="core: pulpoRung, 40 x LEDGE_H in content")


def _shell_fan(m, cx, cz, radius, start, end, y0, y1, shade, ribs=7, notch=0.9):
    outline = [(cx, cz)]
    for i in range(ribs * 2 + 1):
        t = i / (ribs * 2.0)
        ang = math.radians(start + (end - start) * t)
        r = radius if i % 2 == 0 else radius * notch
        outline.append((cx + math.cos(ang) * r, cz + math.sin(ang) * r))
    m.prism(outline, y0, y1, shade, center=(cx + math.cos(math.radians((start + end) / 2)) * radius * 0.5,
                                           cz + math.sin(math.radians((start + end) / 2)) * radius * 0.5))


def _ribs(a, b, cx, cz, rng):
    """Colours radiating from a hinge at (cx, cz): the one mark that says 'shell' on any fan or valve."""
    def shade(center, normal):
        band = int((math.atan2(center[2] - cz, center[0] - cx) + math.pi) * 9.0) % 2
        return lit(a if band else b, rng, jitter=0.03)(center, normal)
    return shade


def _valve(sign, tilt):
    """One half of a clam seen side-on: a scalloped half ellipse hinged at the left, opened by `tilt` degrees."""
    hx, hz = -18.0, 0.0
    points = [(hx, hz)]
    count = 9
    for i in range(1, count + 1):
        t = i / float(count)
        x = -18.0 + 36.0 * t
        bulge = math.sin(math.pi * t) ** 0.75 * (9.0 if i % 2 == 0 else 8.1)
        ang = math.radians(tilt * sign)
        dx, dz = x - hx, bulge * sign
        points.append((hx + dx * math.cos(ang) - dz * math.sin(ang), hz + dx * math.sin(ang) + dz * math.cos(ang)))
    return points


def almeja():
    rng = seeded("almeja_porton")
    p = Z2
    m = Mesh()
    # All at the valves' real hinge (see _valve): turning about anywhere else slides them past each other.
    bones = [Bone("root", (-18, 0, 0)), Bone("upper", (-18, 0, 0), "root"), Bone("lower", (-18, 0, 0), "root"), Bone("pearl", (4, -1, 0), "root")]
    m.bone = "root"
    m.ico((-7, 0, 0), (11, 4.5, 4.5), solid(mix(p["jelly"], INK, 0.45)), subdiv=1)
    m.bone = "pearl"
    m.ico((4, -1, 0), 2.6, lit(mix(WHITE, p["accent"], 0.1), rng, jitter=0.02), subdiv=1)
    light = mix(p["foam"], p["jelly"], 0.4)
    m.bone = "upper"
    m.prism(_valve(1, 19.0), -6, 6, _ribs(light, mix(light, p["rock"], 0.3), -18, 0, rng), center=(-4, 5))
    m.bone = "lower"
    lower = mix(light, p["rock"], 0.22)
    m.prism(_valve(-1, 19.0), -6, 6, _ribs(lower, mix(lower, p["rock"], 0.3), -18, 0, rng), center=(-4, -5))
    m.fit(40, 24, bones)
    # Closed means the valves' straight edges meet: this is the tilt _valve opened them by, once `fit` has scaled it.
    shut = 13
    clips = [
        Clip("Open", 0.5, False).keys("upper", "rot", [(0, -shut), (1, 0)]).keys("lower", "rot", [(0, shut), (1, 0)]),
        Clip("Close", 0.25, False).keys("upper", "rot", [(0, 0), (1, -shut)]).keys("lower", "rot", [(0, 0), (1, shut)]),
        # 0.5 s warning (5 no 10), and the only one the player gets: half shut, shuddering, the pearl swelling.
        Clip("Tell", 0.5, False)
        .keys("upper", "rot", [(0, 0), (0.2, -9), (0.35, -5), (0.5, -10), (0.65, -5), (0.8, -10), (1, -7)])
        .keys("lower", "rot", [(0, 0), (0.2, 9), (0.35, 5), (0.5, 10), (0.65, 5), (0.8, 10), (1, 7)])
        .keys("pearl", "sx", [(0, 1), (0.3, 1.55), (0.6, 1.2), (1, 1.6)]).keys("pearl", "sz", [(0, 1), (0.3, 1.55), (0.6, 1.2), (1, 1.6)])
        .keys("root", "tx", [(0, 0), (0.25, -0.7), (0.5, 0.7), (0.75, -0.7), (1, 0)]),
    ]
    return Asset("almeja_porton", "creature", 2, 40, 24, m, bones, clips, catalogId=10, depth=12, facing="+x", zones=[2],
                 source="design: 5 no 10 has no entity or hitbox in core or content yet; size is provisional")


def creature_assets():
    return [bur(), medusa(), alga_cinta(), tortuga(), peces_payaso(), don_hinchon(), erizo(), anemona(), corriente(), pulpo(), almeja()]
