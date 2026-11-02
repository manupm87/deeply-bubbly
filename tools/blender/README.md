# Assets 3D de las zonas 1 y 2

Todo sale de estos scripts; no se editan `.blend` a mano. Contrato en `docs/engineering/WEB3D.md`.

```bash
BLENDER="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$BLENDER" --background --factory-startup --python tools/blender/build_assets.py   # glb + manifest.json
python tools/blender/verify_assets.py                                              # lee los glb: cajas, juntas, acciones, 8 MB
npx -y tsx tools/blender/verify_core_sizes.ts                                      # recorre el contenido de core contra el manifest
"$BLENDER" --background --factory-startup --python tools/blender/render_sheet.py   # hojas de revisión en docs/art/review/
```

| Fichero | Qué genera |
|---|---|
| `kit.py` | Malla, huesos, acciones y exportación; lee la paleta de `apps/web/src/palette.ts` |
| `ledges.py` | Repisas (`short`, `medium`, `long` y tres piezas para cualquier ancho) y paredes |
| `creatures.py` | Bur y el catálogo §5 |
| `props.py` | Recogibles, boyas, estaciones y decorado |

La generación es determinista: el azar sale de un generador sembrado con el nombre del asset.

## Para el shell

- `size` es la caja en px de diseño, y coincide con la de colisión de core salvo donde `source` empieza por `design:`. Unidades de Three = px × 0,1. Origen en el centro de la caja.
- Tiras: `n = max(1, round((L - 2·cap) / mid))`, y la pieza `mid` se escala `(L - 2·cap) / (n·mid)` a lo largo del eje. `cap` y `mid` están en `tilesets` del manifest.
- Bur se escala con `bubble.radius / 7`; el aura y el suelo de 8 px de §2.6 son cosa del shell.
- Una corona con `growth: 'lip'` es el mismo asset girado 180° sobre Z. Las criaturas con `facing` miran a +X.
- Coste: un draw call por material. Lo normal es 1; las piezas con cristal, 2; Bur y `pickup_aire`, 3.
