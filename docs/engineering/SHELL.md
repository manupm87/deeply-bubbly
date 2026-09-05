# Shell web (`apps/web`) — especificación

El shell **no contiene reglas de juego**. Convierte input táctil en `PointerInput`, llama a `GameWorld.update()`, lee `snapshot()` y dibuja. Los `GameEvent` disparan SFX, partículas y HUD.

## Escalado (GDD §8)

- Diseño: **180 px de ancho fijos**, altura visible `H = floor(alto_css / zoom)` acotada a [320, 420], `zoom = floor(ancho_css / 180)` (mínimo 1). En escritorio (pantallas anchas) limitar el zoom para que `H` no baje de 320: `zoom = min(floor(w/180), floor(h/320))`.
- Phaser: `Scale.RESIZE`, `pixelArt: true`, `roundPixels: true`, `autoRound`, `antialias: false`. La cámara principal usa `setZoom(zoom)` y `setViewport` centrado; el canvas ocupa la pantalla; el fondo fuera del juego es el color del agua de la zona.
- Recalcular en `resize`; llamar `world.setViewHeight(H)`. Nada del HUD depende de la altura exacta: usar fracciones de `H`.
- Orientación: en landscape mostrar un overlay "gira el móvil" (no se puede forzar orientación en web).
- `visibilitychange`/`blur` → pausa automática.

## Escenas

```
BootScene      genera las texturas procedurales (ver abajo) y arranca GameScene + HudScene
GameScene      mundo: fondo por zona (parallax 3 capas), entidades del snapshot, Bur, partículas, trayectoria, anillo de carga
HudScene       overlay: pips de Aire, cinta de profundidad + metros, pausa; pantallas de estación / fin / pausa; tutorial de primera partida
```

`GameScene.update(time, delta)`: `world.update(delta, pointer)` → `snap = world.snapshot()` → `renderer.sync(snap)` → `fx.consume(snap.events)`. El renderer mantiene un `Map<EntityId, GameObject>` y crea/destruye según el snapshot (pool para partículas).

## Input

- `pointerdown` en cualquier punto → `down=true`, coords en px de diseño del viewport: `x = pointer.x / zoom`, `y = pointer.y / zoom` (relativas al canvas del juego). `pointermove` actualiza; `pointerup`/`pointercancel`/`pointerout` → `down=false`.
- El shell **no** interpreta el gesto: solo entrega `{down, x, y}` una vez por frame. Botones del HUD capturan el evento y no lo pasan al mundo.
- Teclado (solo escritorio, para probar): espacio = mantener, flechas ajustan el ángulo moviendo un puntero virtual.

## Arte procedural (no hay assets externos todavía)

Todo el pixel art se genera en `BootScene` con `Phaser.GameObjects.Graphics` → `generateTexture` o `CanvasTexture`, a resolución de diseño (1 px = 1 px de diseño). Paleta Z1 (GDD investigación §02): cian `#3fc1c9`, turquesa `#2a9d8f`, espuma `#e8f6f3`, sol `#f9d56e`, coral `#f26b4f`, roca `#4a5568`, alga `#5fae5a`, medusa `#f7a8d8`. Colores reservados de UI: blanco puro, ámbar `#ffb703`, cian UI `#8ecae6` (nunca en el mundo).

- **Bur**: círculo de radio r con contorno 1 px, brillo 2×1 px arriba-izquierda, dos ojos de 1 px. Squash & stretch vía `scaleX/scaleY` (GDD §7), aura ≥ 8 px de silueta.
- **Repisas**: rectángulo con dithering 2 tonos y línea de brillo de 1 px en la **cara inferior** (la capturable). Materiales: rock, coral, kelp, jelly (translúcido, animada con seno), foam, creature (tortuga: caparazón).
- **Peligros**: erizo (círculo con púas 1 px, naranja rompe-paleta), anémona, Don Hinchón (pez globo que se infla: escala con la fase).
- **Pickups**: burbuja de aire (círculo blanco-azulado 5 px, parpadeo), perla (3 px, brillo), concha.
- **Fondo**: gradiente vertical por zona en 8 bandas, *god rays* (Z1) con alpha animada, 3 capas de parallax (0.2 / 0.5 / 1.0) con siluetas.

