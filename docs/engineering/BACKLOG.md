# Backlog técnico

Deudas conocidas y decisiones pendientes, con la sección del GDD que las gobierna. Se actualiza al cerrar cada workflow.

## Núcleo (`packages/core`)

| # | Tema | Detalle | Ref. GDD |
|---|---|---|---|
| C1 | **Misericordia no reduce densidad** | `mercyDensityMul` está calculado pero el streamer/contenido no tiene gancho de densidad de peligros ni inyección de bolsa de aire. Necesita un filtro determinista por `mercyLevel` al instanciar chunks. | §4.2.3, §11.5.8 |
| C2 | **Radio cambia en la frontera de zona, no en la estación** | `bubbleStep` usa `radiusForZone(zone)` por profundidad; el GDD dice que el cambio de presión ocurre dentro de la estación. Invisible en Z1 (una sola zona). Decidir antes del contenido de Z2: "zona de presión" fijada en estación y validador coherente. | §2.6, §3.3, §11.4 |
| C3 | **Cálculo de impulso duplicado** | `game/aimPreview.ts (holdImpulse)` repite la fórmula de `bubbleStep.launch`. Exportar la regla desde `bubble/` y usarla en ambos. Un test asegura que coinciden mientras tanto. | §11.4 |
| C4 | **Modo Abismo: estaciones siguen siendo checkpoint** | Fuera del MVP. Cuando entre Abismo, `run/respawn.ts` debe ignorar estaciones en ese modo. | §3.1, §12.2 |
| C5 | **`restart()` no reinicia pickups consumidos** | Deliberado (evita farmear perlas). Revisar cuando exista economía real. | §6 |
| C6 | Ensamblador procedural | Solo existe el validador; el generador (§11.5 reglas 2, 3, 7, 12) es H3. | §4.1, §11.5 |

## Shell (`apps/web`)

Se rellena al cerrar el workflow del shell.

## Producto

- Arte final Z1 y pipeline de generación (ver conversación 2026-09-05: ComfyUI/FLUX local en la RTX 5090, aplazado hasta que sea necesario).
- Playtest con jugadores (criterios §12.3) tras el primer jugable.
