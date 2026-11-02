"""Geometry, rigging and export kit shared by every asset script.

Everything is authored in DESIGN PX: x right, z up, y depth with the camera on the -y side. The export
converts 1 px to 0.1 m, and glTF's +Y-up conversion then gives the contract of WEB3D.md: core x -> +X,
up -> +Y, the play plane at Z = 0, the origin at the centre of the collision box.

An asset is triangles with a flat colour per face (no textures), so a static piece is one mesh with one
material, which is one draw call. Moving parts are bones in a single skin rather than separate nodes,
for the same reason: a creature costs one draw call however many parts it moves.

Nothing here reads the clock or an unseeded random source: same script, same bytes.
"""
import math
import random
import re
import zlib
from pathlib import Path

import bpy

PX = 0.1
FPS = 30
REPO = Path(__file__).resolve().parents[2]
MODELS_DIR = REPO / "apps" / "web3d" / "public" / "models"
PALETTE_TS = REPO / "apps" / "web" / "src" / "palette.ts"


# ---------------------------------------------------------------------------------------------
# Palette: read from the shell's file so the two can never drift apart
# ---------------------------------------------------------------------------------------------

def hex_rgb(value):
    return ((value >> 16) & 255) / 255.0, ((value >> 8) & 255) / 255.0, (value & 255) / 255.0


def load_palettes():
    source = PALETTE_TS.read_text(encoding="utf-8")
    block = source[source.index("ZONE_PALETTES"):]
    zones = []
    for row in re.findall(r"\{ name: '[^']+',([^}]*)\}", block):
        zones.append({key: hex_rgb(int(val, 16)) for key, val in re.findall(r"(\w+): 0x([0-9a-fA-F]{6})", row)})
    if len(zones) != 6:
        raise RuntimeError(f"expected 6 zone palettes in {PALETTE_TS}, found {len(zones)}")
    return zones


PALETTES = load_palettes()
Z1 = PALETTES[0]
Z2 = PALETTES[1]
INK = hex_rgb(0x1e2a38)
WHITE = (1.0, 1.0, 1.0)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def seeded(name):
    """A generator that depends on the asset name only (crc32 is stable; Python's hash() is salted)."""
    return random.Random(zlib.crc32(name.encode("utf-8")))


# ---------------------------------------------------------------------------------------------
# Small vector helpers (plain tuples keep this importable and fast)
# ---------------------------------------------------------------------------------------------

def sub(a, b):
    return a[0] - b[0], a[1] - b[1], a[2] - b[2]


def add3(a, b):
    return a[0] + b[0], a[1] + b[1], a[2] + b[2]


def scale3(a, s):
    return a[0] * s, a[1] * s, a[2] * s


def cross(a, b):
    return a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    length = math.sqrt(dot(a, a))
    return (0.0, 0.0, 1.0) if length < 1e-9 else scale3(a, 1.0 / length)


def centroid(points):
    n = float(len(points))
    return sum(p[0] for p in points) / n, sum(p[1] for p in points) / n, sum(p[2] for p in points) / n


# ---------------------------------------------------------------------------------------------
# Shading: a colour per face, baked; the shell's lights do the rest
# ---------------------------------------------------------------------------------------------

def lit(base, rng, jitter=0.04, top=None, top_from=None, under=0.16):
    """Top-lit flat colour. Faces above `top_from` (px) take `top`; faces pointing down are darker."""
    def shade(center, normal):
        color = base
        if top is not None and top_from is not None and center[2] > top_from:
            color = top
        light = 1.0 + 0.10 * max(normal[2], 0.0) - under * max(-normal[2], 0.0)
        light += rng.uniform(-jitter, jitter)
        return tuple(min(1.0, v * light) for v in color)
    return shade


def solid(color):
    return lambda center, normal: color


# ---------------------------------------------------------------------------------------------
# Mesh builder
# ---------------------------------------------------------------------------------------------

_ICO_BASE = None


def _ico_base():
    global _ICO_BASE
    if _ICO_BASE is None:
        t = (1.0 + math.sqrt(5.0)) / 2.0
        v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
             (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
        f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
             (6, 2, 10), (8, 6, 7), (9, 8, 1)]
        _ICO_BASE = ([norm(p) for p in v], f)
    return _ICO_BASE


