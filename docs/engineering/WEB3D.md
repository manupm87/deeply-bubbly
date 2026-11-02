# Deeply Bubbly en 3D (Three.js + assets de Blender)

Rama: `web3d`. Sustituye al plan de Unreal, que quedó bloqueado por la instalación del motor. `apps/web` (Phaser) sigue intacta y publicada hasta que el owner decida.

## Decisiones

Tomadas por Claude con un supuesto razonable (HANDOFF §4).

| Tema | Decisión | Por qué |
|---|---|---|
| Motor | Three.js + Vite en `apps/web3d`, con versión exacta fijada | El más ligero para móvil, carga glTF de forma nativa y usa las mismas herramientas del repo |
| Reglas | `packages/core` sin cambios: el shell solo habla con `GameWorld` | Reutiliza la lógica y sus 830 tests; no hay port que pueda divergir |
| Aspecto | 3D low-poly jugado en un plano, cámara de perfil, vertical | Los assets de Blender piden 3D; todo debe leerse por silueta (GDD pilar 5) |
| Plataforma | Navegador móvil primero, igual que el proyecto; Capacitor sigue valiendo | El plan iOS de `IOS.md` no cambia |
| Alcance | Mapa, zonas 1 y 2, HUD, gesto de tirachinas y ojeo | Es todo el contenido autorado que existe |
| Texto y UI | Capa DOM o Three, a criterio del shell, con los textos de `apps/web/src/ui/strings.ts` | No duplicar decisiones de producto |

## Estructura

```
apps/web3d/                  Shell Three.js (render, input, HUD, FX, audio)
apps/web3d/public/models/    .glb exportados (generados, se versionan)
tools/blender/               Scripts que generan los assets; no se editan .blend a mano
docs/art/review/             Hojas de capturas para revisar
```

## Coordenadas

1 px de diseño = 0,1 unidades de Three y 0,1 m en Blender. `x` del núcleo → +X; `y` del núcleo (abajo) → −Y; el plano de juego es Z = 0, con decorado delante y detrás. La cámara se coloca siempre en `renderX/renderY`. Blender exporta +Y arriba en glTF, con el origen en el centro de la caja de colisión.

## Estilo

Low-poly de caras planas, paleta del GDD §3.2 y `apps/web/src/palette.ts`. Ninguna criatura tiene dientes ni sangre (pilar 4). Bur lleva dos ojos y un brillo, y conserva el suelo de legibilidad de §2.6. Objetivo: 60 fps en un móvil de gama media, con menos de 150 draw calls y sin sombras dinámicas costosas.

## Decorado y luz

`render/Atmosphere.ts` deriva color de agua, niebla, luces y rayos de la profundidad de la cámara: nada guarda estado, así que un reaparecer muestra el mismo mar. `render/Backdrop.ts` compone las piezas `bd_*` en islotes a tres profundidades, instanciados (unas pocas draw calls fijas) y lavados con el color del agua para que nada parezca una repisa. El primer plano de Z2 sale de `wall_z2_reef_mid` y se aclara si Bur se acerca al borde. Los materiales glTF se convierten a Lambert al cargar.

## Herramientas

```bash
node e2e/tools/bot.mjs <dir> [--start=N] [--seconds=240] [--gpu] [--overlay]   # juega con toques reales y hace capturas
node e2e/tools/measure.mjs [--gpu]                                              # tiempo de frame y draw calls por estación
```

Ambas piden `vite preview --port 4174` sobre un build recién hecho. `--overlay` dibuja las cajas de colisión de core sobre los modelos, y `DB_CHROMIUM_PATH` elige el Chromium.
