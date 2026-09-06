# Deeply Bubbly — Arquitectura técnica

Fuente normativa de diseño: [`docs/design/GDD.md`](../design/GDD.md) (§11 es la especificación de ingeniería; si algo de este documento la contradice, manda el GDD).

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Lógica de juego | TypeScript estricto, **sin dependencias** (`packages/core`) | Determinismo, tests headless en ms, portable a cualquier motor |
| Render / input | Phaser 3.90 (`apps/web`) | Pixel-art nativo, escenas, input táctil de baja latencia, camino probado a Capacitor |
| Build | Vite 8 | Dev server rápido, build estático compartible por URL |
| Tests | Vitest 5 | Solo en `core`; el shell no tiene reglas de juego |
| Monorepo | pnpm workspaces + Turborepo | Caché de tareas, un solo `pnpm check` |
| Móvil (futuro) | Capacitor (`apps/mobile`) | Envuelve el build de `apps/web`; AdMob vía plugin |

## Regla de oro: `core` no sabe que existe una pantalla

- `packages/core` **no importa** Phaser, PixiJS, Matter, ni usa `window`/`document`/`performance`. ESLint lo prohíbe (`eslint.config.js`).
- La física es propia: integrador semi-implícito a **paso fijo 1/60 s** con acumulador, colisión **círculo barrido contra AABB** (sin tunneling). Toda la geometría son rectángulos.
- `core` depende solo de **puertos** (`ports.ts`): `Clock`, `RNG`, `AdProvider`, `Telemetry`, `KeyValueStore`. El shell los implementa.
- El shell habla **únicamente** con `GameWorld` (`game/GameWorld.ts`): `update(dtMs, pointer)` → `snapshot()`. El snapshot (`WorldSnapshot`) es la única fuente de verdad para dibujar; los `GameEvent` disparan SFX/partículas/háptica.
- Un contacto del dedo termina de dos maneras y el shell tiene que distinguirlas (D2): un `pointerup` de verdad es una **suelta** (`pointer.down = false`, y core decide si es tiro o cancelación), mientras que cualquier final forzado —pausa automática, pérdida de foco, pestaña oculta, `pointercancel`, un arrastre que se sale del canvas— es un **aborto** y se comunica con `GameWorld.cancelAim()`. Pasarlo como una suelta dispararía el tiro que el jugador nunca soltó.

## Mapa de módulos de `packages/core/src`

```
tuning.ts            Constantes §11.6 (DEFAULT_TUNING congelado, createTuning() para el panel en vivo)
types.ts             Entidades §11.2, estados §11.3, eventos, WorldSnapshot
ports.ts             Interfaces de dependencia + implementaciones no-op / SeededRNG / MemoryStore
math/vec.ts          Vec2, Rect, clamp, smoothK
physics/             forceFields (muestreo de campos) · collision (barrido, moveCircle) · integrator (velocidad, alcance analítico)
control/             pull (potencia = distancia de arrastre, impulso; `charge.ts` es un re-export) · aim (origen congelado del dedo, cono a la horizontal) · trajectory (predicción con el MISMO integrador)
bubble/              air (única entrada para perder/ganar Aire) · bubbleStep (máquina de estados IDLE/AIMING/LAUNCHED/RESTING/DEAD, presupuesto de doble salto)
camera/              cámara de trinquete con banda de retorno · peek.ts (ojeo D5: offset de presentación hacia el punto del minimapa; `GameWorld.setPeek` lo pide, `clearPeek` lo borra sin transición cuando el mundo deja de avanzar)
level/               depth (px↔m por zona) · library · campaign (colocación) · streaming (ventana de chunks) · validator (§11.5) ·
                     worlds.ts (mapa del mundo, v1.3: `worlds()`/`amberOcean()` registran mundos y niveles, `levelStatuses()`
                     deriva el estado de cada nodo — sin contenido/bloqueado/disponible/completado, conchas — a partir del save;
                     única fuente de verdad del desbloqueo, `MapScene` solo la pinta)
level/content/       ladder (geometría de la escalera de 540 px: columnas de entrada/salida, cornisa, bandas de arrecife) ·
                     builders (vocabulario de autoría: repisas, fauna del §5) · layout + zoneReport (informes que los tests de zona afirman) ·
                     z1/ y z2/ (los chunks a mano de las zonas 1 y 2)
run/                 runState (fallos, misericordia) · respawn (cadena a→b→c) · save
game/minimap.ts      Modelo puro del minimapa (D5): entidades + cámara → `MinimapModel` en px de minimapa
game/GameWorld.ts    Fachada que compone todo. Es lo único que usa el shell.
game/autoPlayer.ts   Autojugador headless: elige cada tiro con la MISMA búsqueda del validador (§11.5.11) y lo ejecuta
                     como gesto D2. Desde D1/D3/D4 un dedo de cadencia fija falla todos los saltos por diseño, así que es
                     lo que los tests de contenido usan para demostrar que una zona se puede bajar.
```

Dependencias permitidas (flechas = "importa a"): `game → {bubble, camera, level, run, control, physics}`; `bubble → {physics, control}`; `control/trajectory → physics`; `level/validator → {physics, control}`; todos → `{types, tuning, math, ports}`. **Nunca** al revés, nunca ciclos.

## Convenciones

- **Coordenadas**: x ∈ [0, `WORLD_W`] (540 desde DECISIONES v1.2 D3, tres pantallas de `VIEW_W` = 180), y crece hacia abajo, y=0 superficie. Chunks de 540×240 en coordenadas locales; `instantiateChunk` los lleva a mundo (solo desplaza en y). La cámara sigue a Bur también en X con zona muerta y recorte a `[0, WORLD_W − viewW]`; el puerto viewport→mundo es `game/pointer.ts`. **El shell coloca la cámara en `renderX/renderY`** (D5, `camera.x/y + peek`), nunca en `x/y`: son la única posición válida para dibujar. La conversión dedo→mundo incluye el ojeo (`peekX/peekY`, congelado con el resto del contacto) pero no el *lookahead* de §7, que es puramente de dibujo y no afecta a dónde apunta el jugador.
- **Tiempo**: la simulación usa `nowMs` propio (suma de pasos fijos), nunca `Date.now()`.
- **Mutación**: los `step*` mutan la entidad que reciben (rendimiento y claridad); las funciones de cálculo (`pullPower`, `computeAim`, `sweepCircleAabb`…) son puras.
- **Eventos**: se devuelven en arrays, nunca se emiten por callbacks desde módulos internos; `GameWorld` los agrega.
- **Tests**: cada módulo lleva `*.test.ts` al lado. Los contratos de §11.7 son la definición de "hecho".
- **Un solo lugar** para cada regla: perder Aire → `bubble/air.ts`; capturar reposo → `bubbleStep`; alcanzabilidad → `validator` usando `trajectory`;
  **magnitud del impulso** (potencia × presión × aturdimiento × repisa pegajosa × campos) → `control/pull.launchImpulse`, que llaman tanto `bubbleStep.launch` como la guía punteada de `game/aimPreview` — la promesa de §2.7 ("exacta hasta el primer rebote") *es* la afirmación de que las dos coinciden;
  geometría de la escalera de chunks → `level/content/ladder.ts` (una repisa se alcanza cuando `inset + margen <= |Δx| <= 180`, y su ancho da igual).
- Código y comentarios en inglés; documentación de producto en español.

## Cómo trabajar

```bash
pnpm install
pnpm dev          # apps/web en http://localhost:5173
pnpm test         # vitest en core
pnpm check        # typecheck + lint + test + build (lo que pasa CI)
```
