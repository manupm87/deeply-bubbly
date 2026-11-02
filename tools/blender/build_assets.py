"""Generates every Zone 1 and 2 model plus manifest.json in apps/web3d/public/models/.

    blender --background --factory-startup --python tools/blender/build_assets.py

Anything already in that folder is removed first, so the folder is always exactly what this script makes.
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from creatures import creature_assets  # noqa: E402
from kit import MODELS_DIR, PX, export_asset  # noqa: E402
from ledges import TILESETS_DOC, ledge_assets, wall_assets  # noqa: E402
from props import backdrop_assets, prop_assets  # noqa: E402

BUDGET_BYTES = 8 * 1024 * 1024


def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for old in list(MODELS_DIR.glob("*.glb")) + list(MODELS_DIR.glob("manifest.json")):
        old.unlink()

    assets = creature_assets() + prop_assets() + ledge_assets() + wall_assets() + backdrop_assets()
    assets.sort(key=lambda a: a.name)
    names = [a.name for a in assets]
    if len(set(names)) != len(names):
        raise RuntimeError("duplicate asset name")

    entries = [export_asset(asset) for asset in assets]
    total = sum(e["bytes"] for e in entries)
    manifest = {
        "version": 1,
        "units": {"threePerDesignPx": PX},
        "origin": "centre of the box; +X right, +Y up, play plane at Z = 0",
        "budgetBytes": BUDGET_BYTES,
        "totalBytes": total,
        "tilesets": TILESETS_DOC,
        "tileFormula": "n = max(1, round((L - 2 * cap) / mid)); mid scale along the axis = (L - 2 * cap) / (n * mid)",
        "assets": entries,
    }
    (MODELS_DIR / "manifest.json").write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(f"DB_BUILD assets={len(entries)} total={total} bytes ({total / 1048576:.2f} MB) tris={sum(e['tris'] for e in entries)}")
    if total > BUDGET_BYTES:
        raise RuntimeError(f"over budget: {total} > {BUDGET_BYTES}")


try:
    main()
except Exception:
    import traceback

    traceback.print_exc()
    sys.exit(1)
