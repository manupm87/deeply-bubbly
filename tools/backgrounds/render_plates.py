"""Renders the real gameplay GLBs at true scale to transparent 180 x 390 design px plates, for review.py only.

    blender --background --factory-startup --python tools/backgrounds/render_plates.py -- RAW_DIR
"""
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
import bpy  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import LAYOUTS  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
MODELS = REPO / "apps" / "web3d" / "public" / "models"
ASSETS = {e["name"]: e for e in json.loads((MODELS / "manifest.json").read_text(encoding="utf-8"))["assets"]}
PX = 0.1
SCALE = 4
VIEW = (180, 390)


def wire(mat, obj):
    if obj.type != "MESH" or not obj.data.color_attributes:
        return
    tree = mat.node_tree
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None or bsdf.inputs["Base Color"].is_linked:
        return
    attr = tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = obj.data.color_attributes[0].name
    tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])


def place(name, x, y):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(MODELS / ASSETS[name]["file"]), loglevel=50)
    made = [o for o in bpy.data.objects if o not in before]
    for obj in made:
        for slot in obj.material_slots:
            if slot.material:
                wire(slot.material, obj)
        if obj.type == "ARMATURE":
            if obj.animation_data:
                for track in list(obj.animation_data.nla_tracks):
                    obj.animation_data.nla_tracks.remove(track)
                obj.animation_data.action = None
            for pose in obj.pose.bones:
                pose.rotation_mode = "QUATERNION"
                pose.location, pose.scale, pose.rotation_quaternion = (0, 0, 0), (1, 1, 1), (1, 0, 0, 0)
    root = bpy.data.objects.new("root", None)
    bpy.context.scene.collection.objects.link(root)
    for obj in made:
        if obj.parent is None:
            obj.parent = root
    root.location = ((x - VIEW[0] / 2) * PX, 0, (VIEW[1] / 2 - y) * PX)


def render(key, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = VIEW[0] * SCALE, VIEW[1] * SCALE
    scene.render.filepath = str(out)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    cam_d = bpy.data.cameras.new("cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = max(VIEW) * PX
    cam_d.clip_start, cam_d.clip_end = 0.1, 1000
    cam = bpy.data.objects.new("cam", cam_d)
    cam.location = (0, -300, 0)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    # Same light as tools/blender/render_sheet.py uses on the review mocks; the ambient stands in for the water.
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.1, 0.25, 0.3, 1)
    scene.world = world
    sun_d = bpy.data.lights.new("sun", "SUN")
    sun_d.energy = 2.2
    sun_d.use_shadow = False
    sun = bpy.data.objects.new("sun", sun_d)
    sun.rotation_euler = (math.radians(55), math.radians(-30), 0)
    scene.collection.objects.link(sun)
    for name, x, y in LAYOUTS[key]:
        place(name, x, y)
    bpy.ops.render.render(write_still=True)


raw = Path(sys.argv[sys.argv.index("--") + 1])
raw.mkdir(parents=True, exist_ok=True)
try:
    for key in LAYOUTS:
        render(key, raw / f"plate_{key}.png")
except Exception:
    import traceback

    traceback.print_exc()
    sys.exit(1)
