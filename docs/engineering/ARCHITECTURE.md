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

## Mapa de módulos de `packages/core/src`

```
tuning.ts            Constantes §11.6 (DEFAULT_TUNING congelado, createTuning() para el panel en vivo)
types.ts             Entidades §11.2, estados §11.3, eventos, WorldSnapshot
ports.ts             Interfaces de dependencia + implementaciones no-op / SeededRNG / MemoryStore
math/vec.ts          Vec2, Rect, clamp, smoothK
physics/             forceFields (muestreo de campos) · collision (barrido, moveCircle) · integrator (velocidad, alcance analítico)
control/             charge (curva ^1.30, impulso) · aim (origen congelado, cono, ganancia) · trajectory (predicción con el MISMO integrador)
bubble/              air (única entrada para perder/ganar Aire) · bubbleStep (máquina de estados IDLE/CHARGING/LAUNCHED/RESTING/DEAD)
camera/              cámara de trinquete con banda de retorno
level/               depth (px↔m por zona) · library · campaign (colocación) · streaming (ventana de chunks) · validator (§11.5) · content/z1 (chunks a mano)
run/                 runState (fallos, misericordia) · respawn (cadena a→b→c) · save
game/GameWorld.ts    Fachada que compone todo. Es lo único que usa el shell.
```

Dependencias permitidas (flechas = "importa a"): `game → {bubble, camera, level, run, control, physics}`; `bubble → {physics, control}`; `control/trajectory → physics`; `level/validator → {physics, control}`; todos → `{types, tuning, math, ports}`. **Nunca** al revés, nunca ciclos.

## Convenciones

- **Coordenadas**: x ∈ [0,180], y crece hacia abajo, y=0 superficie. Chunks de 180×240 en coordenadas locales; `instantiateChunk` los lleva a mundo.
- **Tiempo**: la simulación usa `nowMs` propio (suma de pasos fijos), nunca `Date.now()`.
- **Mutación**: los `step*` mutan la entidad que reciben (rendimiento y claridad); las funciones de cálculo (`chargePower`, `computeAim`, `sweepCircleAabb`…) son puras.
- **Eventos**: se devuelven en arrays, nunca se emiten por callbacks desde módulos internos; `GameWorld` los agrega.
- **Tests**: cada módulo lleva `*.test.ts` al lado. Los contratos de §11.7 son la definición de "hecho".
- **Un solo lugar** para cada regla: perder Aire → `bubble/air.ts`; capturar reposo → `bubbleStep`; alcanzabilidad → `validator` usando `trajectory`.
- Código y comentarios en inglés; documentación de producto en español.

## Cómo trabajar

```bash
pnpm install
pnpm dev          # apps/web en http://localhost:5173
pnpm test         # vitest en core
pnpm check        # typecheck + lint + test + build (lo que pasa CI)
```
