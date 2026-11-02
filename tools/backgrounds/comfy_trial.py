"""Trial of the generative route (FLUX.1 schnell, Apache-2.0) on the running ComfyUI, kept for provenance.

    python tools/backgrounds/comfy_trial.py OUT_DIR

The result was judged against the low-poly assets and rejected; see PROVENANCE.md. Nothing it produces ships.
"""
import json, sys, time, urllib.parse, urllib.request
from pathlib import Path

HOST = "http://127.0.0.1:8188"
CKPT = "flux1-schnell-fp8.safetensors"
NEG = ""
TRIALS = [
    (1101, "stylised low-poly flat-shaded 3D game background, underwater coral reef silhouettes in turquoise haze, cheerful cyan water, faceted triangular rocks, soft god rays, mobile game environment art, side view, no text"),
    (1102, "stylised low-poly flat-shaded 3D game background, tall reef wall in dark turquoise water with coral orange accents, faceted triangular rocks, dusky vibrant, mobile game environment art, side view, no text"),
]

def post(path, body):
    req = urllib.request.Request(HOST + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

def workflow(seed, prompt):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": prompt}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": NEG}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
              "seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "db_bg_trial/t"}},
    }

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
for seed, prompt in TRIALS:
    pid = post("/prompt", {"prompt": workflow(seed, prompt)})["prompt_id"]
    for _ in range(300):
        hist = json.load(urllib.request.urlopen(f"{HOST}/history/{pid}"))
        if pid in hist and hist[pid].get("outputs"):
            break
        time.sleep(2)
    for img in hist[pid]["outputs"]["7"]["images"]:
        q = urllib.parse.urlencode(img)
        (out / f"trial_{seed}.png").write_bytes(urllib.request.urlopen(f"{HOST}/view?{q}").read())
        print("saved", seed)
