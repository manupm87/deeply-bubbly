# Estado del proyecto y forma de trabajar (traspaso entre máquinas)

Última actualización: 2026-09-06, al pasar el desarrollo del PC (WSL2) a un Mac. Este documento es la "memoria" del proyecto: lo que no se deduce del código ni del historial de git. Actualízalo al cerrar cada bloque de trabajo.

## 1. Qué hay publicado

| Dónde | Qué | URL |
|---|---|---|
| `main` | **v1.3**: tirachinas (D1–D4), ojeo con minimapa (D5) y mapa del mundo como menú principal | https://manupm87.github.io/deeply-bubbly/ |
| preview | La rama que diga `PREVIEW_REF` en `.github/workflows/pages.yml` (hoy `v1.3`, igual a `main`) | https://manupm87.github.io/deeply-bubbly/preview/ |

- Pages solo despliega desde `main` (regla del entorno `github-pages`). Para refrescar la preview: `gh workflow run "Deploy to GitHub Pages" --ref main`. Cuando empiece una rama nueva (`v1.4`), cambia `PREVIEW_REF` en `main`.
- Comprobación en vivo de una URL desplegada: `node apps/web/e2e/tools/live-check.mjs <url>` (desde `apps/web`).
- **Nunca** empujar a `main` cambios de tuning o de mundo sin probarlos antes en la preview: `main` va directo al móvil del owner.

## 2. Historia de versiones (resumen)

- **v1.1**: carga por tiempo, mundo de 180 px, Z1 con arte + Z2 en greybox, pantalla de inicio.
- **v1.2** (`docs/design/DECISIONS-v1.2.md` D1–D4, tras el playtest del owner): gesto de tirachinas, lanzar solo desde reposo con un doble salto de pago, mundo de 540 px con cámara en X, menos potencia.
- **v1.3**: D5 ojeo (minimapa arrastrable que desplaza la cámara, `camera/peek.ts` + `game/minimap.ts` + `ui/Minimap.ts`, dos punteros activos) y mapa del mundo (`docs/design/WORLD-MAP.md`, `level/worlds.ts`, `scenes/MapScene.ts`).

## 3. Decisiones que esperan al owner

Se revisarán "más adelante" (palabras del owner, 2026-09-06). Están todas en `docs/engineering/BACKLOG.md`; aquí el índice:

1. **Doble salto**: resuelto en la rama `web3d` (D6: gratis); `main` sigue con el coste.
2. **Chunks**: los 30 rediseñados en la rama `web3d`: objetivo fuera de pantalla del 62 % al 10 % y tramo más largo de 43 a 31,7 s, medido con bot (BACKLOG C12).
3. **Corriente de Z2**: resuelta en la rama `web3d` (`CURRENT_DRIFT` 220 px/s, unos 110 px por vuelo; BACKLOG C7).
4. **Ojeo**: el alcance puede superar `PEEK_UP_PX`/`PEEK_DOWN_PX` cuando la cámara va por delante de los chunks en memoria (se prefirió no enseñar agua sin cargar); grosor de 1 px de los trazos del minimapa.
5. **Mapa**: al completar los 5 niveles el mapa no ofrece reanudar desde la última estación (BACKLOG C11); la pantalla de fallo no tiene botón "Mapa" (BACKLOG S12).

## 4. Cómo se trabaja en este repo

- El owner escribe en español; código y comentarios en inglés; docs y textos en pantalla en español.
- Quiere un **producto funcional presentado**, no brainstorming: se decide con un supuesto razonable, se construye y se deja la decisión anotada para su playtest. Solo se pregunta cuando dos lecturas llevan a trabajo materialmente distinto.
- **Workflows multiagente para todo lo sustancial** (opt-in permanente): implementadores en paralelo con un contrato compartido escrito antes (tipos, constantes, stubs no-op para que el árbol siga verde), un revisor adversario por feature (core: tests `*.adversarial.test.ts`; shell: bots de navegador con capturas), un arreglador con autoridad y una puerta final. Subagentes en Opus/Sonnet, no en Fable.
- Cada feature nueva: tests en `packages/core` + revisión adversaria antes de darla por hecha. `pnpm check` y `pnpm exec playwright test` (en `apps/web`) en verde antes de fusionar.
- Ramas: una por versión (`v1.2`, `v1.3`); se fusiona en `main` con `--no-ff` cuando el owner dice "publica". Si hay agentes trabajando en el árbol y hay que tocar `main`, usar `git worktree add <tmp> main`, nunca `checkout`.

## 5. Trampas conocidas

