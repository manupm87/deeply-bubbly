# Shell web (`apps/web`) — especificación

El shell **no contiene reglas de juego**. Convierte input táctil en `PointerInput`, llama a `GameWorld.update()`, lee `snapshot()` y dibuja. Los `GameEvent` disparan SFX, partículas y HUD.

## Escalado (GDD §8)

- Diseño: **viewport de 180 px de ancho** (`VIEW_W`), altura visible `H = floor(alto_css / zoom)` acotada a [320, 420], `zoom = floor(ancho_css / 180)` (mínimo 1). En escritorio (pantallas anchas) limitar el zoom para que `H` no baje de 320: `zoom = min(floor(w/180), floor(h/320))`.
- **El mundo NO mide 180 px** desde la v1.2 (D3): mide `WORLD_W = 540` y la cámara se desplaza también en X. El shell **coloca** la cámara en `(snapshot.camera.renderX, snapshot.camera.renderY)` (v1.3, D5: incluye el ojeo del minimapa) y nunca calcula el seguimiento, el recorte ni el ojeo: eso es de `core`. El HUD sigue siendo de 180 px (`layout.viewW`), así que cualquier posición de mundo que se pinte en la capa del HUD debe pasar por `pos.x - camera.renderX`. Toda posición de dibujo (fondo, entidades, goma del tirachinas, trayectoria, mano del tutorial, FX) usa `renderX/renderY`; solo la lógica pura de `core` lee `x/y`.
- Phaser: `Scale.RESIZE`, `pixelArt: true`, `roundPixels: true`, `autoRound`, `antialias: false`. La cámara principal usa `setZoom(zoom)` y `setViewport` centrado; el canvas ocupa la pantalla; el fondo fuera del juego es el color del agua de la zona.
- Recalcular en `resize`; llamar `world.setViewHeight(H)` y `world.setViewWidth(viewW)`. Nada del HUD depende de la altura exacta: usar fracciones de `H`.
- Orientación: en landscape mostrar un overlay "gira el móvil" (no se puede forzar orientación en web).
- `visibilitychange`/`blur` → pausa automática.

## Escenas

```
BootScene      genera las texturas procedurales (ver abajo) y arranca GameScene + HudScene, o MapScene si save.unlockedStation >= 0
MapScene       menú principal (v1.3): mapa vertical desplazable, islas por mundo, nodos de nivel; emite 'newRun'; ver docs/design/WORLD-MAP.md
GameScene      mundo: fondo por zona (parallax + paredes de arrecife del mundo), entidades del snapshot, Bur, partículas, trayectoria, goma del tirachinas, anillo de potencia
HudScene       overlay: pips de Aire, cinta de profundidad + metros, pausa; pantallas de estación / fin / pausa; tutorial de primera partida
```

`GameScene.update(time, delta)`: `world.update(delta, pointer)` → `snap = world.snapshot()` → `renderer.sync(snap)` → `fx.consume(snap.events)`. El renderer mantiene un `Map<EntityId, GameObject>` y crea/destruye según el snapshot (pool para partículas).

## Input