## Feel (GDD §7) — mínimo exigible en el MVP

Squash al cargar (1.00→0.78 / 1.22, vibración 12 Hz 3 %), 3 burbujitas orbitando, stretch 1.35 al soltar (120 ms, easeOutElastic), aplastamiento 0.70 al impactar (90 ms), 6–10 partículas al soltar, 12 al impactar, 14 al deshincharse, hitstop 40/90 ms (pausar `world.update` ese tiempo), shake solo en impactos > 400 px/s (2 px, 120 ms), zoom punch 1.02 100 ms al perder Aire (nunca shake), lookahead de cámara 20 px en la dirección del impulso.

Audio: Web Audio API sintetizado (sin ficheros): "glub" 200→600 Hz mapeado a potencia mientras carga, pop al soltar (pitch inverso), rebote por material con pitch según velocidad ±8 %, nota pentatónica ascendente en coleccionables, "plín" grave en boya. Desbloqueo del AudioContext en el primer `pointerdown`. Silencio total antes.

## HUD (GDD §8)

Banda superior ≤ 12 % de H. Pips 6×6 px arriba-izquierda (los que superan `airMax` atenuados); parpadeo rojo suave con 1 pip. Cinta de profundidad de 8 px a la derecha con marcas de zona y pez-marcador; cifra en metros con `Intl.NumberFormat(navigator.language)`, suavizada ≤ 9 m/frame; raya gris del récord. Pausa arriba-centro, icono 10 px, área táctil 44 pt. Tercio inferior siempre despejado.

Indicador de carga: anillo 0→360° alrededor de Bur, grosor = ajuste fino, ámbar palpitante en sobrecarga, rojo suave con 1 pip. Trayectoria punteada `snapshot.trajectory` reducida a `trajectoryDots` puntos.

Pantallas: **estación** (profundidad, 3 conchas animadas, perlas, botón gigante "Seguir bajando" bajo el pulgar, hueco gris "Perlas dobles" desactivado), **fallo** (700 ms tras deshinchar, mismo layout, "Otra vez"; hueco "Segundo aliento" oculto salvo `run.failCountThisImmersion >= 4`, y aun así desactivado), **pausa** (Seguir, Reiniciar Inmersión, Sonido, Salir), **campaña completa** (placeholder). Textos en pantalla < 40 palabras en total.

Tutorial de primera partida (< 25 s, sin texto): mano fantasma que mantiene ≤ 700 ms y suelta; se salta con un toque; `save.tutorialDone`.

## Panel de tuning (herramienta nº 1 del proyecto)

Overlay HTML (no Phaser) activado con `?tuning=1` o tecla `T`: sliders para cada número de `DEFAULT_TUNING` (agrupados por prefijo), botón *Reset*, *Export JSON* (descarga/clipboard), *Import*. Cambios → `world.setTuning(createTuning(overrides))`. Muestra además FPS, estado de Bur, Aire, chunk actual y eventos recientes. Debe funcionar en móvil (controles grandes).

## Persistencia

`KeyValueStore` sobre `localStorage` con try/catch (fallback a `MemoryStore`). Ajustes: sonido, carga lenta, trayectoria asistida, sin temblor, Buceo tranquilo.

## Estructura de archivos

```
apps/web/src/
  main.ts               Phaser.Game config + escalado + bootstrap del GameWorld (testHarness de core o campaña real)
  scale.ts              cálculo de zoom/H y listeners de resize
  input/PointerAdapter.ts
  scenes/BootScene.ts · GameScene.ts · HudScene.ts
  render/WorldRenderer.ts (sync snapshot→sprites) · BubbleView.ts · EntityViews.ts · Background.ts · Trajectory.ts
  fx/Particles.ts · Juice.ts (squash/stretch/hitstop/shake) · Audio.ts
  ui/Hud.ts · Screens.ts · Tutorial.ts · TuningPanel.ts
  platform/LocalStorageStore.ts · Telemetry.ts
  palette.ts
```

Cada archivo < 300 líneas. Sin lógica de juego: si necesitas una regla, está en `core` o falta en `core`.
