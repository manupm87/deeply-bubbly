"""Builds each reef layer as real low-poly geometry and renders it to an RGBA PNG. Run in background Blender:

    blender --background --factory-startup --python tools/backgrounds/render_layers.py -- RAW_DIR [layer ...]

Tiling is geometric, not retouched: the mesh is repeated in a 3 x 3 grid at exactly the tile period, so shapes and
cast shadows cross the edges, and the camera frames one period plus an overscan margin used by finish_layers.py.
"""
import math
import random
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from config import OVERSCAN_PX, REEF_LAYERS, Z1, Z2, hx  # noqa: E402


def lin1(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


class Build:
    """Polygons with one colour each, in display (sRGB) colour until the mesh is written."""

    def __init__(self, cfg, pal, rng):
        self.v, self.f, self.c = [], [], []
        self.cfg, self.pal, self.rng = cfg, pal, rng
        self.haze = hx(cfg["haze"])
        self.depth = cfg["depth"]
        self.living = False

    def tint(self, col, y):
        # Aerial perspective inside the layer: further back (+y) sinks into the water colour.
        t = max(0.0, min(1.0, (y + self.depth) / (2 * self.depth)))
        amount = self.cfg["hazeBase"] + self.cfg["hazeDepth"] * t
        # Living things take a flat per-layer haze: enough to sit behind gameplay, not so much that warm colours go to mud.
        return mix(col, self.haze, self.cfg["living"] if self.living else amount)

    def face(self, pts, col, jitter=0.03):
        base = len(self.v)
        self.v.extend(tuple(p) for p in pts)
        self.f.append(tuple(range(base, base + len(pts))))
        j = self.rng.uniform(-jitter, jitter)
        c = tuple(min(1.0, max(0.0, x + j)) for x in col)
        self.c.append(self.tint(c, sum(p[1] for p in pts) / len(pts)))

    def hull(self, center, radii, count, base, top=None, under=None, stripe=None):
        """A convex hull of random points: the chiselled shard all the rocks are made of."""
        bm = bmesh.new()
        for _ in range(count):
            a, b = self.rng.uniform(0, math.tau), self.rng.uniform(-1, 1)
            s = math.sqrt(1 - b * b)
            bm.verts.new((center[0] + radii[0] * s * math.cos(a), center[1] + radii[1] * s * math.sin(a), center[2] + radii[2] * b))
        res = bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
        bmesh.ops.delete(bm, geom=res["geom_interior"] + res["geom_unused"], context="VERTS") if res["geom_interior"] or res["geom_unused"] else None
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.normal_update()
        for fc in bm.faces:
            n = fc.normal
            mid = fc.calc_center_median()
            col = base
            if top and n.z > 0.35:
                col = mix(base, top, min(1.0, (n.z - 0.35) / 0.45))
            if under and n.z < -0.25:
                col = mix(col, under, 0.6)
            if stripe:
                col = stripe(mid, col)
            self.face([tuple(p.co) for p in fc.verts], col)
        bm.free()

    def tube(self, pts, radii, col, sides=5, tip=None):
        rings = []
        for i, p in enumerate(pts):
            d = Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])
            d.normalize()
            u = d.cross(Vector((0, 1, 0)))
            if u.length < 0.01:
                u = Vector((1, 0, 0))
            u.normalize()
            w = d.cross(u)
            rings.append([Vector(p) + (u * math.cos(k / sides * math.tau) + w * math.sin(k / sides * math.tau)) * radii[i] for k in range(sides)])
        for r in range(len(rings) - 1):
            c = col if tip is None else mix(col, tip, (r / max(1, len(rings) - 2)) ** 2)
            for k in range(sides):
                a, b = rings[r][k], rings[r][(k + 1) % sides]
                e, g = rings[r + 1][k], rings[r + 1][(k + 1) % sides]
                self.face([a, b, g, e], c)
        last = rings[-1]
        for k in range(1, sides - 1):
            self.face([last[0], last[k], last[k + 1]], col if tip is None else tip)

    # ------------- decor, the same vocabulary as tools/blender/props.py, scaled to the layer -------------
    def coral(self, x, y, z, s, col):
        r = self.rng
        tipc = mix(col, (1, 1, 0.9), 0.3)

        def branch(p, ang, length, rad, level):
            segs = 3
            pts, rads = [p], [rad]
            a = ang
            for i in range(segs):
                a += r.uniform(-0.18, 0.18)
                q = pts[-1]
                pts.append((q[0] + math.sin(a) * length / segs, q[1] + r.uniform(-0.6, 0.6), q[2] + math.cos(a) * length / segs))
                rads.append(rad * (1 - 0.22 * (i + 1)))
            self.tube(pts, rads, col, sides=4, tip=tipc if level == 0 else None)
            if level > 0:
                for sgn in (-1, 1):
                    branch(pts[-1], a + sgn * r.uniform(0.35, 0.7), length * 0.68, rads[-1] * 0.85, level - 1)

        for sgn in (-0.5, 0.0, 0.5):
            branch((x + sgn * s * 0.25, y, z - s * 0.03), sgn + r.uniform(-0.1, 0.1), s * 0.48, s * 0.115, 2)

    def fan(self, x, y, z, s, col):
        r = self.rng
        ribs = 13
        tips = []
        for i in range(ribs):
            a = -1.05 + 2.1 * i / (ribs - 1)
            ln = s * r.uniform(0.88, 1.05)
            tips.append((x + math.sin(a) * ln, y, z + math.cos(a) * ln))
        for i in range(ribs - 1):
            # Open spokes, as on the bd_*_fan props: a solid fan reads as a shell.
            gap = 0.62
            mid = tuple(tips[i][k] + (tips[i + 1][k] - tips[i][k]) * gap for k in range(3))
            self.face([(x, y, z), mid, tips[i]], mix(col, (1, 1, 1), 0.12 if i % 2 else 0.0))
        self.tube([(x, y - 0.5, z - s * 0.05), (x, y - 0.5, z + s * 0.22)], [s * 0.05, s * 0.03], mix(col, (0.2, 0.2, 0.3), 0.3), sides=4)

    def sponge(self, x, y, z, s, col):
        r = self.rng
        for dx, h in ((-0.32, 0.72), (0.0, 1.0), (0.34, 0.56)):
            cx = x + dx * s + r.uniform(-1, 1)
            hh = h * s * r.uniform(0.9, 1.1)
            rad = s * 0.17 * r.uniform(0.85, 1.15)
            self.tube([(cx, y, z - s * 0.05), (cx + r.uniform(-1, 1), y, z + hh * 0.5), (cx, y, z + hh)], [rad * 1.1, rad * 0.9, rad * 1.08], col, sides=6, tip=mix(col, (1, 0.95, 0.85), 0.25))

    def brain(self, x, y, z, s, col):
        dark = mix(col, (0.62, 0.22, 0.2), 0.45)

        def stripe(mid, c):
            return dark if math.sin((mid.z - z) * 11.0 / s + (mid.x - x) * 4.0 / s) > 0.2 else c

        self.hull((x, y, z + s * 0.3), (s * 0.62, s * 0.5, s * 0.42), 110, col, stripe=stripe)

    def kelp(self, x, y, z, s, col):
        r = self.rng
        phase = r.uniform(0, 6)
        pts, rads = [], []
        segs = 9
        for i in range(segs + 1):
            t = i / segs
            pts.append((x + math.sin(t * 5 + phase) * s * 0.05, y, z + t * s))
            rads.append(s * 0.012 * (1.25 - t))
        self.tube(pts, rads, mix(col, (0.1, 0.25, 0.2), 0.2), sides=4)
        for i in range(1, segs):
            p = pts[i]
            sgn = 1 if i % 2 else -1
            ln = s * 0.19 * (1.15 - i / segs)
            wd = ln * 0.3
            # Two triangles, never a warped quad, so a leaf stays cleanly flat-shaded.
            tipp = (p[0] + sgn * ln, p[1], p[2] + ln * 0.42)
            col2 = mix(col, (0.9, 1, 0.5), 0.12 if i % 4 == 0 else 0.0)
            self.face([p, (p[0] + sgn * ln * 0.45, p[1] - 0.2, p[2] + ln * 0.2 + wd), tipp], col2)
            self.face([p, tipp, (p[0] + sgn * ln * 0.5, p[1] + 0.2, p[2] + ln * 0.1 - wd * 0.3)], mix(col2, (0, 0.2, 0.2), 0.14))

    def grass(self, x, y, z, s, col):
        r = self.rng
        for i in range(r.randint(4, 6)):
            bx = x + (i - 2.5) * s * 0.13 + r.uniform(-1, 1)
            h = s * r.uniform(0.5, 1.05)
            w = s * 0.055
            lean = r.uniform(-0.2, 0.2) * h
            self.face([(bx - w, y, z), (bx + w, y, z), (bx + lean, y - 0.3, z + h)], mix(col, (0.85, 1, 0.5), r.uniform(0, 0.18)))


