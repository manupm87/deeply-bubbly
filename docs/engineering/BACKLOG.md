# Backlog técnico

Deudas conocidas y decisiones pendientes, con la sección del GDD que las gobierna. Se actualiza al cerrar cada workflow.

## Núcleo (`packages/core`)

| # | Tema | Detalle | Ref. GDD |
|---|---|---|---|
| C1 | ~~Misericordia no reduce densidad~~ **Hecho** (2026-09-06): `level/mercy.ts` + `WorldStreamer.bindRun()`, retirada determinista de peligros y bolsas extra. | §4.2.3, §11.5.8 |
| C2 | **Radio cambia en la frontera de zona, no en la estación** | `bubbleStep` usa `radiusForZone(zone)` por profundidad; el GDD dice que el cambio de presión ocurre dentro de la estación. Invisible en Z1 (una sola zona). Decidir antes del contenido de Z2: "zona de presión" fijada en estación y validador coherente. | §2.6, §3.3, §11.4 |
| C3 | **Cálculo de impulso duplicado** | `game/aimPreview.ts (holdImpulse)` repite la fórmula de `bubbleStep.launch`. Exportar la regla desde `bubble/` y usarla en ambos. Un test asegura que coinciden mientras tanto. | §11.4 |
| C4 | **Modo Abismo: estaciones siguen siendo checkpoint** | Fuera del MVP. Cuando entre Abismo, `run/respawn.ts` debe ignorar estaciones en ese modo. | §3.1, §12.2 |
| C5 | **`restart()` no reinicia pickups consumidos** | Deliberado (evita farmear perlas). Revisar cuando exista economía real. | §6 |
| C7 | **Corriente como verbo** | Con `DAMPING_X = 0,30` una banda desplaza ~25 px por tiro: la corriente se nota pero nunca es un muro. Si el playtest pide que sea obligatoria, subir el vector o bajar la amortiguación horizontal (afecta al encadenado de paredes de Z6). | §3.2, §5 nº 8 |
| C8 | **Pulpa y Zona 3** | Jefe de Z2 fuera del MVP (H3). Z3 en greybox pendiente: reinflar, banco migratorio, señuelo, medusa fría, Kalamar. | §3.2, §12 |
| C6 | Ensamblador procedural | Solo existe el validador; el generador (§11.5 reglas 2, 3, 7, 12) es H3. | §4.1, §11.5 |

## Shell (`apps/web`)

| # | Tema | Detalle | Ref. GDD |
|---|---|---|---|
| S1 | **Zoom punch y zoom-out de carga eliminados** | Ambos multiplican el zoom de cámara por una fracción y rompen el muestreo entero del pixel art. Decidir: aceptar zoom fraccionario 100-200 ms, o sustituir por otro efecto (p. ej. desplazamiento de 1 px + destello). | §7 vs §8 |
| S2 | **Zoom 1 en ventanas de escritorio bajas** | Con `zoom = min(floor(w/180), floor(h/320))`, una ventana de 900×600 da zoom 1 (180×420 css px). Es lo que dicta §8; valorar un modo escritorio con marco. | §8 |
| S3 | Sonido | Todo es síntesis Web Audio; sin música. Muestras reales y capas musicales en H3. | §7 |
| S4 | Tutorial | Mano fantasma implementada; falta validar con jugadores que no se confunde con "otra Bur". | §8 |
| S5 | Idioma | Cadenas en `ui/strings.ts` (es/en por `navigator.language`). El navegador headless muestra inglés; en un móvil en español saldrá español. | §0 pilar 5 |
| S6 | Puntos de trayectoria | El número lo dicta core (`TRAJECTORY_DOTS`); el espaciado a veces se ve escaso en arcos largos. Ajustar en playtest. | §2.7 |

## Producto

- Arte final Z1 y pipeline de generación (ver conversación 2026-09-05: ComfyUI/FLUX local en la RTX 5090, aplazado hasta que sea necesario).
- Playtest con jugadores (criterios §12.3) tras el primer jugable.
