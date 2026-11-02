"""Renders the review sheets to docs/art/review/ FROM THE EXPORTED GLB FILES, not from generator data, so
what is reviewed is what the shell will load.

    blender --background --factory-startup --python tools/blender/render_sheet.py

contact_sheet.png         everything, on its zone's water colour, with the collision box in green
silhouettes.png           same layout, flat black on white: the pillar 5 test
close_characters.png      Bur, creatures, pickups, buoys, large
close_ledges.png          every ledge and wall piece, large
close_backdrop.png        stations and backdrop, large
actions.png               every action of every animated asset, a moment into its motion
scale_mock.png            pieces at true relative scale in a 180 x 320 px view, per zone
"""
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from kit import MODELS_DIR, PX, REPO, Z1, Z2, to_linear  # noqa: E402

OUT = REPO / "docs" / "art" / "review"
MANIFEST = json.loads((MODELS_DIR / "manifest.json").read_text(encoding="utf-8"))
ASSETS = MANIFEST["assets"]


def clear():
    bpy.data.batch_remove(list(bpy.data.objects) + list(bpy.data.meshes) + list(bpy.data.armatures) + list(bpy.data.actions)
                          + list(bpy.data.materials) + list(bpy.data.curves) + list(bpy.data.cameras) + list(bpy.data.lights))


def emission(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    em = tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*to_linear(color), 1.0)
    tree.links.new(em.outputs[0], out.inputs[0])
    return mat


def import_glb(entry, with_actions=False):
    """Imports a glb and puts it in its bind pose: the importer leaves one of its actions playing."""
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(MODELS_DIR / entry["file"]), loglevel=50)
    made = [o for o in bpy.data.objects if o not in before]
    actions = {}
    for action in bpy.data.actions:
        if action not in before_actions:
            for anim in entry["animations"]:
                if action.name.split(".")[0] == anim["name"]:
                    actions[anim["name"]] = action
    for obj in made:
        for slot in obj.material_slots:
            if slot.material:
                wire_vertex_colour(slot.material, obj)
        if obj.type == "ARMATURE":
            if obj.animation_data:
                for track in list(obj.animation_data.nla_tracks):
                    obj.animation_data.nla_tracks.remove(track)
                obj.animation_data.action = None
            for pose in obj.pose.bones:
                pose.rotation_mode = "QUATERNION"
                pose.location, pose.scale, pose.rotation_quaternion = (0, 0, 0), (1, 1, 1), (1, 0, 0, 0)
    root = bpy.data.objects.new("root_" + entry["name"], None)
    bpy.context.scene.collection.objects.link(root)
    for obj in made:
        if obj.parent is None:
            obj.parent = root
    return (root, made, actions) if with_actions else (root, made)


def wire_vertex_colour(mat, obj):
    """Makes sure the review render shows COLOR_0 whatever the importer chose to do with it."""
    if obj.type != "MESH" or not obj.data.color_attributes:
        return
    tree = mat.node_tree
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None or bsdf.inputs["Base Color"].is_linked:
        return
    attr = tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = obj.data.color_attributes[0].name
    tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])


