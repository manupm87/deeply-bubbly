# Menú principal: el mapa del mundo (v1.3)

Fecha: 2026-09-06. Estado: **aprobado por el owner el 2026-09-06** (respuestas por defecto de §6); **implementado en v1.3**. Origen: el owner quiere un menú principal con mapa del mundo al estilo *Super Mario Bros.*, con los niveles que ya existen desbloqueados, los demás bloqueados hasta que se desarrollen, y sitio para otros mundos futuros (volcán, piscina, olla, otros océanos, ríos, lagos como el Ness…). Por ahora el foco es el primer mundo con un par de niveles jugables para pulir conceptos.

## 1. Vocabulario

| Término | Qué es en el juego actual | Cuántos hay hoy |
|---|---|---|
| **Mundo** | Un escenario completo con su historia. El primero es **el océano de Ámbar** (las seis zonas del GDD §3.2, de la superficie a la fosa). | 1 (más huecos bloqueados para los futuros) |
| **Nivel** | Una **Inmersión** del GDD §3.1: 5 chunks jugables + la estación que la cierra. La estación es checkpoint permanente y ya existe `save.shellsByImmersion`, así que cada nivel tiene sus **0–3 conchas** como las estrellas de Mario. | 5 jugables (2 de Superficie, 3 de Borde de arrecife) de 18 |
| **Área** | Una zona del GDD (Superficie, Borde de arrecife…): agrupa niveles y da la paleta del tramo del mapa. Es decorativa: el desbloqueo es por nivel. | 2 con contenido, 6 en el diseño |

Se descarta llamar "nivel" a la zona: dos niveles jugables serían muy poco para un mapa, y las estaciones ya son los puntos de reaparición, resumen y checkpoint que un nodo de mapa necesita.

## 2. El mapa

- **El mapa ES el menú principal.** Título arriba, mapa en el centro, ajustes y créditos en botones pequeños. No hay una pantalla de inicio separada: la actual (`StartScreen`: "Seguir · N m / Desde la superficie") queda absorbida, porque tocar el nodo más profundo desbloqueado es "Seguir" y tocar el nodo 1 es "Desde la superficie".
- **Vertical, porque el juego baja.** Un camino que serpentea de arriba (superficie con oleaje y sol) a abajo (fosa con la silueta de Ámbar). Los nodos son burbujas sobre el camino; cada área tiñe su tramo con su paleta del GDD §3.2. El mapa se desplaza con el dedo (scroll vertical) y arranca centrado en el nodo más profundo desbloqueado.
- **Estados de nodo** (todos calculados en `core`, ver §4):
  - **Bloqueado sin contenido** ("próximamente"): burbuja gris con interrogante; hoy son los niveles 6–18. Tocarlo no hace nada (una burbujita "aún no", sin modal).
  - **Bloqueado por progreso**: candado; se abre al alcanzar la estación del nivel anterior (`save.unlockedStation >= n − 1`).
  - **Disponible**: burbuja con el número, brillando si es el más profundo alcanzable.
  - **Completado**: burbuja llena con 0–3 conchas debajo.
- **Otros mundos**: una fila de **islas** en la parte superior o un carrusel horizontal: "Océano de Ámbar" activo y dos o tres siluetas bloqueadas con nombre en gris ("Volcán", "Lago Ness"…). Solo estética y estructura de datos; ningún mundo nuevo se diseña ahora.

## 3. Entrar y salir de un nivel

- **Tocar un nodo disponible** = `newRun` desde la estación anterior (`startStationIndex = n − 1`, −1 para el nivel 1), exactamente como hoy.
- **Al llegar a la estación** se mantiene el descenso continuo del GDD §3.1: la pantalla de estación conserva el botón gigante **"Seguir bajando"** y añade uno pequeño **"Mapa"**. Así no se rompe el pilar de "un solo desplome" y a la vez el mapa es el punto de cierre natural de sesión.
- **"Salir" del menú de pausa** vuelve al mapa.
- **Primera partida**: el GDD §8 prohíbe un modal antes del tutorial mudo. Regla propuesta: en el primer arranque se entra directo al nivel 1 (como hoy) y el mapa aparece por primera vez al llegar a la primera estación. A partir de ahí, el juego arranca siempre en el mapa.

## 4. Arquitectura

- **`packages/core/src/level/worlds.ts`** (puro, con tests): registro de mundos y niveles (`WorldDef { id, name, areas, levels: LevelDef[] }`, `LevelDef { index, areaZone, immersionIndex | null }`; `immersionIndex === null` = sin contenido), y `levelStatuses(world, save)` → estado de cada nodo + conchas. Es la **única** fuente de verdad del desbloqueo; el mapa solo la pinta.
- **`apps/web/src/scenes/MapScene.ts`**: escena Phaser propia (no un overlay del HUD), con su cámara de scroll vertical y arte procedural como el resto. Emite `'newRun'` por el bus igual que hace hoy la pantalla de inicio.
- La pantalla de estación y el menú de pausa ganan el botón "Mapa" (`ctx.bus.emit('toMap')`).
- Persistencia: no hace falta nada nuevo; `unlockedStation` y `shellsByImmersion` bastan. Cuando existan más mundos, el guardado pasará a versión 2 con progreso por mundo.

## 5. Fuera de alcance ahora

Diseño de mundos nuevos, modo Abismo en el mapa, tienda, valoración de tienda (que el GDD §3.3 sitúa en el menú principal tras la Zona 3: el hueco queda reservado pero no se implementa).

## 6. Decisiones tomadas

El owner respondió "adelante" con las tres respuestas por defecto propuestas:

1. **Nivel = Inmersión.** El mapa muestra un nodo por Inmersión (18 en el Océano de Ámbar, 5 jugables hoy), no dos nodos grandes por zona.
2. **"Seguir bajando" sigue siendo el botón grande por defecto** al terminar un nivel; "Mapa" es la opción pequeña secundaria. No se vuelve siempre al mapa como en *Mario*.
3. **La primera partida entra directa al nivel 1**, sin pasar por el mapa; el mapa aparece por primera vez al llegar a la primera estación.