def unit_ico(subdiv):
    verts, faces = list(_ico_base()[0]), list(_ico_base()[1])
    for _ in range(subdiv):
        cache = {}

        def mid(i, j):
            key = (min(i, j), max(i, j))
            if key not in cache:
                cache[key] = len(verts)
                verts.append(norm(scale3(add3(verts[i], verts[j]), 0.5)))
            return cache[key]

        new_faces = []
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            new_faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = new_faces
    return verts, faces


class Mesh:
    """Triangle soup in design px: (a, b, c, srgb colour, bone or None, layer)."""

    def __init__(self):
        self.tris = []
        self.bone = None
        self.layer = "opaque"

    # -- raw ------------------------------------------------------------------------------------
    def tri(self, a, b, c, shade, ref=None):
        """Adds a triangle; with `ref` (a point inside the solid) its winding is forced to face away."""
        n = norm(cross(sub(b, a), sub(c, a)))
        center = centroid((a, b, c))
        if ref is not None and dot(n, sub(center, ref)) < 0:
            b, c = c, b
            n = scale3(n, -1.0)
        self.tris.append((a, b, c, shade(center, n), self.bone, self.layer))

    def invert_layer(self, layer):
        """Flips winding of a layer: the inverted hull that draws Bur's contour needs inward faces."""
        self.tris = [(a, c, b, col, bone, lay) if lay == layer else (a, b, c, col, bone, lay)
                     for a, b, c, col, bone, lay in self.tris]

    # -- primitives -----------------------------------------------------------------------------
    def ico(self, center, radius, shade, subdiv=1, wobble=0.0, rng=None):
        rx, ry, rz = (radius, radius, radius) if isinstance(radius, (int, float)) else radius
        verts, faces = unit_ico(subdiv)
        pts = []
        for v in verts:
            k = 1.0 + (rng.uniform(-wobble, wobble) if wobble else 0.0)
            pts.append((center[0] + v[0] * rx * k, center[1] + v[1] * ry * k, center[2] + v[2] * rz * k))
        for a, b, c in faces:
            self.tri(pts[a], pts[b], pts[c], shade, center)

    def cone(self, base, tip, radius, shade, sides=4):
        axis = norm(sub(tip, base))
        u = norm(cross(axis, (0.31, 0.77, 0.56)))
        w = cross(axis, u)
        ring = []
        for i in range(sides):
            ang = 2.0 * math.pi * i / sides
            ring.append(add3(base, add3(scale3(u, math.cos(ang) * radius), scale3(w, math.sin(ang) * radius))))
        ref = add3(base, scale3(sub(tip, base), 0.3))
        for i in range(sides):
            a, b = ring[i], ring[(i + 1) % sides]
            self.tri(a, b, tip, shade, ref)
            self.tri(a, b, base, shade, ref)

    def tube(self, points, radii, shade, sides=5, cap_end=True, cap_start=True):
        """A bent tapered tube. `shade` may vary per face through its centre, as usual."""
        rings = []
        for i, point in enumerate(points):
            prev_pt = points[max(i - 1, 0)]
            next_pt = points[min(i + 1, len(points) - 1)]
            axis = norm(sub(next_pt, prev_pt))
            u = norm(cross(axis, (0.0, 1.0, 0.0)))
            if abs(dot(axis, (0.0, 1.0, 0.0))) > 0.95:
                u = (1.0, 0.0, 0.0)
            w = cross(axis, u)
            r = radii[i] if isinstance(radii, (list, tuple)) else radii
            ring = []
            for s in range(sides):
                ang = 2.0 * math.pi * s / sides
                ring.append(add3(point, add3(scale3(u, math.cos(ang) * r), scale3(w, math.sin(ang) * r))))
            rings.append(ring)
        for i in range(len(rings) - 1):
            ref = centroid((points[i], points[i + 1]))
            for s in range(sides):
                t = (s + 1) % sides
                self.tri(rings[i][s], rings[i][t], rings[i + 1][t], shade, ref)
                self.tri(rings[i][s], rings[i + 1][t], rings[i + 1][s], shade, ref)
        if cap_start:
            self._fan(rings[0], points[0], sub(points[0], points[1]), shade)
        if cap_end:
            self._fan(rings[-1], points[-1], sub(points[-1], points[-2]), shade)

    def _fan(self, ring, center, outward, shade):
        ref = sub(center, outward)
        for i in range(len(ring)):
            self.tri(ring[i], ring[(i + 1) % len(ring)], center, shade, ref)

    def lathe(self, center, profile, shade, sides=8, depth_scale=1.0):
        """Revolves [(radius, z)] around the vertical through `center`; both ends close."""
        rings = []
        for radius, z in profile:
            ring = []
            for s in range(sides):
                ang = 2.0 * math.pi * (s + 0.5) / sides
                ring.append((center[0] + math.cos(ang) * radius,
                             center[1] + math.sin(ang) * radius * depth_scale,
                             center[2] + z))
            rings.append(ring)
        for i in range(len(rings) - 1):
            for s in range(sides):
                t = (s + 1) % sides
                face = (rings[i][s], rings[i][t], rings[i + 1][t], rings[i + 1][s])
                ref = (center[0], center[1], (face[0][2] + face[3][2]) / 2.0)
                if profile[i + 1][0] > 1e-6 or True:
                    self.tri(face[0], face[1], face[2], shade, ref)
                if profile[i + 1][0] > 1e-6:
                    self.tri(face[0], face[2], face[3], shade, ref)
        z0, z1 = profile[0][1], profile[-1][1]
        if profile[0][0] > 1e-6:
            self._fan(rings[0], add3(center, (0, 0, z0)), (0, 0, z0 - z1), shade)
        if profile[-1][0] > 1e-6:
            self._fan(rings[-1], add3(center, (0, 0, z1)), (0, 0, z1 - z0), shade)

    def box(self, center, size, shade):
        hx, hy, hz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
        c = [add3(center, (sx * hx, sy * hy, sz * hz)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.tri(c[q[0]], c[q[1]], c[q[2]], shade, center)
            self.tri(c[q[0]], c[q[2]], c[q[3]], shade, center)

    def prism(self, outline, y0, y1, shade, center=None):
        """Extrudes an XZ polygon from y0 (front) to y1 (back). The fan assumes it is star-shaped from `center`."""
        n = len(outline)
        cx = center[0] if center else sum(p[0] for p in outline) / n
        cz = center[1] if center else sum(p[1] for p in outline) / n
        area = sum(outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1] for i in range(n))
        order = outline if area > 0 else list(reversed(outline))
        front = [(p[0], y0, p[1]) for p in order]
        back = [(p[0], y1, p[1]) for p in order]
        mid_f, mid_b = (cx, y0, cz), (cx, y1, cz)
        for i in range(n):
            j = (i + 1) % n
            # Winding set by construction: outline is CCW seen from -y, where the camera is.
            self.tri(front[i], front[j], mid_f, shade)
            self.tri(back[j], back[i], mid_b, shade)
            self.tri(front[j], front[i], back[i], shade)
            self.tri(front[j], back[i], back[j], shade)

    def rings(self, rings, shade, close_start=True, close_end=True):
        """Skins equal-sided rings, given in travel order, into a solid."""
        count = len(rings[0])
        centers = [centroid(ring) for ring in rings]
        for i in range(len(rings) - 1):
            ref = centroid((centers[i], centers[i + 1]))
            for s in range(count):
                t = (s + 1) % count
                self.tri(rings[i][s], rings[i][t], rings[i + 1][t], shade, ref)
                self.tri(rings[i][s], rings[i + 1][t], rings[i + 1][s], shade, ref)
        if close_start:
            self._fan(rings[0], centers[0], sub(centers[0], centers[1]), shade)
        if close_end:
            self._fan(rings[-1], centers[-1], sub(centers[-1], centers[-2]), shade)

    # -- whole-mesh -----------------------------------------------------------------------------
    def bounds(self):
        pts = [p for t in self.tris for p in t[:3]]
        return (min(p[0] for p in pts), min(p[1] for p in pts), min(p[2] for p in pts),
                max(p[0] for p in pts), max(p[1] for p in pts), max(p[2] for p in pts))

    def fit(self, w, h, bones=()):
        """Maps the bounding box onto the w x h box exactly, centred on the origin; depth is only centred."""
        x0, y0, z0, x1, y1, z1 = self.bounds()
        sx, sz = w / (x1 - x0), h / (z1 - z0)
        cy = (y0 + y1) / 2.0

        def move(p):
            return (-w / 2.0 + (p[0] - x0) * sx, p[1] - cy, -h / 2.0 + (p[2] - z0) * sz)

        self.tris = [(move(a), move(b), move(c), col, bone, lay) for a, b, c, col, bone, lay in self.tris]
        for bone in bones:
            bone.head = move(bone.head)
        return self


# ---------------------------------------------------------------------------------------------
# Rig and clips
# ---------------------------------------------------------------------------------------------

class Bone:
    def __init__(self, name, head, parent=None):
        self.name, self.head, self.parent = name, head, parent


class Clip:
    """A named action. Values are world-semantic (`rot` is counter-clockwise as seen from the camera)."""

    PROPS = {"tx", "ty", "tz", "rot", "nod", "spin", "sx", "sy", "sz"}

    def __init__(self, name, seconds, loop=True):
        self.name, self.seconds, self.loop = name, seconds, loop
        self.channels = {}

    def keys(self, bone, prop, points):
        if prop not in self.PROPS:
            raise ValueError(prop)
        self.channels[(bone, prop)] = [(t * self.seconds, v) for t, v in points]
        return self

    def wave(self, bone, prop, amp, cycles=1, phase=0.0, base=0.0, samples=None):
        """base + amp * sin over the clip; whole `cycles` make it loop without a seam."""
        n = samples or max(8, 8 * cycles)
        pts = [(i / n, base + amp * math.sin(2.0 * math.pi * (cycles * i / n + phase))) for i in range(n + 1)]
        return self.keys(bone, prop, pts)


# ---------------------------------------------------------------------------------------------
# Asset record and export
# ---------------------------------------------------------------------------------------------

class Asset:
    def __init__(self, name, kind, zone, w, h, mesh, bones=(), clips=(), **meta):
        self.name, self.kind, self.zone, self.w, self.h = name, kind, zone, w, h
        self.mesh, self.bones, self.clips, self.meta = mesh, list(bones), list(clips), meta


def _reset_scene():
    bpy.data.batch_remove(list(bpy.data.objects) + list(bpy.data.meshes) + list(bpy.data.armatures)
                          + list(bpy.data.actions) + list(bpy.data.materials))
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 0, 1
    scene.frame_set(0)


def _material(layer):
    mat = bpy.data.materials.new({"glass": "db_glass", "contour": "db_contour"}.get(layer, "db_flat"))
    mat.use_nodes = True
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if layer == "contour":
        # Unshaded so the rim is one even line all the way round: lit, an inverted hull goes dark on one side.
        bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
        bsdf.inputs["Emission Color"].default_value = (*to_linear(mix(Z1["foam"], WHITE, 0.5)), 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
        return mat
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85 if layer != "glass" else 0.3
    bsdf.inputs["Metallic"].default_value = 0.0
    if layer == "glass":
        bsdf.inputs["Alpha"].default_value = 0.45
        mat.surface_render_method = "BLENDED"
    return mat


def _mesh_object(name, tris, layer, bone_names):
    verts, faces, colors, groups = [], [], [], {}
    for a, b, c, col, bone, _lay in tris:
        base = len(verts)
        verts += [scale3(a, PX), scale3(b, PX), scale3(c, PX)]
        faces.append((base, base + 1, base + 2))
        colors.append(to_linear(col))
        if bone is not None:
            groups.setdefault(bone, []).extend((base, base + 1, base + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    data = attr.data
    for poly, col in zip(mesh.polygons, colors):
        for loop in poly.loop_indices:
            data[loop].color = (col[0], col[1], col[2], 1.0)
    mesh.materials.append(_material(layer))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for bone in bone_names:
        group = obj.vertex_groups.new(name=bone)
        if bone in groups:
            group.add(groups[bone], 1.0, "REPLACE")
    return obj


def _armature(asset):
    data = bpy.data.armatures.new(asset.name + "_rig")
    arm = bpy.data.objects.new(asset.name + "_rig", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for bone in asset.bones:
        edit = data.edit_bones.new(bone.name)
        edit.head = scale3(bone.head, PX)
        # Every bone points up with no roll, so bone-local axes are: x = world x, y = world z, z = -world y.
        edit.tail = add3(edit.head, (0.0, 0.0, 0.2))
        edit.roll = 0.0
        if bone.parent:
            edit.parent = made[bone.parent]
        made[bone.name] = edit
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def _bake_clip(arm, clip):
    action = bpy.data.actions.new(clip.name)
    arm.animation_data.action = action
    last = 0
    for (bone_name, prop), points in sorted(clip.channels.items()):
        pose = arm.pose.bones[bone_name]
        pose.rotation_mode = "XYZ"
        for seconds, value in points:
            frame = round(seconds * FPS)
            last = max(last, frame)
            if prop in ("tx", "ty", "tz"):
                loc = {"tx": (0, value * PX), "tz": (1, value * PX), "ty": (2, -value * PX)}[prop]
                pose.location[loc[0]] = loc[1]
                pose.keyframe_insert("location", index=loc[0], frame=frame)
            elif prop in ("rot", "nod", "spin"):
                # rot: around the camera axis (local z); nod: around world x (local x); spin: around up (local y).
                idx = {"rot": 2, "nod": 0, "spin": 1}[prop]
                pose.rotation_euler[idx] = math.radians(value)
                pose.keyframe_insert("rotation_euler", index=idx, frame=frame)
            else:
                idx = {"sx": 0, "sz": 1, "sy": 2}[prop]
                pose.scale[idx] = value
                pose.keyframe_insert("scale", index=idx, frame=frame)
    track = arm.animation_data.nla_tracks.new()
    track.name = clip.name
    track.mute = True
    track.strips.new(clip.name, 0, action)
    arm.animation_data.action = None
    for pose in arm.pose.bones:
        pose.location = (0.0, 0.0, 0.0)
        pose.rotation_euler = (0.0, 0.0, 0.0)
        pose.scale = (1.0, 1.0, 1.0)
    return last


def export_asset(asset):
    """Writes <name>.glb and returns its manifest entry."""
    _reset_scene()
    prefs = bpy.context.preferences.edit
    prefs.keyframe_new_interpolation_type = "LINEAR"
    layers = sorted({t[5] for t in asset.mesh.tris})
    bone_names = [b.name for b in asset.bones]
    meshes = []
    for layer in layers:
        tris = [t for t in asset.mesh.tris if t[5] == layer]
        suffix = "" if len(layers) == 1 else f"_{layer}"
        meshes.append(_mesh_object(asset.name + suffix, tris, layer, bone_names))
    objects = list(meshes)
    if asset.bones:
        arm = _armature(asset)
        for obj in meshes:
            obj.parent = arm
            mod = obj.modifiers.new("skin", "ARMATURE")
            mod.object = arm
        arm.animation_data_create()
        for clip in asset.clips:
            _bake_clip(arm, clip)
        objects.append(arm)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[-1]

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = MODELS_DIR / f"{asset.name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_vertex_color="MATERIAL",
        export_cameras=False,
        export_lights=False,
        export_animations=bool(asset.clips),
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_force_sampling=True,
        export_frame_step=2,
        export_optimize_animation_size=True,
        export_skins=bool(asset.bones),
        export_morph=False,
        export_extras=False,
    )
    entry = {
        "name": asset.name,
        "file": path.name,
        "kind": asset.kind,
        "zone": asset.zone,
        "size": {"w": asset.w, "h": asset.h},
        "animations": [{"name": c.name, "seconds": c.seconds, "loop": c.loop} for c in asset.clips],
        "tris": len(asset.mesh.tris),
        "bytes": path.stat().st_size,
    }
    entry.update(asset.meta)
    return entry
