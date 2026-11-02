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

`render/Atmosphere.ts` deriva color de agua, niebla y luces de la profundidad de la cámara: nada guarda estado, así que un reaparecer muestra el mismo mar. `render/Parallax.ts` dibuja las capas de `public/backgrounds` (agua, lejos, medio, cerca y rayos) según su manifiesto, con cruce entre zonas; si fallan, queda el degradado. `render/Backdrop.ts` conserva peces, crestas y el primer plano de Z2, que sale de `wall_z2_reef_mid` y se aclara si Bur se acerca al borde. `render/AmbientLife.ts` añade nieve marina, burbujas y bancos lejanos. Los materiales glTF se convierten a Lambert al cargar.

## Saber dónde aterrizar

Las ventanas de aterrizaje reales son estrechas (unos ±5° y ±0,1 de potencia en la primera repisa), así que el shell ayuda sin tocar reglas. `render/shotForecast.ts` vuela el tiro con el mismo `physicsStep` hasta el primer contacto: mientras se apunta, los puntos siguen todo el vuelo, la repisa se ilumina en verde con un fantasma de Bur debajo y el anillo se pone verde; un punto rojo avisa de un peligro armado en ese instante, y sin marca no reposará en ninguna parte. Fuera de pantalla, la vista se inclina con el ojeo (`RunUi.leanTowardsTarget`) y `ui/TargetHint.ts` señala la repisa siguiente. Una repisa móvil solo promete si se suelta al instante. El tutorial reproduce el tiro real de `pickShot` y termina al reposar más abajo; hasta entonces el posadero no expulsa a Bur. A decidir en el playtest: esto sustituye al recorte de puntos de D1 en Z1 y Z2, y dibuja el efecto de las corrientes, que §2.7 dejaba fuera de la guía.

## Herramientas

```bash
node e2e/tools/bot.mjs <dir> [--start=N] [--seconds=240] [--gpu] [--overlay]   # juega con toques reales y hace capturas
node e2e/tools/measure.mjs [--gpu] [--port=4174]                                # tiempo de frame y draw calls por estación
```

Ambas piden `vite preview` sobre un build recién hecho, en el 4174 o en el puerto que indique `--port`. `--overlay` dibuja las cajas de colisión de core sobre los modelos, y `DB_CHROMIUM_PATH` elige el Chromium.
