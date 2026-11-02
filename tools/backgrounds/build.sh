#!/bin/sh
# Rebuilds every background layer, the manifest and the review images. Usage: build.sh RAW_DIR
set -e
RAW="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
BLENDER="${BLENDER:-C:/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
"$BLENDER" --background --factory-startup --python "$HERE/render_layers.py" -- "$RAW"
"$BLENDER" --background --factory-startup --python "$HERE/render_plates.py" -- "$RAW"
python "$HERE/finish_layers.py" "$RAW"
python "$HERE/review.py" "$RAW"