def build_layer(name, cfg):
    pal = Z1 if cfg["zone"] == 1 else Z2
    rng = random.Random(cfg["seed"])
    W, H = cfg["tile"]
    b = Build(cfg, pal, rng)
    # Rock takes a cast of its zone's water, so it never sits on the same value as the slate gameplay ledges.
    if cfg["zone"] == 1:
        rock = mix(hx(pal["rockLight"]), hx(0x2fa7b4), 0.62)
        light = mix(hx(pal["rockLight"]), hx(pal["foam"]), 0.55)
    else:
        rock = mix(hx(pal["rock"]), hx(0x1f8a94), 0.62)
        light = mix(mix(hx(0x3f9aa4), hx(pal["foam"]), 0.12), hx(pal["coral"]), 0.14)
    under = mix(rock, (0.05, 0.1, 0.2), 0.5)
    wall = cfg.get("wall", False)
    sites = []
    for t in cfg["towers"]:
        n, m = t["n"], t["m"]
        phase, phase2 = rng.uniform(0, 6.28), rng.uniform(0, 6.28)

        def xc(z):
            return t["x"] + t["amp"] * math.sin(math.tau * n * z / H + phase)

        def width(z):
            return t["w"] * (1.0 + 0.3 * math.sin(math.tau * m * z / H + phase2))

        # Tall chisels stacked into a tower, walked with an integer step count so the stack closes on itself.
        steps = max(4, round(H / (t["w"] * (0.055 if wall else 0.42))))
        for i in range(steps):
            z = (i + rng.uniform(-0.25, 0.25)) / steps * H
            w = width(z)
            spread = 0.92 if wall else 0.50
            x = xc(z) + rng.uniform(-spread, spread) * w
            sx = w * (rng.uniform(0.14, 0.34) if wall else rng.uniform(0.32, 0.62))
            sz = w * (rng.uniform(0.2, 0.42) if wall else rng.uniform(0.55, 1.05))
            y = rng.uniform(-0.6, 1.0) * b.depth * 0.8
            b.hull((x, y, z), (sx, sx * 0.8, sz), rng.randint(9, 14), mix(rock, light, rng.uniform(0, 0.25)), top=light, under=under)
        # Terraces jut out and carry the living decor.
        terraces = max(3, round(H / (58 if wall else 70)))
        for i in range(terraces):
            z = (i + rng.uniform(-0.2, 0.2)) / terraces * H
            w = width(z)
            side = rng.choice((-1, 1))
            reach = (1.0 if wall else 0.72) * w * rng.uniform(0.55, 1.0)
            x = xc(z) + side * reach
            sx = w * rng.uniform(0.32, 0.6) * (0.5 if wall else 1.0)
            sz = rng.uniform(5.0, 9.0) * (cfg["decorScale"] + 0.3)
            y = -b.depth * rng.uniform(0.2, 0.75)
            b.hull((x, y, z), (sx, sx * 0.7, sz), 12, mix(rock, light, 0.2), top=light, under=under)
            for _ in range(rng.randint(1, 2)):
                sites.append((x + rng.uniform(-0.8, 0.8) * sx, y - rng.uniform(1, 4), z + sz * 0.72))

    weights = [(k, v) for k, v in cfg["decor"].items() if v > 0]
    colours = {"coral": [pal["coral"], pal["coral"], pal["gold"], pal["pink"]], "fan": [pal["coral"], pal["pink"]], "sponge": [pal["coral"], pal["coral"], pal["pink"]], "brain": [pal["coral"], pal["gold"]], "kelp": [pal["kelp"]], "grass": [pal["kelp"]]}
    sizes = {"coral": 30, "fan": 26, "sponge": 26, "brain": 18, "kelp": 92, "grass": 26}
    b.living = True
    for x, y, z in sites:
        kind = rng.choices([k for k, _ in weights], [v for _, v in weights])[0]
        col = hx(rng.choice(colours[kind]))
        s = sizes[kind] * cfg["decorScale"] * rng.uniform(0.75, 1.25)
        getattr(b, kind)(x, y, z, s, col)
    return b