- `pointerdown` en cualquier punto → `down=true`, coords en px de diseño **del viewport** (0..180): `x = pointer.x / zoom`, `y = pointer.y / zoom` (relativas al canvas del juego). `pointermove` actualiza. La conversión a coordenadas de mundo (sumar el desplazamiento de cámara en **los dos ejes**) la hace `core` con `game/pointer.ts`, con la cámara congelada durante todo el contacto.
- **Un contacto acaba de dos maneras y hay que distinguirlas** (D2, la única interpretación que hace el shell). Un `pointerup` real es una **suelta**: `down=false` y core decide si es tiro o cancelación. Todo final que el jugador no pidió —pausa automática por `blur`/pestaña oculta/apaisado, `pointercancel`, `GAME_OUT` (un arrastre de 70 px de diseño se sale del canvas con facilidad en un móvil)— es un **aborto**: `PointerAdapter.abort()` baja el dedo *y* llama a `GameWorld.cancelAim()`. Entregarlo como una suelta dispara el tiro: se vuelve de una llamada de teléfono y Bur ya ha salido disparada.
- El shell **no** interpreta el gesto más allá de eso: entrega `{down, x, y}` una vez por frame. El origen congelado, el tirón, el radio de cancelación y el tope de apuntado son reglas y viven en `core`. Botones del HUD capturan el evento y no lo pasan al mundo.
- **El minimapa se traga el toque** (v1.3, D5): igual que un botón del HUD, `pointerdown` en su zona hace `event.stopPropagation()` + borra la muestra compartida (`ui/swallow.ts`), así que `PointerAdapter` nunca lo ve y no arranca ningún tirachinas. Ese puntero se sigue por id: su `pointermove` (aunque salga de la zona **o del lienzo**) convierte css → px de minimapa → mundo con `minimapToWorld` y llama a `world.setPeek(punto)`; su `up`/`upoutside`/`pointercancel`/`blur`/`visibilitychange` llama a `world.setPeek(null)`. Un toque que no se mueve ojea el punto tocado hasta soltar.
- **El tragado está acotado a un contacto** (`ui/swallow.ts`, compartido con `ui/Button.ts`): `PointerInput` es una sola muestra compartida, así que borrar `down` para cualquier dedo que toque el HUD terminaba el gesto del **otro** dedo — y `down = false` con un origen congelado es, para D2, soltar: ir a por el minimapa (o a por la pausa) a mitad de tirón disparaba el tiro. La superficie del HUD pregunta a `ctx.pointerOwner` (`PointerAdapter`, publicado en el contexto mientras está enganchado) si el id que se ha tragado es el que el mundo está leyendo; si no lo es —otro dedo, o un tirón sostenido con la barra espaciadora, que no posee ningún id— no toca la muestra.
- **El minimapa NO se suelta con `GAME_OUT`**: ese evento salta con el dedo todavía apoyado (un arrastre que se sale del lienzo, cosa que ojear hacia arriba hace a diario, con el borde del mapa a 55 px de diseño del borde de la pantalla) y soltar ahí mataba el arrastre para el resto de su vida (el id ya no coincidía y volver al mapa no hacía nada). Un ojeo, al contrario que un tirón, no puede dispararse solo, así que no hay nada que proteger.
- **Al ocultarse el HUD, el ojeo se borra de golpe** con `world.clearPeek()`: con una pantalla o la pausa delante, `GameScene` deja de avanzar el mundo y el regreso del ojeo no puede correr, así que se reanudaría con la vista a 100+ px de Bur deslizándose hasta ella.
- **Dos punteros activos** (`input.activePointers: 2` en `main.ts`, o `scene.input.addPointer(1)`): un dedo puede sostener el minimapa mientras el otro tira. `PointerAdapter` **posee un único id de puntero**: toma el del primer `pointerdown` que le llega (los que empiezan sobre una zona del HUD nunca le llegan), ignora `move`/`up` de cualquier otro id mientras ese contacto siga vivo, y libera la propiedad en `up`/aborto. Publica esa propiedad en `ctx.pointerOwner` (`ownsPointer(id)`) para que el HUD sepa de quién es el toque que se traga.
- **`PointerAdapter.sync()`** (llamado por `GameScene` cada frame, antes de `world.update`) vuelve a leer el puntero que posee: Phaser deja de repartir un evento DOM en cuanto una escena lo consume (`globalTopOnly`) y un evento táctil lleva **todos** los dedos que han cambiado, así que con un dedo apoyado en el minimapa (escena de arriba) el `move` que llevaba también el tirón no llega nunca a `GameScene`. Los objetos `Pointer` sí están actualizados: leerlos ahí es la única muestra que no se puede tragar. Si el dedo poseído sigue apoyado, `sync()` reafirma `down = true`; si se ha levantado sin `pointerup` visible, eso es soltar (no abortar).
- Teclado (solo escritorio, para probar): espacio = mantener, flechas mueven el puntero virtual (que es el tirón). **I/J/K/L** (D5, opcional): mientras se mantiene alguna, el objetivo del ojeo arranca en Bur y se mueve 12 px de diseño por evento en esa dirección (I arriba, K abajo, J izquierda, L derecha); al soltar las cuatro, `setPeek(null)`.

## Arte procedural (no hay assets externos todavía)

Todo el pixel art se genera en `BootScene` con `Phaser.GameObjects.Graphics` → `generateTexture` o `CanvasTexture`, a resolución de diseño (1 px = 1 px de diseño). Paleta Z1 (GDD investigación §02): cian `#3fc1c9`, turquesa `#2a9d8f`, espuma `#e8f6f3`, sol `#f9d56e`, coral `#f26b4f`, roca `#4a5568`, alga `#5fae5a`, medusa `#f7a8d8`. Colores reservados de UI: blanco puro, ámbar `#ffb703`, cian UI `#8ecae6` (nunca en el mundo).

