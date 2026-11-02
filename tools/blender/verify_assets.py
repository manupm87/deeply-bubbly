"""Checks the exported files themselves, not the generator's intentions. Standard library only.

    python tools/blender/verify_assets.py

For every manifest entry: the glb's real bounding box equals the declared size, it has vertex colours,
no textures, the declared animations and no others, each animation moves something; and for tilesets the
seam rings of cap, mid and cap are the same points. Exit code 1 on any failure.
"""
import json
import struct
import sys
from pathlib import Path

MODELS = Path(__file__).resolve().parents[2] / "apps" / "web3d" / "public" / "models"
TOLERANCE_PX = 0.01
DEPTH_TOLERANCE_PX = 1.5  # Depth has no collision meaning and seams fix it on tiles, so it only has to be about centred.
PX = 0.1
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
FORMATS = {5126: "f", 5123: "H", 5125: "I", 5121: "B"}


def load(path):
    raw = path.read_bytes()
    magic, _version, _length = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67:
        raise ValueError("not a glb")
    json_len = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_len].decode("utf-8"))
    bin_start = 20 + json_len + 8
    return doc, raw[bin_start:]


def read_accessor(doc, blob, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    fmt = FORMATS[acc["componentType"]]
    n = COMPONENTS[acc["type"]]
    size = struct.calcsize("<" + fmt) * n
    stride = view.get("byteStride", size)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return [struct.unpack_from(f"<{n}{fmt}", blob, start + i * stride) for i in range(acc["count"])]


def positions(doc, blob):
    pts = []
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            pts += read_accessor(doc, blob, prim["attributes"]["POSITION"])
    return pts


def seam(points, axis, value):
    """Points on a seam plane, rounded and de-duplicated. axis: 0 = x, 1 = y (glTF up)."""
    return {(round(p[(axis + 1) % 3], 3), round(p[(axis + 2) % 3], 3)) for p in points if abs(p[axis] - value) < 1e-4}


def main():
    manifest = json.loads((MODELS / "manifest.json").read_text(encoding="utf-8"))
    failures = []
    total = 0
    worst_calls = 0
    points_by_name = {}
    for entry in manifest["assets"]:
        name = entry["name"]
        path = MODELS / entry["file"]
        total += path.stat().st_size
        if path.stat().st_size != entry["bytes"]:
            failures.append(f"{name}: bytes in manifest are stale")
        doc, blob = load(path)
        pts = positions(doc, blob)
        points_by_name[name] = pts
        for axis, key in ((0, "w"), (1, "h")):
            low, high = min(p[axis] for p in pts) / PX, max(p[axis] for p in pts) / PX
            want = entry["size"][key]
            if abs(low + want / 2.0) > TOLERANCE_PX or abs(high - want / 2.0) > TOLERANCE_PX:
                failures.append(f"{name}: {key} spans [{low:.3f}, {high:.3f}], expected +-{want / 2.0}")
        low, high = min(p[2] for p in pts) / PX, max(p[2] for p in pts) / PX
        if abs(low + high) / 2.0 > DEPTH_TOLERANCE_PX:
            failures.append(f"{name}: depth not centred on Z = 0 ([{low:.3f}, {high:.3f}])")
        if doc.get("images") or doc.get("textures"):
            failures.append(f"{name}: has textures")
        calls = sum(len(m["primitives"]) for m in doc["meshes"])
        worst_calls = max(worst_calls, calls)
        for mesh in doc["meshes"]:
            for prim in mesh["primitives"]:
                if "COLOR_0" not in prim["attributes"] and doc["materials"][prim["material"]]["name"] != "db_contour":
                    failures.append(f"{name}: primitive without COLOR_0")
        for node in doc["nodes"]:
            if "translation" in node and "skin" not in node and "children" not in node and "mesh" in node:
                if any(abs(v) > 1e-6 for v in node["translation"]):
                    failures.append(f"{name}: mesh node off the origin")
        want_anims = sorted(a["name"] for a in entry["animations"])
        got_anims = sorted(a["name"] for a in doc.get("animations", []))
        if want_anims != got_anims:
            failures.append(f"{name}: animations {got_anims}, manifest says {want_anims}")
        for anim in doc.get("animations", []):
            moved = False
            for sampler in anim["samplers"]:
                values = read_accessor(doc, blob, sampler["output"])
                if any(abs(a - b) > 1e-4 for a, b in zip(min(values), max(values))) or len({tuple(round(c, 4) for c in v) for v in values}) > 1:
                    moved = True
                    break
            if not moved:
                failures.append(f"{name}: animation {anim['name']} moves nothing")
    for stem, entry in sorted({e["tileset"]: e for e in manifest["assets"] if "tileset" in e}.items()):
        first, second, axis, half_cap, half_mid = None, None, None, None, None
        if entry["kind"] == "ledge":
            first, second, axis = f"{stem}_cap_l", f"{stem}_cap_r", 0
            half_cap, half_mid = manifest["tilesets"]["ledge"]["capW"] / 2.0, manifest["tilesets"]["ledge"]["midW"] / 2.0
        else:
            first, second, axis = f"{stem}_cap_bottom", f"{stem}_cap_top", 1
            half_cap, half_mid = manifest["tilesets"]["wall"]["capH"] / 2.0, manifest["tilesets"]["wall"]["midH"] / 2.0
        mid = points_by_name[f"{stem}_mid"]
        checks = ((first, half_cap * PX, -half_mid * PX), (f"{stem}_mid", half_mid * PX, -half_mid * PX), (second, -half_cap * PX, half_mid * PX))
        for name, own, other in checks:
            own_set = seam(points_by_name[name], axis, own)
            mid_set = seam(mid, axis, other)
            if not own_set or own_set != mid_set:
                failures.append(f"{stem}: seam of {name} does not match mid ({len(own_set)} vs {len(mid_set)} points)")
    print(f"assets={len(manifest['assets'])} bytes={total} ({total / 1048576:.2f} MB) max draw calls per asset={worst_calls}")
    if total > manifest["budgetBytes"]:
        failures.append(f"over budget: {total}")
    for failure in failures:
        print("FAIL", failure)
    print("OK" if not failures else f"{len(failures)} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