def write_mesh(b, name, tile):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(b.v, [], b.f)
    mesh.update()
    attr = mesh.color_attributes.new("col", "FLOAT_COLOR", "CORNER")
    for poly in mesh.polygons:
        c = b.c[poly.index]
        lin = (lin1(c[0]), lin1(c[1]), lin1(c[2]), 1.0)
        for li in poly.loop_indices:
            attr.data[li].color = lin
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    dif = nodes.new("ShaderNodeBsdfDiffuse")
    vc = nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "col"
    mat.node_tree.links.new(vc.outputs["Color"], dif.inputs["Color"])
    mat.node_tree.links.new(dif.outputs[0], out.inputs[0])
    mesh.materials.append(mat)
    W, H = tile
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            ob = bpy.data.objects.new(f"{name}_{dx}_{dz}", mesh)
            ob.location = (dx * W, 0, dz * H)
            bpy.context.scene.collection.objects.link(ob)


def setup(cfg, path):
    scene = bpy.context.scene
    W, H = cfg["tile"]
    px, py = cfg["size"]
    per = W / px
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            if any(d.type == backend for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                break
        except Exception:
            continue
    scene.cycles.samples = 96
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.seed = cfg["seed"]
    scene.render.film_transparent = True
    scene.render.resolution_x = px + 2 * OVERSCAN_PX
    scene.render.resolution_y = py + 2 * OVERSCAN_PX
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    cam_d = bpy.data.cameras.new("cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = max(scene.render.resolution_x, scene.render.resolution_y) * per
    cam_d.clip_start, cam_d.clip_end = 1, 2000
    cam = bpy.data.objects.new("cam", cam_d)
    cam.location = (W / 2, -800, H / 2)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 1.0, 1.0, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = cfg["ambient"]
    scene.world = world
    sun_d = bpy.data.lights.new("sun", "SUN")
    sun_d.energy = cfg["sun"]
    sun_d.angle = math.radians(1.5)
    sun_d.color = (1.0, 0.97, 0.86)
    sun = bpy.data.objects.new("sun", sun_d)
    sun.rotation_euler = (math.radians(38), math.radians(-28), 0)
    scene.collection.objects.link(sun)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    raw = Path(argv[0])
    raw.mkdir(parents=True, exist_ok=True)
    for name in argv[1:] or list(REEF_LAYERS):
        cfg = REEF_LAYERS[name]
        bpy.ops.wm.read_factory_settings(use_empty=True)
        build = build_layer(name, cfg)
        print("DB_BG", name, "polys", len(build.f), flush=True)
        write_mesh(build, name, cfg["tile"])
        setup(cfg, raw / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print("DB_BG done", name, flush=True)


try:
    main()
except Exception:
    import traceback

    traceback.print_exc()
    sys.exit(1)