- **Bur**: círculo de radio r con contorno 1 px, brillo 2×1 px arriba-izquierda, dos ojos de 1 px. Squash & stretch vía `scaleX/scaleY` (GDD §7), aura ≥ 8 px de silueta.
- **Repisas**: rectángulo con dithering 2 tonos y línea de brillo de 1 px en la **cara inferior** (la capturable). Materiales: rock, coral, kelp, jelly (translúcido, animada con seno), foam, creature (tortuga: caparazón).
- **Peligros**: erizo (círculo con púas 1 px, naranja rompe-paleta), anémona, Don Hinchón (pez globo que se infla: escala con la fase).
- **Pickups**: burbuja de aire (círculo blanco-azulado 5 px, parpadeo), perla (3 px, brillo), concha.
- **Fondo** (D3): gradiente vertical por zona en 8 bandas y *god rays* (Z1) **fijos a la cámara**; cáusticas en mosaico que se desplazan con el mundo; dos capas lejanas de cabezas de coral dispersas (parallax 0.2 / 0.5) repetidas a lo ancho de todo el mundo; y las **paredes de arrecife del mundo** en `x ≈ 0..40` y `WORLD_W-40..WORLD_W`, a parallax 1 (son los bordes del mundo, no un marco de la columna). En medio de los 540 px no se ve ninguna de las dos: esa agua abierta es intencionada (*Hungry Shark*).

## Feel (GDD §7) — mínimo exigible en el MVP

Squash proporcional a la **potencia del tirón** (1.00→0.78 / 1.22, vibración 12 Hz 3 %), 3 burbujitas orbitando, stretch 1.35 al soltar (120 ms, easeOutElastic), aplastamiento 0.70 al impactar (90 ms), 6–10 partículas al soltar, 12 al impactar, 14 al deshincharse, hitstop 40/90 ms (pausar `world.update` ese tiempo), shake solo en impactos > 400 px/s (2 px, 120 ms), zoom punch 1.02 100 ms al perder Aire (nunca shake), lookahead de cámara 20 px en la dirección del impulso.

Audio: Web Audio API sintetizado (sin ficheros): "glub" 200→600 Hz mapeado a la potencia mientras se apunta, "plop" suave y grave al **cancelar**, pop al soltar (pitch inverso; el doble salto de D1 suena una quinta más agudo), rebote por material con pitch según velocidad ±8 %, nota pentatónica ascendente en coleccionables, "plín" grave en boya. Desbloqueo del AudioContext en el primer `pointerdown`. Silencio total antes.

## HUD (GDD §8)

Banda superior ≤ 12 % de H. Pips 6×6 px arriba-izquierda (los que superan `airMax` atenuados); parpadeo rojo suave con 1 pip. Cinta de profundidad de 8 px a la derecha con marcas de zona y pez-marcador; cifra en metros con `Intl.NumberFormat(navigator.language)`, suavizada ≤ 9 m/frame; raya gris del récord. Pausa arriba-centro, icono 10 px, área táctil 44 pt. Tercio inferior siempre despejado.

Indicador del tirachinas (D2, tres canales redundantes del mismo número): **goma** de 1 px desde el origen congelado (el punto del cristal donde se apoyó el dedo) hasta el dedo, con horquilla en el origen y una **"X"** encima mientras se está dentro del radio de cancelación; **anillo** 0→360° alrededor de Bur con `hud.power` (vacío y atenuado en la zona de cancelación, ámbar si `!aimValid`, rojo suave con 1 pip); **trayectoria** punteada `snapshot.trajectory` reducida a `trajectoryDots` puntos (vacía en la zona de cancelación). Además, mientras Bur va a la deriva y le queda el doble salto de D1, su aura respira suavemente; gastado, nada.

**Minimapa** (v1.3, D5, `ui/Minimap.ts`, propiedad de `HudScene`): dibujado con Phaser Graphics a partir de `snapshot.minimap` cada frame, en `layout.top + layout.bandH + 2`, centrado horizontalmente y recolocado en cada *resize*. Panel `UI.panel` a ~0,55 alpha con borde de 1 px; marcas solo con los colores reservados de UI (blanco, ámbar, cian): repisa capturable = línea/rect cian UI 1 px, incapturable = cian UI a media alpha, peligro = ámbar, coleccionable = blanco 1 px, campo = relleno cian UI a baja alpha, boya/estación = líneas/banda ámbar a baja alpha; Bur = 2×2 blanco dentro de un filo oscuro de 1 px (una forma que ninguna marca tiene: con la vista ojeada lejos, el mapa es el único sitio donde Bur se ve, y un 2×2 blanco a secas se lee igual que un coleccionable) y **sujeta al panel**, porque el modelo da su centro real y Bur sale del mapa siempre que esté más de `MINIMAP_ABOVE_PX` por encima de la cámara viva; marco de la vista = rectángulo blanco 1 px, también recortado al panel. Alpha del conjunto: 1 mientras `bubble.state` es `RESTING` o `AIMING` o hay un ojeo activo, 0,45 el resto del tiempo, con *tween* de ~200 ms. Se oculta junto con el HUD cuando una pantalla o la pausa ocupan la escena. Registrado para e2e con `debug.ts` (`registerDebugButton('minimap', …)`) para que los tests sepan dónde tocar.

