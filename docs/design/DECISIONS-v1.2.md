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

## D5. Ojeo: mirar alrededor con el minimapa

- **El problema que crea D3+D4**: el mundo mide tres pantallas de ancho y un tiro a plena potencia recorre menos de una; la repisa que interesa está fuera de pantalla la mayor parte del tiempo. Un arrastre libre de cámara sería la solución obvia, pero **choca con D2**: cualquier `pointerdown` en pantalla congela un origen de tirachinas, así que no hay gesto libre para "solo mirar".
- **La solución es el minimapa de la HUD, que es a la vez mapa y mando de cámara.** Un dedo sobre él no apunta: mueve la vista. El otro dedo sigue libre para tirar (multitáctil, 2 punteros activos).
- **Es un desplazamiento de presentación, no de reglas.** `camera.peekX/peekY` se suman encima de la cámara del §4.3 exactamente como el *lookahead* del §7: `camera.x/y`, `maxY`, el trinquete, la banda de retorno, la resaca y el *streaming* **nunca los leen**. Lo único que se dibuja y lo único que convierte al mundo es `renderX = x + peekX`, `renderY = y + lookaheadPx + peekY`.
- **Centrar, no arrastrar.** El shell pide con `GameWorld.setPeek(punto)` que la vista se **centre** en un punto del mundo (el dedo sobre el minimapa, convertido); al soltar, `setPeek(null)`. El *offset* persigue el objetivo con `PEEK_LAMBDA = 14` /s y vuelve a cero con `PEEK_RETURN_LAMBDA = 5` /s (más lento: el regreso es una cortesía, no una urgencia), ambos con `smoothK` para ser independientes de la tasa de fotogramas.
- **Límites**: en X, la esquina de la vista queda en `[0, WORLD_W − viewW]`, igual que la cámara real. En Y, se puede subir `PEEK_UP_PX = 120` px por encima de la cámara viva y bajar `PEEK_DOWN_PX = 240` px (un *chunk*), pero **manda el *streaming***: el ojeo jamás enseña agua sin instanciar. Si la ventana cargada es más corta que la vista, el límite colapsa a un único valor válido (nunca `NaN`).
- **Dos matices de esos límites**, los dos consecuencia de que la cámara del §4.3 se mueve por su cuenta bajo el ojeo:
  - La banda **siempre contiene la vista sin ojear**: "no ojear" tiene que seguir siendo legal. Sin esto, al empezar la partida (la cámara cuelga ~120 px por encima de y = 0 y no hay nada instanciado más arriba) el primer "mirar hacia arriba" respondería **bajando** la vista hasta la primera fila cargada.
  - Cuando el trinquete deja la cámara **fuera** de la ventana instanciada (pasa solo: hasta ~160 px medidos cuando Bur rebota hacia arriba y la cámara se queda abajo en su banda de retorno), el colapso sobre la ventana puede dar unos píxeles **más** de alcance que `PEEK_UP_PX`/`PEEK_DOWN_PX`. Es deliberado: cada píxel de más es agua instanciada y acerca la vista a la ventana. La promesa incondicional es la **relativa** — un ojeo nunca se sale de la ventana más de lo que ya se sale la cámara sola.
- **Un dedo en la HUD nunca termina el gesto del otro.** Con dos punteros activos, la muestra de puntero es una sola y compartida: al tragarse el toque, una superficie del HUD solo la borra si ese contacto es el que el mundo está leyendo. Si no, ir a por el minimapa (o a por el botón de pausa) a mitad de tirón **dispararía** el tiro, porque `down = false` con un origen congelado es, para D2, soltar.
- **Salir del lienzo no cancela el ojeo.** A diferencia del tirón (donde `GAME_OUT` es un aborto obligatorio, porque un tirón que se sale sí puede dispararse solo), un ojeo que llega al borde de la pantalla sigue vivo: el dedo no se ha levantado. Solo lo terminan `pointerup`, `pointerupoutside`, `pointercancel`, `blur` y la pestaña oculta.
- **Una pausa cancela el ojeo de golpe.** Mientras una pantalla o el menú de pausa ocupan el cristal, el mundo deja de avanzar y el regreso (`stepPeek`) no puede correr. Así que al ocultarse el HUD el shell llama a `GameWorld.clearPeek()`, que borra objetivo y *offset* a la vez: se reanuda mirando a Bur, no deslizándose desde la vista ojeada.
- **Congelado mientras se apunta.** Si un tiro está en curso (`aimOrigin !== null`) el regreso a cero se suspende: la vista que estaba ojeada cuando empezó el tirón se queda quieta hasta que el tiro sale o se cancela, para que la banda elástica no se mueva bajo el dedo que tira. Si el segundo dedo sigue sobre el minimapa, sin embargo, **sigue pilotando** la vista aunque el primero esté tirando: solo se congela el *regreso*, no el seguimiento de un objetivo activo.
- **La conversión del dedo incluye el ojeo.** `GameWorld.pointerCam` congela el punto de contacto sumando `peekX/peekY`: el origen del tirachinas es el punto del mundo que hay bajo el dedo **en el cristal que se ve**, no en el mundo sin ojear. Consecuencia obligada: un mismo arrastre da la **misma velocidad de lanzamiento** con o sin ojeo activo, porque la potencia es relativa al origen congelado, nunca al desplazamiento absoluto de cámara.
- **El minimapa**: anclado siempre a la cámara viva (`worldTopY = camera.y − MINIMAP_ABOVE_PX`), nunca a la vista ojeada, para que el marco que se arrastra se mueva dentro de un mapa quieto y no al revés. Escala `MINIMAP_SCALE = 0,1` (540×600 px de mundo → 54×60 px de minimapa). Dibuja: repisas capturables e incapturables, peligros, coleccionables, campos de fuerza, boyas (línea a todo el ancho) y estaciones (banda de un *chunk* de alto), el marco de la vista dibujada (recortado al panel) y a Bur, que se dibuja como un 2×2 blanco con filo oscuro —una forma que ninguna marca tiene, porque con la vista ojeada al otro extremo del mundo el mapa es el único sitio donde Bur existe— y sujeta al panel cuando queda por encima de él (el modelo da su centro real, sin recortar). Alpha completo mientras Bur está en reposo, apuntando o con el ojeo activo; atenuado (0,45) en cualquier otro momento, con una transición de ~200 ms para que no parpadee al aterrizar.
- **Ayuda de teclado en escritorio (opcional, para probar sin táctil)**: mientras se mantiene una de las teclas I/J/K/L, el objetivo del ojeo arranca en la posición de Bur y se mueve 12 px de diseño por evento en esa dirección (I arriba, K abajo, J izquierda, L derecha); al soltar las cuatro, `setPeek(null)`.

## Lo que NO cambia

Pilares §0, historia, zonas y catálogo de fauna, sistema de Aire (salvo la desaparición de la sobrecarga: quedan **cuatro** formas de perder Aire más el coste opcional del doble salto), presión, estaciones, boyas, misericordia, cámara Y, la cámara real (`camera.x/y`, trinquete, resaca, *streaming*: el ojeo es una capa de presentación por encima), tests §11.7 que no dependan de la carga por tiempo.
