# Decisiones de diseño v1.2 — "juego técnico, mundo ancho"

Fecha: 2026-09-06. Origen: playtest del owner en móvil tras el primer jugable. **Estas decisiones mandan sobre el GDD v1.1** hasta que el GDD se actualice a v1.2 (tarea en curso). Todo número es de arranque y vive en `packages/core/src/tuning.ts`.

## D1. El impulso sale del reposo, no del aire

- Bur solo puede lanzarse **desde una superficie de reposo** (estado `RESTING`).
- Excepción: **un "doble salto"** por fase aérea (`AIR_LAUNCHES_MAX = 1`), que **cuesta 1 pip de Aire** (`AIR_LAUNCH_COST = 1`) y **nunca está disponible con el último pip**. El contador se reinicia al reposar. El owner dejó abierto si debe costar aire: por eso es una constante y no una regla.
- Desaparece el "cargar en el aire para corregir" de la v1.1. Un toque en el aire sin doble salto disponible no hace nada (ni evento ni castigo).
- Consecuencia: el juego premia **calcular el tiro**. La trayectoria punteada gana importancia; el número de puntos por zona (`TRAJECTORY_DOTS`) se mantiene como rampa de dificultad.

## D2. El gesto es un tirachinas (Angry Birds)

- `pointerdown` en cualquier punto de la pantalla congela un **origen** (`aimOrigin`, posición del dedo, no de Bur).
- **Arrastrar** define el tiro: la dirección del impulso es **opuesta** al vector de arrastre (tiras hacia atrás, sale hacia delante) y la **potencia es la distancia de arrastre**: `p = clamp(|d| / PULL_MAX_PX, 0, 1)`, `PULL_MAX_PX = 70` px de diseño (≈140 px css a zoom 2). Ya no existe potencia por tiempo, ni sobrecarga, ni suelta automática, ni ajuste fino por arrastre.
- **Cancelar**: soltar con el dedo a menos de `PULL_CANCEL_PX = 12` px del origen **cancela** el tiro (Bur sigue en reposo, sin coste). Mientras el dedo está dentro de ese radio la guía no se dibuja y el anillo se muestra vacío/atenuado: el jugador ve que "aquí no hay tiro". Es el equivalente a devolver el pájaro a la horquilla.
- **Cono**: cualquier dirección **no ascendente**: `AIM_CONE_DEG = 90` (de horizontal-izquierda a horizontal-derecha pasando por abajo). Si el arrastre pide subir, la dirección se recorta a la horizontal más cercana y la guía se pinta en ámbar. Nunca se lanza hacia arriba: subir sigue siendo cosa del mundo (flotabilidad, fumarola, metano).
- **Tiempo de apuntado**: mientras se apunta desde reposo, el temporizador anti-*camping* del posadero **se congela**; existe un tope `AIM_MAX_MS = 6000` tras el cual el tiro **se cancela** (nunca se dispara solo). Las superficies *impaciente* y *pegajosa* mantienen sus temporizadores propios corriendo: es su carácter.
- El impulso sigue siendo **asignación** (`vel = dir · impulso`), con la penalización por presión `(radio/7)^0,35` y los multiplicadores de campos.
- Accesibilidad: "carga lenta" deja de tener sentido y se sustituye por **"tirachinas largo"** (`PULL_MAX_PX × 1,5`, más recorrido para la misma potencia = más precisión).

## D3. Mundo ancho con exploración lateral

- **`WORLD_W = CHUNK_W = 540` px** (tres pantallas de 180). Los chunks siguen midiendo 240 px de alto.
- La cámara sigue a Bur también en **X**, con zona muerta `CAM_DEADZONE_X = [0,35, 0,65]` del ancho visible y recorte a `[0, WORLD_W − viewW]`. En **Y** no cambia nada: trinquete de progreso con banda de retorno.
- Los chunks ya no tienen carriles `L/C/R` ni "boca de entrada": la continuidad entre chunks la garantiza únicamente la **regla de alcance entre anclajes** (D4), que ahora es bidimensional. Cada chunk declara igualmente `entryAnchorId` y `exitAnchorId`; puede haber varios anclajes de salida candidatos, pero el validador certifica al menos la ruta declarada.
- Paredes laterales sólidas en `x < 0` y `x > WORLD_W` en todas las zonas (arrecife decorativo en Z1–Z3, pared de fosa en Z6).
- Referencia de sensación: *Hungry Shark*: agua abierta con estructuras dispersas, coleccionables que invitan a desviarse lateralmente, y el descenso como objetivo. El **tercio inferior de la pantalla sigue despejado** para el pulgar.
- Cada Inmersión sigue siendo 5 chunks jugables + 1 estación; la estación ocupa todo el ancho.

## D4. Menos potencia, mundo más denso

- `IMPULSE_MIN = 90`, `IMPULSE_MAX = 280` px/s (antes 150–430). Con `BUOYANCY = 100` y `DAMPING_Y = 0,60`, un tiro a plena potencia desciende ≈ **195 px** en Z1 (antes 362) y un toque mínimo ≈ 30 px.
- Regla de alcance del generador/validador: desnivel máximo entre anclajes consecutivos `MAX_HOP_PX = [110, 105, 100, 95, 90, 80]` y separación horizontal máxima `MAX_HOP_X_PX = [200, 190, 180, 170, 160, 140]`; la certificación balística se hace con el **mismo integrador**, desde reposo, sin doble salto (el doble salto es margen para el jugador, no para el diseñador).
- Consecuencia de contenido: **3–5 anclajes por chunk** en vez de 1–2; más repisas, más cortas (24–48 px), más rebotes y más decisiones por pantalla.
- La tabla de alcance por zona del GDD §2.2 se recalcula con estos valores.

## Lo que NO cambia

Pilares §0, historia, zonas y catálogo de fauna, sistema de Aire (salvo la desaparición de la sobrecarga: quedan **cuatro** formas de perder Aire más el coste opcional del doble salto), presión, estaciones, boyas, misericordia, cámara Y, tests §11.7 que no dependan de la carga por tiempo.