Pantallas: **mapa** (v1.3, `MapScene`; ver `docs/design/WORLD-MAP.md`): menú principal, no una pantalla de inicio aparte. Título "Deeply Bubbly" en una banda superior; una fila de islas por mundo (Océano de Ámbar activo, Volcán y Lago Ness bloqueados con candado, wobble de "no" al tocarlos, sin modal); un camino de 18 burbujas-nodo para el Océano de Ámbar, cada tramo teñido con la paleta de su zona (`palette.ts`), la silueta de la ballena al fondo; nodo por estado — sin contenido: gris con "?", bloqueado: candado, disponible: número (brillo si es el más profundo alcanzable), completado: lleno con 0–3 conchas debajo. Objetivos táctiles ≥ 44 pt; desplazable por arrastre (rueda en escritorio); arranca centrado en el nodo `current`. Botón pequeño "Sonido" arriba-derecha. Tocar un nodo disponible/completado emite `'newRun'` con su `startStationIndex`, igual que antes la pantalla de inicio; quien juega por primera vez no la ve nunca (§8: sin modales en la primera partida) y entra directa a la Inmersión 1 — el mapa aparece por primera vez al llegar a la primera estación, y desde ahí el juego arranca siempre en él. También se llega desde «Salir» del menú de pausa y desde el botón «Mapa» de la estación y de la pantalla de campaña completa. **estación** (profundidad, 3 conchas animadas, perlas, botón gigante "Seguir bajando" bajo el pulgar, hueco gris "Perlas dobles" desactivado, y un botón fantasma pequeño "Mapa" → `'toMap'`), **fallo** (700 ms tras deshinchar, mismo layout, "Otra vez"; hueco "Segundo aliento" oculto salvo `run.failCountThisImmersion >= 4`, y aun así desactivado), **pausa** (Seguir, Reiniciar Inmersión, Sonido, Salir → `'toMap'`), **campaña completa** (placeholder, botón → `'toMap'`). Textos en pantalla < 40 palabras en total.

Tutorial de primera partida (< 25 s, sin texto): mano fantasma que se apoya, **arrastra hacia arriba `PULL_MAX_PX`** y suelta (nunca un tiro hacia arriba); se salta con un toque; `save.tutorialDone`.

## Panel de tuning (herramienta nº 1 del proyecto)

Overlay HTML (no Phaser) activado con `?tuning=1` o tecla `T`: sliders para cada número de `DEFAULT_TUNING` (agrupados por prefijo), botón *Reset*, *Export JSON* (descarga/clipboard), *Import*. Cambios → `world.setTuning(createTuning(overrides))`. Muestra además FPS, estado de Bur, Aire, chunk actual y eventos recientes. Debe funcionar en móvil (controles grandes).

## Persistencia

`KeyValueStore` sobre `localStorage` con try/catch (fallback a `MemoryStore`). Ajustes: sonido, **tirachinas largo** (`withLongSling`, ×1,5 de recorrido para la misma potencia), trayectoria asistida, sin temblor, Buceo tranquilo. La bandera persistida sigue llamándose `slowCharge` por compatibilidad del esquema de guardado; solo cambian su etiqueta y su efecto.

## Estructura de archivos

```
apps/web/src/
  main.ts               Phaser.Game config + escalado + bootstrap del GameWorld (testHarness de core o campaña real)
  scale.ts              cálculo de zoom/H y listeners de resize
  input/PointerAdapter.ts
  scenes/BootScene.ts · GameScene.ts · HudScene.ts · MapScene.ts (menú principal, v1.3)
  render/WorldRenderer.ts (sync snapshot→sprites) · BubbleView.ts · EntityViews.ts · Background.ts · reef.ts
  render/Trajectory.ts · ChargeRing.ts (anillo de potencia) · SlingBand.ts (goma + X de cancelación) · ChargeOrbit.ts
  fx/Particles.ts · Juice.ts (squash/stretch/hitstop/shake) · Audio.ts
  ui/Hud.ts · Screens.ts · Tutorial.ts · TuningPanel.ts · Minimap.ts (D5: minimapa del HUD + zona táctil del ojeo)
  ui/soundToggle.ts     el interruptor de sonido, compartido por el menú de pausa y el mapa
  ui/map/               piezas del mapa: geometry.ts (dónde va cada cosa, puro) · mapTextures.ts (arte procedural) ·
                        MapPath.ts (agua por zona, camino, superficie, fosa) · MapNode.ts (un nivel) · WorldIslands.ts (los mundos)
  platform/LocalStorageStore.ts · Telemetry.ts
  debug.ts              registro de botones para e2e; inerte sin `?debug=1` ni build de dev
  palette.ts
```

Cada archivo < 300 líneas. Sin lógica de juego: si necesitas una regla, está en `core` o falta en `core`.
