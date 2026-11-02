# Parallax backgrounds: provenance

## What ships

Nothing in `apps/web3d/public/backgrounds/` comes from a generative model. No model weights touched any shipped pixel.

| Layers | Made by | Licence position |
|---|---|---|
| `z*_far`, `z*_mid`, `z*_near` | Procedural low-poly geometry (`render_layers.py`), rendered with Blender 5.2 Cycles in background mode | Blender's GPL covers Blender, not what it renders. The scripts and the output belong to this project |
| `z*_water`, `z*_rays` | Painted procedurally with Pillow and numpy (`finish_layers.py`) | Same: project-owned output |

Seeds are in `config.py`: 1100 to 1104 for Zone 1 and 2100 to 2104 for Zone 2. The Blender scene needs no external asset. The Cycles render is deterministic in geometry; path-tracing noise may differ slightly by GPU.

`docs/art/review/parallax_*.png` also shows the real game GLBs from `apps/web3d/public/models`, as review plates only.

## Generative route: tried and rejected

Run on the local ComfyUI by `comfy_trial.py`. No model was downloaded; this one was already installed. The outputs were written to ComfyUI's output folder under `db_bg_trial/`, and none of them ships.

| Field | Value |
|---|---|
| Model | `flux1-schnell-fp8.safetensors` (FLUX.1 [schnell], Black Forest Labs) |
| Licence | Apache-2.0, permits commercial use |
| Settings | 832 x 1216, 4 steps, euler / simple, cfg 1.0 |
| Seed 1101 | "stylised low-poly flat-shaded 3D game background, underwater coral reef silhouettes in turquoise haze, cheerful cyan water, faceted triangular rocks, soft god rays, mobile game environment art, side view, no text" |
| Seed 1102 | "stylised low-poly flat-shaded 3D game background, tall reef wall in dark turquoise water with coral orange accents, faceted triangular rocks, dusky vibrant, mobile game environment art, side view, no text" |

Why it was rejected:

- The images are full scenes with no alpha and no way to tile, and the installed nodes offer no circular padding.
- The palette drifted away from GDD 3.2: violet rock in one, a salmon sky and a waterline in the other.
- Facets did not match the flat-shaded GLBs.

What it did contribute is an idea, not pixels: tall chiselled shards with bright top faces, which is why the rocks are convex hulls of random points.

## Reproduce

    sh tools/backgrounds/build.sh RAW_DIR

`RAW_DIR` is any scratch folder for intermediate PNGs. Needs Blender 5.2 and Python with Pillow and numpy.