def plane(name, x, z, w, h, y, mat):
    half_w, half_h = w / 2.0, h / 2.0
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x - half_w, y, z - half_h), (x + half_w, y, z - half_h), (x + half_w, y, z + half_h), (x - half_w, y, z + half_h)], [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def frame_box(name, x, z, w, h, y, thick, mat):
    out = []
    out.append(plane(name + "t", x, z + h / 2.0, w + thick, thick, y, mat))
    out.append(plane(name + "b", x, z - h / 2.0, w + thick, thick, y, mat))
    out.append(plane(name + "l", x - w / 2.0, z, thick, h + thick, y, mat))
    out.append(plane(name + "r", x + w / 2.0, z, thick, h + thick, y, mat))
    return out


def label(text, x, z, size, y, mat):
    curve = bpy.data.curves.new("t", "FONT")
    curve.body = text
    curve.size = size
    curve.align_x = "CENTER"
    obj = bpy.data.objects.new("t", curve)
    obj.location = (x, y, z)
    obj.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    curve.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def setup_render(path, width, height, ortho, center, background=(0.1, 0.1, 0.1)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho
    cam_data.clip_start, cam_data.clip_end = 0.1, 1000
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (center[0], -300, center[1])
    cam.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    world = bpy.data.worlds.get("db") or bpy.data.worlds.new("db")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (*background, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world
    # Roughly what the shell will use: one sun from upper left plus a strong ambient, no shadows.
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 2.2
    sun_data.use_shadow = False
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(55), math.radians(-30), 0.0)
    scene.collection.objects.link(sun)
    return scene


def grid(entries, path, cols, cell, width, silhouette=False, boxes=True, font=0.075):
    clear()
    rows = math.ceil(len(entries) / cols)
    span_w = cols * cell
    span_h = rows * cell
    height = round(width * span_h / span_w)
    bg = (1.0, 1.0, 1.0) if silhouette else (0.02, 0.03, 0.05)
    scene = setup_render(path, width, height, span_w, (span_w / 2.0, -span_h / 2.0), bg)
    black = emission("black", (0.0, 0.0, 0.0))
    green = emission("green", (0.2, 1.0, 0.3))
    white = emission("white", (1.0, 1.0, 1.0))
    water = {0: emission("w0", (0.25, 0.42, 0.5)), 1: emission("w1", Z1["waterBottom"]), 2: emission("w2", Z2["waterBottom"])}
    for i, entry in enumerate(entries):
        cx = (i % cols + 0.5) * cell
        cz = -(i // cols + 0.5) * cell
        w, h = entry["size"]["w"] * PX, entry["size"]["h"] * PX
        fit = cell * 0.78 / max(w, h)
        root, made = import_glb(entry)
        root.location = (cx, 0, cz + cell * 0.05)
        root.scale = (fit, fit, fit)
        if silhouette:
            for obj in made:
                if obj.type == "MESH":
                    obj.data.materials.clear()
                    obj.data.materials.append(black)
        else:
            plane(f"bg{i}", cx, cz, cell * 0.985, cell * 0.985, 60, water[entry["zone"]])
            if boxes:
                frame_box(f"box{i}", cx, cz + cell * 0.05, w * fit, h * fit, -40, cell * 0.006, green)
        caption = f"{entry['name']}\n{entry['size']['w']}x{entry['size']['h']}"
        label(caption, cx, cz - cell * 0.40, cell * font, -45, black if silhouette else white)
    bpy.ops.render.render(write_still=True)
    print("DB_SHEET", path.name, scene.render.resolution_x, scene.render.resolution_y)


def strip_actions(entries, path, width):
    """Each animated asset's actions, a moment into their motion, wrapped into a grid."""
    clear()
    cells = [(entry, a) for entry in entries for a in entry["animations"]]
    cols = 10
    rows = math.ceil(len(cells) / cols)
    cell = 3.0
    span_w, span_h = cols * cell, rows * cell
    setup_render(path, width, round(width * span_h / span_w), max(span_w, span_h), (span_w / 2.0, -span_h / 2.0), (0.02, 0.03, 0.05))
    white = emission("white", (1.0, 1.0, 1.0))
    water = emission("wx", Z1["waterBottom"])
    scene = bpy.context.scene
    for i, (entry, anim) in enumerate(cells):
        cx, cz = (i % cols + 0.5) * cell, -(i // cols + 0.5) * cell
        w, h = entry["size"]["w"] * PX, entry["size"]["h"] * PX
        fit = cell * 0.62 / max(w, h)
        root, made, actions = import_glb(entry, with_actions=True)
        root.location = (cx, 0, cz + cell * 0.06)
        root.scale = (fit, fit, fit)
        plane(f"s{i}", cx, cz, cell * 0.98, cell * 0.98, 60, water)
        label(f"{entry['name']}\n{anim['name']}", cx, cz - cell * 0.40, cell * 0.07, -45, white)
        frame = anim["seconds"] * 30 * (0.25 if anim["loop"] else 0.3)
        freeze_pose(scene, next(o for o in made if o.type == "ARMATURE"), actions[anim["name"]], frame)
    bpy.ops.render.render(write_still=True)
    print("DB_SHEET", path.name)


def freeze_pose(scene, arm, action, frame):
    """Copies the action's pose at `frame` onto the bones, so each armature can hold a different time."""
    data = arm.animation_data_create()
    data.action = action
    if action.slots:
        data.action_slot = action.slots[0]
    scene.frame_set(round(frame))
    bpy.context.view_layer.update()
    saved = [(p.name, p.location.copy(), p.rotation_quaternion.copy(), p.scale.copy()) for p in arm.pose.bones]
    data.action = None
    for name, loc, rot, scl in saved:
        pose = arm.pose.bones[name]
        pose.location, pose.rotation_quaternion, pose.scale = loc, rot, scl
    scene.frame_set(0)


def scale_mock(path, zone, pal):
    """A hand-placed view at true scale. Not a level: it only answers 'do these read at game size?'."""
    clear()
    view_w, view_h = 180 * PX, 320 * PX
    setup_render(path, 540, 960, view_h, (0.0, 0.0), to_linear(pal["waterBottom"]))
    by_name = {e["name"]: e for e in ASSETS}
    z = f"z{zone}"
    if zone == 1:
        layout = [("bd_z1_rock_mound", -40, -130, 40), ("bd_z1_coral_branch", 55, -100, 40), ("bd_z1_seagrass", -70, -90, 30),
                  (f"ledge_{z}_rock_medium", -50, 110, 0), (f"ledge_{z}_coral_short", 60, 60, 0), (f"ledge_{z}_foam_short", -60, 140, 0),
                  ("alga_cinta", 50, -30, 0), ("medusa_farolillo", -30, 20, 0), ("tortuga_paseante", -30, -70, 0),
                  ("peces_payaso", 45, 25, 10), ("pickup_aire", 20, 100, 0), ("pickup_perla", -5, 80, 0), ("pickup_concha", 75, 95, 0),
                  ("bur", -50, 95, 0), ("boya_z1", 60, -80, 0), ("don_hinchon", 5, -125, 0), ("bd_z1_surface_wave", -60, 154, 0),
                  ("bd_z1_surface_wave", 0, 154, 0), ("bd_z1_surface_wave", 60, 154, 0)]
    else:
        layout = [("bd_z2_reef_wall", -112, 30, -30), ("bd_z2_kelp_tall", 65, -80, 40), ("bd_z2_sea_fan", 20, -115, 40),
                  (f"ledge_{z}_rock_medium", 50, 110, 0), (f"ledge_{z}_coral_short", -40, 60, 0), (f"ledge_{z}_kelp_short", 60, 10, 0),
                  ("pulpo_camuflado", -20, -40, 0), ("erizo_coralino", 50, 122, 0), ("anemona_pegajosa", -40, 72, 0),
                  ("pickup_aire", 10, 30, 0), ("pickup_perla", 30, -10, 0), ("pickup_concha", -60, -5, 0), ("bur", 50, 95, 0),
                  ("corriente_mota", -10, -90, 0), ("corriente_mota", 30, -80, 0), ("corriente_mota", -40, -80, 0),
                  ("boya_z2", 65, -40, 0), ("station_z2", -20, -140, 0)]
    for name, x, zz, depth in layout:
        root, _made = import_glb(by_name[name])
        root.location = (x * PX, depth * PX, zz * PX)
    bpy.ops.render.render(write_still=True)
    print("DB_SHEET", path.name)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    order = {"player": 0, "boss": 1, "creature": 2, "hazard": 3, "field": 4, "pickup": 5, "buoy": 6, "station": 7, "ledge": 8, "wall": 9, "backdrop": 10}
    everything = sorted(ASSETS, key=lambda e: (order[e["kind"]], e["zone"], e["name"]))
    characters = [e for e in everything if e["kind"] in ("player", "boss", "creature", "hazard", "field", "pickup", "buoy")]
    ledges = [e for e in everything if e["kind"] in ("ledge", "wall")]
    backdrop = [e for e in everything if e["kind"] in ("station", "backdrop")]
    grid(everything, OUT / "contact_sheet.png", 11, 3.0, 2200, font=0.06)
    grid(everything, OUT / "silhouettes.png", 11, 3.0, 2200, silhouette=True, font=0.06)
    grid(characters, OUT / "close_characters.png", 5, 3.0, 1800)
    grid(ledges, OUT / "close_ledges.png", 8, 3.0, 2000, boxes=True)
    grid(backdrop, OUT / "close_backdrop.png", 5, 3.0, 1800)
    strip_actions([e for e in everything if e["animations"]], OUT / "actions.png", 2000)
    scale_mock(OUT / "scale_mock_z1.png", 1, Z1)
    scale_mock(OUT / "scale_mock_z2.png", 2, Z2)


try:
    main()
except Exception:
    import traceback

    traceback.print_exc()
    sys.exit(1)