- **Playwright sirve un `dist` viejo** con `reuseExistingServer`: `fuser -k 4173/tcp` (en Mac: `lsof -ti:4173 | xargs kill`) y reconstruir antes de bots o tests.
- **CI es ~3× más lento** y bajo carga el acumulador de paso fijo descarta tiempo: un test e2e **nunca** debe esperar un tiempo de pared y luego afirmar sobre el reloj de simulación; sondear con `waitForFunction`. Bur reposa ~770 ms tras el arranque: no depender de ese tiempo.
- `vitest` con `testTimeout` de 30 s por CI.
- Multitáctil en CDP: `Input.dispatchTouchEvent` identifica dedos por `id`; `touchEnd` levanta solo los puntos listados (ver `e2e/peek.spec.ts`).
- `pnpm exec prettier --check` está rojo en ~33 ficheros de antes de la config actual; no se reformatea en commits de feature (merece un commit propio).
- Herramientas de bot: `apps/web/e2e/tools/bot.mjs <outdir> ['&start=N']`, `live-check.mjs <url>`, `sheet.mjs`, sondas `*-probe.mjs`.

## 6. Puesta en marcha en una máquina nueva (Mac)

```bash
git clone git@github.com:manupm87/deeply-bubbly.git && cd deeply-bubbly
corepack enable && corepack prepare pnpm@12.3.4 --activate   # o: npm i -g pnpm@12
pnpm install
pnpm check                                                   # typecheck + lint + 830 tests + build
pnpm --filter @deeply-bubbly/web exec playwright install --with-deps chromium
cd apps/web && pnpm exec playwright test                     # 40 specs
pnpm dev                                                     # http://localhost:5173
```

Node 22 o superior. `gh` (GitHub CLI) autenticado para lanzar el despliegue de Pages y leer CI.

## 7. Siguiente paso: app iOS

Plan completo en `docs/engineering/IOS.md`. Resumen: Capacitor en `apps/mobile` envolviendo la build de `apps/web`; primero instalación gratuita en el iPhone del owner desde Xcode con un Apple ID normal (7 días, solo sus dispositivos); cuenta de desarrollador de pago solo cuando toque TestFlight y App Store.

## 8. Shell 3D (`apps/web3d`, rama `web3d`, 2026-11-02)

Contrato en `docs/engineering/WEB3D.md`. Es un shell Three.js completo sobre el mismo `packages/core`: mapa, zonas 1 y 2, HUD, tirachinas, ojeo, FX y audio. Publicado en https://manupm87.github.io/deeply-bubbly/3d/ desde `web3d` (`WEB3D_REF` en `pages.yml` de `main`), junto a `apps/web`, que sigue en la raíz. Para refrescarlo: `gh workflow run "Deploy to GitHub Pages" --ref main`. Capturas en `docs/art/review/gameplay_*.png`.

```bash
pnpm dev:3d                                  # http://localhost:5174
cd apps/web3d && pnpm exec playwright test   # 62 specs, build propia en el puerto 4174
```

- Si Playwright no encuentra su navegador (pide el build 1243 y aquí solo está el 1228): `DB_CHROMIUM_PATH=<chrome.exe>` en `apps/web3d`. La config de `apps/web` no admite esa variable, y con Chromium completo sus specs fallan por el 404 de `/favicon.ico`: usar el `chrome-headless-shell`.
- `apps/web/e2e/screenshots.spec.ts` reescribe capturas versionadas en cada pasada: `git restore apps/web/e2e/__screenshots__` si no se quieren conservar.
- El puerto 4174 también lo usa otro proyecto de esta máquina (`worktrees/spec-1601`). Nunca liberarlo a la fuerza: usar otro con una config temporal de Playwright y `--port` en las herramientas.
- `apps/web/e2e/peek.spec.ts:88` es intermitente (falló 1 de 5 a solas), aunque la suite entera puede pasar.

Pendiente:

- **Core**: `GameWorld.persist` reescribe el save cargado al crear el mundo y deshace ajustes y tutorial cambiados durante la partida. `web3d` lo esquiva volviendo a guardar en `main.ts` y al mostrar la pantalla de fin de campaña. `apps/web` sigue con el fallo.
- **Sin probar**: móvil real, Safari e iOS (incluido reanudar el audio). Los 60 fps del objetivo solo se han medido con la RTX 5090 y CPU ÷4, no en un móvil de gama media.
- **Para el playtest del owner**: las islas de estación aún tienen base plana y pueden parecer repisas; en Z2, a unos 262 m, el bot perdió aire y murió sin causa aclarada; la marca de aterrizaje puede fallar en repisas móviles y peligros con ritmo si se suelta tarde; la guía completa sustituye al recorte de puntos de D1; ojos de `pulpo_camuflado` y bandas de `peces_payaso` retocados a criterio de la revisión; el bloque `bd_z2_reef_wall` aún se ve algo rectangular.
- `e2e/subpath.spec.ts` prueba la build de `/3d/` (`VITE_STORE_PREFIX=3d:`) con un servidor propio.
- Los modelos `bd_*` que ya no se dibujan se siguen descargando, porque el manifiesto lo carga todo.
- `apps/web/src/platform/LocalStorageStore.ts` conserva el fallo que `web3d` ya no tiene: si la telemetría llena la cuota, el save deja de leerse hasta recargar.
