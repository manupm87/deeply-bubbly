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

1. **Doble salto**: gratis o cuesta 1 pip (`AIR_LAUNCH_COST`). Recomendado gratis: un tiro fallido con coste son ~6 s flotando hasta la resaca.
2. **Rediseñar los 30 chunks** con 3 anclajes más profundos y `MAX_HOP_X_PX` ≈ 120: hoy el 62 % de los objetivos quedan fuera de pantalla y los tramos entre boyas (37–43 s) superan los 35 s del pilar 3.
3. **Corriente de Z2** demasiado débil para ser un verbo (~25 px por tiro; BACKLOG C7).
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
