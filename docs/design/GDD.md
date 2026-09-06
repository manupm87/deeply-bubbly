# Deeply Bubbly — Documento de Diseño de Juego (GDD)

> **Versión 1.2 — MUNDO ANCHO** · 6 de septiembre de 2026 · Dirección de diseño
> Este documento sustituye a las tres propuestas previas (*mechanics-first*, *story-first*, *retention-first*). La columna vertebral es la propuesta *mechanics-first*, ganadora del panel; sobre ella se han injertado las decisiones que el panel señaló como mejores de las otras dos: la estructura de **Inmersiones** discretas disfrazadas de descenso continuo y la **regla de misericordia** silenciosa (*retention-first*), y el **aliento prestado** como medidor temático, los **jefes que no se derrotan sino que reciben algo** y el **bestiario con datos reales** (*story-first*).
> **Qué cambia en la v1.2 y por qué.** El *owner* jugó el primer jugable en móvil y el playtest devolvió tres cosas que ninguna revisión de escritorio podía ver: la carga por tiempo no se lee con el pulgar, encadenar impulsos en el aire convertía el juego en un *flappy* sin cálculo, y un mundo de una sola pantalla de ancho se siente un pasillo. De ahí las cuatro decisiones de `docs/design/DECISIONS-v1.2.md`, que esta versión incorpora: **(D1)** el impulso sale del reposo, con **un solo "doble salto" aéreo** que cuesta Aire; **(D2)** el gesto pasa a ser un **tirachinas** (arrastre = potencia, dirección opuesta, cancelación devolviendo el pájaro a la horquilla) y **desaparece la sobrecarga**; **(D3)** el mundo pasa a **540 px de ancho** con cámara que también sigue en X, sin carriles ni bocas de entrada; **(D4)** menos potencia (**90–280 px/s**) y mundo más denso (**3–5 anclajes por *chunk***). Las secciones 2, 3, 4, 8, 11 y 12 están recalculadas en consecuencia; el detalle está en el **Registro de revisión v1.1 → v1.2**, al final.
> **Estado de las decisiones.** La v1.0 se declaró "final". Una auditoría técnica encontró en ella contradicciones que impedían escribir la primera línea de código del núcleo (impulso sin definir, alcance menor que la altura de un *chunk*, ventana de reposo inalcanzable, cámara de trinquete incompatible con dos verbos catalogados, alcance del MVP fuera de plazo). **Esta v1.1 resuelve todas esas contradicciones y las hace consistentes entre secciones.** Las secciones 1–9 y 11–12 son firmes y ejecutables. Los puntos genuinamente abiertos siguen en la sección 10, que ahora indica además **qué números de las secciones 2, 3 y 11 dependen de cada uno**: si el *owner* cambia una respuesta de §10, se recalculan esos números y no otros. Todo valor es de arranque, sujeto a *tuning* en playtest pero no a debate de diseño. El detalle de lo modificado está en el **Registro de revisión**, al final.

---

## 0. Idea en una frase y pilares

Una burbuja quiere bajar, pero el agua la empuja hacia arriba: **el jugador lucha contra la flotabilidad, no contra la gravedad**. Cada zona del océano añade **un verbo nuevo**, nunca un botón nuevo.

Esta inversión es la decisión central del proyecto. En *Doodle Jump* la gravedad te tira abajo y luchas por subir; aquí el empuje te tira arriba y luchas por bajar. Es el mismo esqueleto mental que el jugador ya conoce, **espejado**, y resuelve tres problemas de golpe: (1) justifica el *scroll* siempre-descendente sin trucos de cámara; (2) hace que "no hacer nada" sea un fracaso lento y no una muerte instantánea, lo que es imprescindible para público infantil; (3) convierte las plataformas en **techos**: Bur se apoya *por debajo* de las repisas, una imagen que no existe hoy en el mercado móvil y que se lee al instante.

**Los cinco pilares, en orden de prioridad. Ante cualquier duda de producción, decide por el pilar más alto.**

1. **Un solo gesto, de principio a fin.** Tirar del tirachinas y soltar. Nada más, nunca.
2. **Ningún sistema hace un solo trabajo.** La presión te encoge *y* te abre huecos; el tiro te mueve *y* te ilumina; reinflar es premio arriba *y* trampa abajo.
3. **El fracaso nunca es castigo.** No hay muerte, no hay sangre, no hay pantalla roja, y **ningún fallo cuesta más de 35 segundos de progreso**. Regla dura, verificable en QA. La garantiza el sistema de **boyas de aliento** de §3.1 (un punto de reaparición silencioso a mitad de cada Inmersión), no la duración de la Inmersión: reaparecer al principio de una Inmersión de 65 s violaría el pilar y por eso ya no se hace.
4. **Cero maldad.** Todo lo que estorba es *naturaleza*, no villanía. Ningún jefe se derrota: a todos se les devuelve algo.
5. **Todo se lee sin texto.** Forma, color, movimiento y sonido antes que palabras. **El juego jugable —HUD, tutorial, pantallas de fin, menú de pausa y misiones— contiene menos de 40 palabras en pantalla, y ninguna es necesaria para jugar ni para terminar la campaña.** El texto largo existe pero vive **fuera del *loop*** y es siempre opcional: Postales (12 × 2 frases) y Álbum de Fauna (32 fichas de una frase) suman ≈1.500 palabras, que son el presupuesto real de localización. Formulado así, el pilar es verificable: se cuenta el diccionario de cadenas de la capa de juego, no el del contenido coleccionable.

---

## 1. Gancho narrativo, personaje y tono

### 1.1 La historia: "El Aliento Prestado"

La gran ballena **Ámbar** bajó por última vez al fondo del mundo para descansar y cantar la Canción Honda, la que mantiene encendidas las luces del abismo. Al bajar se le escapó una última bocanada, que subió y subió hasta romper en la espuma. Esa bocanada es **Bur**.

Bur despierta en la superficie con algo dentro que no es suyo: una **chispa de luz tibia** que no deja de latir. Abajo, muy abajo, el farol de la fosa se apagó y las criaturas del abismo perdieron su punto de referencia. Bur decide hacer lo único que una burbuja no sabe hacer: **bajar**, y devolver lo que lleva.

**Por qué esta historia y no otra.** Porque *es* la mecánica, no una envoltura sobre ella:

- "Una burbuja que baja" es literalmente la física invertida. El conflicto narrativo y el conflicto mecánico son el mismo objeto.
- **El medidor de Aire es el aliento prestado.** No es una barra de vida abstracta: es exactamente la cosa que Bur ha venido a devolver. Gastar Aire para impulsarse es un dilema temático de una sola frase que un niño de siete años entiende sin que se lo expliquen.
- "Llevar luz hacia abajo" justifica el sistema de iluminación de la Zona 4 en adelante, las bolsas de aire y el clímax hadal, donde un único color dorado queda reservado al objetivo.
- Da un final positivo y no violento, y permite contar toda la campaña jugable con **menos de 40 palabras en pantalla** (§0, pilar 5). Las Postales y el Álbum añaden texto, pero siempre opcional y fuera del descenso.

### 1.2 El Buzón de la Espuma (capítulos y motivo para volver mañana)

Injerto directo de *retention-first*, adaptado a esta ficción. En la superficie flota el **Buzón de la Espuma**: recados que nadie sabe entregar, porque para llegar al destinatario hay que bajar. **Cada zona tiene un vecino que espera el suyo.** Al final de cada zona, Bur entrega un recado —un poco de luz, una nota de la canción, una noticia del sol— y el vecino le devuelve una **Postal**: dos frases escritas a mano, dibujadas, que van al Álbum.

Esto compra tres cosas por el precio de una:

1. **Capítulos naturales.** Una entrega = una zona = 3 Inmersiones. La promesa siempre está a diez minutos vista, nunca a seis horas.
2. **Coleccionable que es narrativa.** El Álbum de Postales *es* la meta-progresión y a la vez la historia.
3. **Razón diegética para volver mañana.** "Hoy hay recados nuevos en el buzón" es una frase del mundo, no un *badge* de interfaz. Las misiones diarias viven ahí y en ningún otro sitio.

**Nota ética explícita (pilar 4).** Un motivo para volver mañana dirigido a menores hay que declararlo, no disfrazarlo de neutralidad. Reglas duras del Buzón: **sin rachas** (no se pierde nada por faltar un día), **sin cuenta atrás visible**, **sin notificaciones *push* activadas por defecto** (se piden una sola vez, tras la puerta parental de §6.6, y por defecto están apagadas), las misiones **nunca caducan con penalización** y ninguna recompensa diaria es necesaria para terminar la campaña. El Buzón invita; no presiona. Cualquier propuesta futura que endurezca esto se decide contra el pilar 4, no contra la retención.

### 1.3 El final

Al llegar a 10.935 m, Bur se posa en la frente de Ámbar y suelta el aliento. La Canción Honda vuelve, la fosa se enciende, y la cámara **asciende sola** durante 25 segundos por todas las zonas, reencendiendo cada luz y mostrando a cada vecino con su postal en la mano. **Es el único momento del juego en que la cámara sube, y por eso significa algo.** Un recap visual de la partida entera que se siente en diez segundos y no necesita una sola palabra.

### 1.4 Personaje y tono

**Bur.** Dos sílabas, se pronuncia igual en español y en inglés, cabe en tres caracteres de HUD, contiene "burbuja"/"bubble". Sin género. Sin cara compleja: dos ojos-píxel y un brillo. Los ojos se deforman con el *squash & stretch* — la expresividad viene de la física, no de animación adicional. Bur **no habla**: se expresa con burbujitas-pictograma (una nota musical, un corazón, una gota de sudor). **Tortu**, una tortuga vieja y lenta, es la única voz narradora y solo aparece en la superficie y en las estaciones de descanso.

**Tono: asombro y humor suave.** Referencia emocional: *Abzû* + *Alto's Odyssey*, con la legibilidad de un arcade. Reglas de tono innegociables:

- Nada de dientes, sangre, persecuciones agresivas ni sustos de sonido.
- **Ningún personaje muere en pantalla.** Ámbar descansa y canta; el jardín de huesos es un santuario luminoso, no un cadáver.
- **Los dos casos límite del pilar, cerrados por dirección de arte antes de que nadie dibuje.** (1) La **ballena caída** de Z5 no se representa como un cuerpo: es un **arrecife de huesos ya convertido en jardín**, cubierto de vida bioluminiscente, con la silueta apenas sugerida bajo el coral. Nunca hay carne, nunca hay carroña, y Tortu la llama "la que sigue dando de comer al mundo". (2) El fallo de Bur **no es una desintegración**: Bur **se deshincha**, el cuerpo se afloja, suelta 14 burbujitas que ascienden y se vuelve a formar entera en la boya. Se anima como un suspiro, no como una rotura. El vocabulario interno del equipo para ese estado es *"se queda sin aliento"*, jamás *"muere"*, ni en el código ni en la telemetría.
- El fallo nunca es castigo: Bur se aligera, flota hacia arriba, y alguien la vuelve a empujar hacia abajo con cariño.
- La oscuridad se presenta como asombro ("¡hay vida aquí sin sol!"), nunca como amenaza.
- Cero villanos. Una anémona pica porque es una anémona.

---

## 2. El núcleo: tirar, soltar, rebotar

### 2.1 El gesto (un solo input: el tirachinas)

**Pulsar → arrastrar → soltar.** Un tirachinas de *Angry Birds*, con el mundo entero como horquilla y una sola dirección prohibida: hacia arriba.

- Al tocar **cualquier punto de la pantalla** se **congela un origen (`aimOrigin`) en la posición del dedo**, no en la de Bur. La dirección y la potencia se miden siempre respecto a ese origen congelado: **dedo quieto = tiro quieto**, aunque Bur se mueva. No hace falta tocar sobre Bur y el pulgar nunca tapa al personaje.
- **El arrastre es el tiro.** La dirección del impulso es **opuesta** al vector de arrastre —tiras hacia atrás y Bur sale hacia delante, exactamente como una goma— y la **potencia es la distancia arrastrada**: `p = clamp(|d| / PULL_MAX_PX, 0, 1)` con **`PULL_MAX_PX = 70` px de diseño** (≈140 px css a zoom 2, un recorrido de pulgar cómodo). La relación es **lineal a propósito**: lo que ves arrastrado es lo que sale.
- **Cancelar es gratis.** Soltar con el dedo a **menos de `PULL_CANCEL_PX = 12` px** del origen **cancela el tiro**: Bur sigue en reposo, sin coste, sin evento. Mientras el dedo está dentro de ese radio la guía no se dibuja y el anillo se muestra vacío y atenuado — el jugador ve que "aquí no hay tiro". Es devolver el pájaro a la horquilla, y es lo que permite explorar la puntería sin miedo.
- **Cono: cualquier dirección no ascendente** (`AIM_CONE_DEG = 90`, de horizontal-izquierda a horizontal-derecha pasando por abajo), con **zona muerta de ±5°** alrededor de la vertical para que "recto abajo" salga fácil. Si el arrastre pide subir, la dirección se **recorta a la horizontal más cercana** y la guía se pinta en ámbar: nunca hay salto de 180° ni tiro sorpresa. **Nunca se lanza hacia arriba**; subir sigue siendo cosa del mundo (flotabilidad, fumarola, metano).
- **Solo se dispara desde el reposo.** El lanzamiento nace en `RESTING`. En el aire hay **una sola excepción**: un **"doble salto"** por fase aérea (`AIR_LAUNCHES_MAX = 1`) que **cuesta 1 pip de Aire** (`AIR_LAUNCH_COST = 1`) y **nunca está disponible con el último pip**. El contador se reinicia al reposar. Un toque en el aire sin doble salto disponible **no hace nada**: ni evento, ni castigo, ni tiro fantasma. La regla se comprueba **también al soltar**, no solo al tocar: un gesto abierto con dos pips que se suelta con uno pide exactamente el tiro que "nunca con el último pip" prohíbe, así que se **cancela** en vez de dispararse (y lo dice, porque para entonces el jugador lleva seis segundos viendo una goma tensada). El juego premia **calcular el tiro**, no corregirlo a media caída.
- **Tope de apuntado, no suelta automática.** Mientras se apunta desde reposo, el temporizador anti-*camping* del posadero **se congela** (§2.3); existe un tope de `AIM_MAX_MS = 6.000 ms` tras el cual **el tiro se cancela**, nunca se dispara solo. Las superficies *impaciente* y *pegajosa* mantienen sus temporizadores corriendo: es su carácter.
- **Apuntar ancla.** Mientras se apunta, la flotabilidad cae al **35%**. Es coherente con la ficción (Bur se tensa y se agarra al agua) y evita que apuntar seis segundos en el aire, con el doble salto, arrastre a Bur hasta el borde superior de la cámara.

### 2.2 Números de partida

Resolución de diseño: **ventana de 180 px de ancho fijos** (`VIEW_W`) y **320–420 px de alto visible** según el dispositivo, con zoom entero (§8). El **mundo mide 540 px de ancho** (`WORLD_W`, tres ventanas) y la cámara se mueve también en X (§4.3). Todas las unidades del documento están en px de diseño salvo indicación expresa.

**Regla número uno, la que la v1.0 no decía y sin la cual no se puede escribir el núcleo: el lanzamiento *sustituye* la velocidad, no la suma.**

```
vel = dir * impulso        // asignación. NUNCA vel += dir * impulso
```

Cada tiro empieza de cero. Es la decisión que hace el juego legible y enseñable: el alcance de un disparo depende de **una sola variable** (la distancia de arrastre), la trayectoria punteada puede ser exacta, y **no se pueden apilar impulsos en el aire** para atravesar tres *chunks* de una tacada. Desde la v1.2 la regla es aún más dura: **solo se lanza desde el reposo**, con la única excepción del doble salto aéreo de §2.1, que cuesta 1 pip. El tiro se calcula antes de soltar, no se corrige a media caída. Las velocidades que aportan los campos de fuerza (fumarola, corriente, metano) **sí** se suman, pero las aplica el integrador después del lanzamiento, nunca el impulso.

| Parámetro | Valor | Nota |
|---|---|---|
| Empuje de flotabilidad (superficie) | **+100 px/s²** hacia arriba | Es la "gravedad" del juego, invertida |
| Amortiguación vertical del agua | **0,60 /s** | Ver derivación de la velocidad terminal abajo |
| Amortiguación horizontal del agua | **0,30 /s** | La mitad que la vertical: **el horizontal se conserva** y se encadenan paredes |
| Velocidad terminal ascendente | **167 px/s** (derivada) | `BUOYANCY / DAMPING_Y` = 100 / 0,60. Es una identidad, no un número suelto |
| Velocidad de caída máxima | **520 px/s** | Cap de seguridad; solo se roza combinando lanzamiento y corriente descendente |
| Impulso base (`p = 0`) | **90 px/s** | Suelo de la rampa; el tiro más corto posible (13 px de arrastre) sale a 125 px/s |
| Impulso máximo (arrastre ≥ 70 px) | **280 px/s** | Ya no hay ajuste fino: el arrastre *es* la potencia |
| Arrastre a potencia máxima (`PULL_MAX_PX`) | **70 px** | `p = clamp(|d|/70, 0, 1)`, **lineal**. A 35 px, `p = 0,5` |
| Radio de cancelación (`PULL_CANCEL_PX`) | **12 px** | Soltar dentro = sin tiro, sin coste, sin evento |
| Tope de apuntado (`AIM_MAX_MS`) | **6.000 ms** | Al agotarse **cancela**; nunca dispara sola |
| Doble salto aéreo | **1 por fase aérea, −1 Aire** | Nunca disponible con el último pip; se reinicia al reposar |
| Captura de reposo | **≤ 260 px/s de acercamiento por debajo** | Umbral de *captura*, no de "casi parado". Ver §2.3 |
| Restitución roca/coral | **0,55** | Rebote de referencia |
| Restitución medusa | **0,92** | Superficie **no capturable**: trampolín, no posadero |
| Restitución alga / nieve marina | **0,18** | Absorbe: superficie de descanso |
| Restitución pared hadal | **0,85** | Constante propia de Z6: sin ella, el verbo "encadenar rebotes de pared" no existe |
| Fricción lateral en rebote | **0,08** | Con la amortiguación horizontal a 0,30 /s, tras dos rebotes queda ~60% del horizontal |
| Enfriamiento de trampolín | **600 ms** | Tras rebotar en una medusa, esa medusa se desinfla y Bur la atraviesa |

**Alcance por impulso (tabla derivada, normativa para el generador).** Integrando `dv/dt = −BUOYANCY − DAMPING_Y·v` desde `v0` hacia abajo, el descenso hasta el punto muerto es `d = (T/D)·(x − ln(1+x))` con `T = 167`, `D = 0,60`, `x = v0/T`. Con arrastre completo (`p = 1`) y tiro recto abajo:

| Zona | Impulso efectivo | **Descenso por tiro** | `MAX_HOP_PX` | `MAX_HOP_X_PX` |
|---|---|---|---|---|
| Z1 | 280 px/s | **193 px** | 110 | 200 |
| Z2 | 272 px/s | 184 px | 105 | 190 |
| Z3 | 263 px/s | 175 px | 100 | 180 |
| Z4 | 252 px/s | 164 px | 95 | 170 |
| Z5 | 240 px/s | 152 px | 90 | 160 |
| Z6 | 227 px/s | **140 px** | 80 | 140 |

El tiro más corto posible —13 px de arrastre, justo fuera del radio de cancelación, 125 px/s— desciende **53 px**; un arrastre de 35 px (`p = 0,5`, 185 px/s) desciende **101 px** en Z1 (el impulso base de 90 px/s, inalcanzable por definición, daría 30 px). **Un tiro a plena potencia ya no cruza un *chunk* entero** (193 px frente a los 240 px de alto del chunk): esa es exactamente la consecuencia buscada de la v1.2, y por eso el contenido pasa a **3–5 anclajes por *chunk*** (§4.1) en vez de 1–2. `MAX_HOP_PX` es el **57–59% del descenso por tiro** en las seis zonas, es decir, **más del 40% de margen** para que el jugador no tenga que ejecutar el tiro perfecto.

**La regla de alcance es ahora bidimensional.** Con el mundo a 540 px y el cono abierto a 90°, dos anclajes consecutivos ya no se separan solo en vertical: `MAX_HOP_X_PX` acota también el desplazamiento lateral. La caja `(MAX_HOP_X_PX, MAX_HOP_PX)` está calculada para quedar **holgadamente dentro de la envolvente balística** de cada zona: en Z1, un tiro a ~33° cruza los 200 px laterales habiendo descendido 145 px, y el punto más lateral alcanzable a plena potencia (tiro a 45°) está a **214 px** con 112 px de desnivel; en Z6 esa cifra baja a **153 px**. La caja es un filtro rápido; la certificación real la hace el **mismo integrador**, desde reposo y **sin doble salto** (§11.5.11).

**La potencia es lineal a propósito.** La v1.1 tenía una curva `^1,30` sobre el tiempo de mantenido, precisa pero invisible: el jugador no podía ver cuánta llevaba. Con el tirachinas, la potencia **se ve**: la banda elástica mide 70 px y la mitad de la banda es la mitad del tiro. El eje de habilidad se traslada de "cronometrar el dedo" a **calcular el tiro**, que es lo que el playtest pedía.

**Cancelar en vez de sobrecarga.** La v1.1 castigaba el mantenido largo con una fuga de Aire (sobrecarga). Con el tirachinas ese castigo no tiene sentido y **desaparece del documento**: apuntar es gratis, cancelar es gratis, y el único límite es el tope de 6 s, que **cancela y no dispara**. Lo que sí cuesta Aire es el **doble salto aéreo** (1 pip, nunca el último): el gasto pasa de castigar la indecisión a pagar una segunda oportunidad.

### 2.3 La superficie de reposo: el techo

Bur flota. **Toda llegada a la cara inferior de un techo capturable moviéndose hacia arriba a menos de 260 px/s se convierte en reposo.** Como la velocidad terminal ascendente es 167 px/s, esto significa en la práctica: **si subes y hay techo encima, te quedas pegada.** El reposo es el comportamiento por defecto y el rebote es la excepción.

Esta inversión respecto a la v1.0 es deliberada. La v1.0 exigía llegar al techo a menos de 60 px/s, velocidad que solo se da en los 6 px alrededor del vértice de un rebote: una ventana de captura de sub-píxel, imposible de acertar para un adulto, no digamos para un niño de siete años, y que además metía a Bur en un traqueteo de rebotes decrecientes bajo cada repisa (con una medusa, decenas de segundos de castañeo y +1 Aire gratis por cada rebote). Con la captura por defecto:

- La habilidad está donde debe estar —**elegir bajo qué techo caer y con qué línea**— y no en clavar una velocidad de llegada.
- No hay traqueteo posible: un contacto ascendente termina siempre en reposo, en un solo evento.
- Rebotar sigue existiendo y sigue costando: **contra la cara superior o los laterales de una repisa siempre se rebota** (nunca se reposa), y **por encima de 260 px/s también se rebota**, que es lo que pasa al salir de una fumarola o de una burbuja de metano. La captura tiene dientes justo donde el juego los quiere.
- Las superficies **no capturables** (medusa, señuelo, criaturas en movimiento marcadas como tal) rebotan siempre, vengas como vengas.

Reglas de la superficie de reposo:

- **Apuntar congela el reloj del posadero, pero es un préstamo.** Mientras el dedo está en la pantalla apuntando desde un **posadero**, el temporizador anti-*camping* de 3,0 s **se detiene**: el juego pide calcular el tiro (§2.1) y sería absurdo cronometrar a quien calcula. El límite lo pone el tope de apuntado de **6,0 s** (`AIM_MAX_MS`), que **cancela** el tiro y devuelve a Bur al reposo. Y todo gesto que **termina sin disparar** —el tope, la cancelación en el radio muerto, levantar el dedo— **le devuelve al reloj el tiempo que le congeló**: solo el lanzamiento sale gratis, y el lanzamiento ya abandona la repisa. Sin esa devolución, levantar el dedo un fotograma renueva la congelación indefinidamente y acampar vuelve a ser posible (con ella, un reposo dura como mucho `REST_MAX_MS + AIM_MAX_MS`). Las superficies **impaciente** y **pegajosa** *no* congelan nada: sus relojes siguen corriendo mientras apuntas, y esa es justamente su personalidad. El drenaje pasivo de Aire por presión se congela mientras dura el reposo; es un alivio pequeño y honesto (a lo sumo 3 s de un reloj de 25 s), y se comunica como una pausa del pulso de Bur, no como una mecánica.
- Las repisas tienen **anchura mínima 20 px y grosor mínimo 8 px**, y se marcan con una línea de brillo en su cara inferior (bioluminiscencia en zonas oscuras). Son **cuerpos sólidos por las dos caras**: una repisa ancha bloquea el descenso, y eso es material de diseño de nivel, no un accidente. Solo la cara inferior captura.
- **Máximo 3,0 s de reposo continuado**: pasado ese tiempo, una corriente suave despega a Bur **hacia abajo, a 90 px/s** —nunca hacia arriba, que era regalar una resaca a cualquier niño que tardase tres segundos en apuntar—. El anti-*camping* empuja en la dirección del juego. En "Buceo tranquilo" el temporizador es de 6,0 s.
- **No hay reposo en superficies laterales ni en suelos.** Tocar un suelo hacia abajo es simplemente un rebote. Esto obliga a pensar el descenso como "de techo en techo", que es la coreografía que define el juego.

Tres calidades de techo, vocabulario cerrado de *level design*: **posadero** (firme, 3,0 s), **impaciente** (anémonas, criaturas dormidas: 1,2 s y te expulsa suave **hacia abajo**) y **pegajosa** (nieve marina, algas de fosa: engancha 0,6 s y el siguiente impulso sale al 60%). Nunca hay superficies invisibles ni trampas puras.

### 2.4 Estados de fallo (ninguno es instantáneo)

Regla de oro: **no existe la muerte por un error.** Todo se paga en Aire. **Hay exactamente cuatro formas de perder Aire**, más el **coste opcional del doble salto**, y esta lista es la fuente de verdad (§12.1 la cuenta):

1. **Golpe de peligro** → −1 Aire, 700 ms de invulnerabilidad, destello y empujón de 120 px/s en dirección contraria.
2. **Resaca (salir por arriba)** → si Bur asciende por encima del borde superior de la cámara, entra en resaca: 1,6 s de aviso con flecha y silbido; si no vuelve a entrar en pantalla, −1 Aire y **reaparece con velocidad 0 en el mejor anclaje disponible**, con 700 ms de invulnerabilidad. El anclaje se elige en este orden: (a) el **último techo de reposo visitado**, si sigue instanciado y cae dentro de la banda de retorno de la cámara (§4.3); (b) el **anclaje de entrada del *chunk* actual** (todo *chunk* declara uno, §11.2); (c) la **última boya de aliento** (§3.1). **Nunca se pierde profundidad conquistada**: la reaparición nunca ocurre por encima de la boya alcanzada, y `maxY` de progreso no retrocede jamás. La v1.0 prometía reaparecer en un techo que su propia cámara de trinquete dejaba fuera de pantalla y su *streaming* podía haber destruido; la cadena (a)→(b)→(c) siempre tiene respuesta, incluida la del principio de la Inmersión, cuando (a) es nulo.
3. **Presión sostenida en Z5–Z6** → −1 Aire cada 25 s sin tocar bolsa de aire. Reloj de dificultad nativo, sin temporizador visible: se comunica con el pulso visual de Bur acelerándose.
4. **Ventilación por atrapamiento** → la Anémona Pegajosa (§5, nº 7) es el único caso: atrapa 0,8 s, y si sigues dentro a los 1,5 s ventila 1 Aire. Escapar cuesta un tiro del 60% o más (42 px de arrastre), que cabe holgadamente en la ventana. **Ese tiro no es el doble salto de §2.1**: Bur atrapada está sujeta a una superficie, no a la deriva, así que su tiro sale como el del reposo —sin pip y sin gastar el doble salto—. Cobrárselo al presupuesto aéreo convertiría una anémona encontrada con el último pip en una muerte inevitable (D1 niega el lanzamiento aéreo justo ahí), que es lo contrario de "recurso, no muerte". Es una forma de perder Aire propia y por eso está en la lista.

**Y un gasto que no es un fallo: el doble salto** (§2.1). El único lanzamiento aéreo de cada fase cuesta **1 pip** (`AIR_LAUNCH_COST`), **nunca está disponible con el último pip** y siempre lo decide el jugador. No entra en la lista de "formas de perder Aire" porque no es un error: es una compra. La v1.1 tenía aquí la **sobrecarga**, que castigaba mantener el dedo demasiado tiempo; con el tirachinas de §2.1 ese castigo desaparece del juego entero.

**Aire = 0** → Bur **se deshincha**: suelta 14 burbujitas que ascienden, ralentización a 0,35× durante 500 ms, y a los **700 ms** aparece la pantalla de fin, sobre la misma escena y sin ninguna carga. **Sin sangre, sin grito, sin pantalla roja.** Con "Otra vez" bajo el pulgar se vuelve a jugar en **menos de 0,8 s desde el toque**, y se reaparece **en la última boya de aliento o estación alcanzada** (§3.1), nunca al principio de la Inmersión. **Coste real de un fallo: 18–32 s**, por debajo del pilar 3 y medible con cronómetro.

### 2.5 Aire: la única barra

- Inicio: **5 pips**. Máximo base **8**, ampliable a **11** con mejoras. La **capacidad visible baja por zona** (§2.6): `ZONE_AIR_MAX = [8, 8, 7, 7, 6, 6]`, más lo que aporten las mejoras.
- Recarga: **bolsas de aire** (+1, 1–2 por chunk), **estaciones de descanso** (recarga completa) y **cadena de rebotes** (5 rebotes **en cuerpos distintos** y sin tocar peligro → +1 Aire, máximo 1 por chunk: premia el juego elegante). La coletilla "en cuerpos distintos" no es un detalle: sin ella se farmea Aire castañeando bajo una misma medusa.
- **Escudo de conchas**: absorbe el primer golpe de cada zona. Es la válvula anti-frustración explícita.

### 2.6 Presión: el sistema que hace doble trabajo

Cada zona reduce el radio de Bur. Radio base **7 px**.

| Zona | Radio | % del base | Aire máx. | Consecuencias mecánicas |
|---|---|---|---|---|
| Z1 Superficie | 7,0 px | 100% | 8 | — |
| Z2 Arrecife | 6,4 px | 92% | 8 | — |
| Z3 Crepuscular | 5,9 px | 84% | 7 | Puntos de trayectoria: 6 → 5 |
| Z4 Medianoche | 5,2 px | 74% | 7 | Puntos: 4. Radio de luz propio limitado |
| Z5 Abisal | 4,5 px | 64% | 6 | Puntos: 3 |
| Z6 Hadal | 3,9 px | 55% | 6 | Puntos: **2** |

La presión es **ambivalente a propósito**, nunca un simple castigo:

- **Ventaja**: *hitbox* más pequeña → pasas por huecos imposibles arriba. La Zona 6 es un laberinto de rendijas que *exige* estar comprimido. El sistema que te encogió es el que te salva.
- **Desventaja**: el impulso efectivo escala con el radio — `impulso_real = impulso × (radio/7)^0,35` — así que **al 55% del radio, un tirachinas completo (70 px) da 227 px/s, lo mismo que un arrastre de 50 px en superficie (226 px/s)**. Ese es exactamente el trato: en la fosa estiras la goma entera para conseguir lo que arriba te salía con dos tercios del recorrido. (El exponente **0,35** sustituye al 0,5 de la v1.0, con el que la frase anterior era falsa: a plena potencia en Z6 se conseguía *menos* que con un tiro perezoso de superficie, y el alcance por tiro se hundía justo en la zona más larga del juego.)
- **Capacidad de Aire.** La capacidad visible baja un pip cada dos zonas según la tabla; los pips sobrantes se dibujan atenuados. **El recorte de capacidad se aplica siempre dentro de una estación de descanso, y la estación recarga al nuevo máximo**: nunca se pierde un pip que estuvieras usando, ni a mitad de Inmersión. Reinflar devuelve **radio, no capacidad**. Las mejoras de Capacidad de Aire suman sobre el máximo de la zona, no sobre el máximo base. El ratio oferta/demanda de 0,95 en Z5–Z6 (§4.2) se calcula contra la capacidad **de la zona** (6), no contra el 8 base.
- **El verbo de la Zona 3, "reinflar"** (reventar una bolsa de aire grande), devuelve un escalón de tamaño durante **12 s**. En Z6 eso se invierte: **reinflar te impide pasar por las rendijas.** Un mismo objeto es premio arriba y trampa abajo, sin una línea de código nueva. Y por eso mismo el radio **solo** depende de la zona y del reinflado temporal: **nada comprable lo toca** (§6.2). Una compra permanente de radio sería un reinflado irreversible, es decir, un objeto de tienda que bloquea la zona final.
- **Suelo de legibilidad**: aunque el cuerpo encoja, Bur conserva siempre un contorno de 1 px y un aura luminosa que **crece** al menguar. La silueta total nunca baja de 8 px.

### 2.7 La ayuda de puntería también es un recurso

Mientras se apunta aparece una **trayectoria punteada de N puntos**, con N descendiendo de 6 a 2 según la tabla anterior. No es una decisión estética: **es cómo sube la dificultad sin tocar la física.** El jugador aprende a predecir el arco en las zonas fáciles y el andamio se retira poco a poco. **Los puntos se dibujan siempre con la separación de la zona más rica (6), no repartidos a lo largo de todo el arco**: por eso Z1 ve el arco entero —el último punto *es* el sitio donde se posa— y Z6 ve solo el primer tercio. Repartir N puntos sobre el arco completo conservaría el punto de llegada en todas las zonas, es decir, la respuesta, y la rampa no retiraría nada. La trayectoria es **exacta hasta el primer rebote y difusa después** (los puntos se separan): enseña "la física es predecible" sin regalar la solución. Que el impulso sustituya la velocidad (§2.2) es lo que permite que sea exacta. **Desde la v1.2 este andamio pesa más que nunca**: como ya no se corrige en el aire salvo con el doble salto (§2.1), la trayectoria es la herramienta principal para calcular el tiro, y su recorte por zona (6 → 2 puntos) es la rampa de dificultad del juego.

**Modo asistido "trayectoria completa"** (§8): dibuja el arco continuo hasta el primer rebote en todas las zonas. Para que la rampa de §2.7 no desaparezca del todo, el modo asistido **sigue sin dibujar el efecto de los campos de fuerza ni nada posterior al primer rebote**: la lectura de corrientes, fumarolas y encadenados —que es lo que de verdad se endurece de Z3 a Z6— se sigue aprendiendo. Es una ayuda de ejecución, no una solución.

## 3. Estructura de zonas

### 3.1 Inmersiones: niveles discretos disfrazados de descenso continuo

**Decisión final:** el juego se organiza en **Inmersiones de 6 chunks: 5 jugables (1.200 px) más el chunk de estación de descanso (240 px) que las cierra**. Una Inmersión dura **45–65 s** de juego medido. Pero **no hay pantalla de carga, ni menú de selección de nivel dentro del descenso**: la siguiente Inmersión arranca exactamente en la profundidad donde terminó la anterior, con el botón "Seguir bajando" ya bajo el pulgar. La sensación es de una sola caída ininterrumpida hasta el fondo del mundo; la estructura, por debajo, es de niveles.

Que la estación **ocupe el sexto chunk** (y no sea un añadido fuera de cuenta) es lo que hace cuadrar la aritmética de todo el documento: 18 Inmersiones × 6 chunks = **108 chunks = 25.920 px**, exactamente la columna de §11.1, de los cuales 90 son jugables y 18 son estación.

**Boyas de aliento (el sistema que sostiene el pilar 3).** A mitad de cada Inmersión, al terminar el tercer chunk, hay una **boya de aliento**: un punto de reaparición silencioso. No tiene interfaz, no para el juego, no recarga Aire; es una burbuja anclada que Bur atraviesa y que hace un "plín" grave y un destello de 200 ms. Al fallar se reaparece **en la última boya o estación alcanzada**, nunca al principio de la Inmersión. Con ello **el coste máximo de un fallo es medio tramo: 18–32 s**, siempre por debajo de los 35 s del pilar 3 y verificable con cronómetro (criterio §12.3.6). El generador tiene prohibido producir un tramo entre boyas cuyo tiempo objetivo supere los 35 s; si lo hace, inserta una boya extra.

Esto reconcilia las dos posturas del panel y da lo mejor de ambas:

- Se conserva la fantasía de "un solo desplome" y el medidor de profundidad como marcador único.
- Se ganan **puntos de cierre de sesión limpios con recompensa**, checkpoints permanentes, ranuras de vídeo recompensado no intrusivas y una curva de dificultad autoral en las primeras horas, que es donde se gana o se pierde la retención.
- El reinicio se mantiene por debajo de **0,8 s desde el toque en "Otra vez"**, porque no hay carga real: solo se reordena el *streaming* de chunks.

**Duración de la campaña, número único para todo el documento:** 18 Inmersiones × ~55 s + 18 estaciones × ~12 s ≈ **18–24 minutos** de superficie a fosa jugando bien, sin fallos. Ese es el número que usan §9 (criterio de salida de H3), §11.1 (escalas metros/píxel) y el argumento de venta. Las tres cifras distintas que circulaban en la v1.0 (21–30 min, 15–20 min, ~18 min) eran la misma campaña contada con tres aritméticas incompatibles.

**Dos modos, cero contenido extra:**

- **Expedición** (modo principal): la campaña de 18 Inmersiones. Cada estación alcanzada queda desbloqueada para siempre y se puede empezar la partida desde ahí.
- **Abismo** (modo puntuación): una sola bajada desde la superficie, sin checkpoints —**sin boyas tampoco**— para récord. Se desbloquea al llegar a la Z3. En Abismo, **la regla de misericordia está desactivada**.

### 3.2 Las seis zonas

Las profundidades comprimen la escala real pero respetan el orden y el carácter científico. La compresión es explícita y está en la sección 11: cada zona usa su propia escala metros/píxel.

| # | Zona | Profundidad | Inmersiones | Paleta y mood | Truco visual | **Verbo nuevo** | Criaturas clave | Jefe / entrega |
|---|---|---|---|---|---|---|---|---|
| 1 | **Superficie** | 0–200 m | 2 | Cian, turquesa, blanco espuma, sol amarillo. Alegre | *God rays* animados, oleaje visible en el borde superior | **Tirar, soltar y reposar bajo el techo** | Peces payaso, tortuga paseante, medusa farolillo, alga cinta | **Don Hinchón**, pez globo miedoso que tapona el desfiladero. No se derrota: se le hace reír rebotando en sus tres cosquillas |
| 2 | **Borde de arrecife** | 200–600 m | 3 | Turquesa oscuro + acento coral naranja. Vibrante, ya con penumbra | Pared de arrecife en primer plano con *parallax* fuerte | **Leer y usar las corrientes** | Erizo coralino, anémona pegajosa, pulpo camuflado, almeja portón | **Pulpa, Guardiana del Arrecife**: tres brazos abren y cierran tres puertas en ciclo de 2 s. Se le devuelve una perla que perdió |
| 3 | **Crepuscular** | 600–1.800 m | 3 | Azul-violeta desaturado + puntos bio cian. Misterio | La luz ambiente deja de bastar: viñeta oscura suave | **Reinflar** (bolsas grandes) y plataformas vivas en migración | Banco migratorio, pez linterna señuelo, medusa fría | **Kalamar**, calamar juvenil curioso que quiere jugar. Sus brazos son techos móviles: es un puzle de movimiento, no un combate |
| 4 | **Medianoche** | 1.800–4.000 m | 3 | Negro azulado, **un solo color de acento por escena** | Oscuridad real: fuera del radio de luz la geometría no se dibuja | **Anclarse a la luz** (el tiro a plena potencia ilumina) | Rape farolero, nieve marina, burbuja de metano | **Farola**, rape gigante que ha olvidado su luz. Se le devuelve una chispa; a cambio ilumina el cañón a ráfagas de 1,5 s |
| 5 | **Abisal** | 4.000–6.500 m | 3 | Gris-azul casi monocromo + naranjas cálidos en las fumarolas | Llanura vacía y solemne, nieve marina densa cayendo | **Cabalgar la fumarola** (el primer momento en que subir es correcto: la cámara abre su ventana de ascenso, §4.3) | Gusanos tubícolas, isópodo rodante, charcas de salmuera | **Tenaza**, cangrejo guardián del respiradero: pinzas que barren como muros móviles cada 3 s. Detrás, la **ballena caída** |
| 6 | **Fosa hadal** | 6.500–10.935 m | 4 | Negro casi puro + un único dorado reservado a la meta | Paredes de fosa visibles y estrechas a ambos lados | **Encadenar rebotes de pared** | Anfípodo gigante, muro de presión, fauna endémica | **Ámbar y el Guardián de la Fosa**: no hay combate, hay una entrega. Fin de campaña |

### 3.3 La estación de descanso

Entre Inmersiones hay siempre una estación ocupando toda la anchura y **el sexto chunk de la Inmersión** (240 px): banco de coral, jardín de anémonas, campo de bioluminiscencia, ballena caída. Funciones, **todas simultáneas**:

1. Recarga completa de Aire **hasta el máximo de la zona en la que se entra** (§2.6) y reinflado al tamaño de esa zona. Es el único punto donde cambia la capacidad, y por eso el cambio nunca se siente como un robo.
2. Checkpoint permanente en modo Expedición.
3. **Introducción aislada del verbo nuevo** (solo en la primera estación de cada zona): un chunk de tutorial sin ningún peligro, donde el verbo es la única forma de avanzar.
4. Respiro audiovisual: 4 s sin peligro, música que respira, una ficha del bestiario desbloqueada.
5. Pantalla de resumen de Inmersión: profundidad, perlas, conchas. **Punto natural de cierre de sesión.**
6. En la última estación de cada zona: **la entrega del recado y la Postal.** Es el pico de dopamina del juego.

**Valoración de tienda: fuera del pico y detrás de una puerta parental.** La v1.0 pedía la valoración a un niño de 7–12 años en el momento de máxima euforia, que es a la vez lo menos defendible y lo que un revisor de políticas mira primero. Regla nueva: la petición **no aparece nunca dentro del descenso ni en una entrega de Postal**; vive en el **menú principal**, solo tras completar la Zona 3, **una sola vez**, y **detrás de la puerta parental de §6.6** (la misma que protege anuncios y enlaces externos). Si la puerta no se resuelve, no se pide y no se vuelve a ofrecer.

## 4. Reglas de diseño de nivel

### 4.1 Chunks autorales, ensamblaje procedural

**Ni 100% procedural ni 100% artesanal.** Modelo *Spelunky*: biblioteca de piezas hechas a mano, ensamblaje por reglas.

- Un **chunk** mide **540 × 240 px**: **tres ventanas de ancho** (§11.1) por 0,75 pantallas de alto. **Su esquema es exactamente el `Chunk` de §11.2 y no hay ningún otro**: `id`, `zone`, `difficulty 1–5`, `verbs[]`, `entryAnchorId`, `exitAnchorId`, `airBudget`, `targetTimeS`, `tags[]`, `entities[]`. **Ya no hay carriles `L/C/R` ni "boca de entrada"** (v1.2, D3): la continuidad entre chunks la garantiza únicamente la regla de alcance 2D entre anclajes (§11.5.11). Un chunk puede declarar varios anclajes de salida candidatos, pero el validador certifica al menos la ruta declarada. Las bolsas de aire y las perlas **son entidades** dentro de `entities[]`, no campos propios; el presupuesto de aire que lee la regla §11.5.7 es `airBudget`.
- **3–5 anclajes de reposo por chunk** (v1.2, D4), en vez de los 1–2 de la v1.1: con 540 px de ancho y un tiro que ya no cruza un chunk entero (§2.2), cada pantalla ofrece varias rutas. Repisas **más y más cortas** (24–48 px), más rebotes y más decisiones por pantalla.
- **Biblioteca objetivo: 24 chunks por zona (144 en total).** Con **histograma de dificultad obligatorio**: al menos **4 chunks de cada nivel 1–5 por zona**. Sin ese histograma el selector se queda sin candidatos legales, que es lo que le pasaba a la v1.0.
- El generador encadena chunks respetando la **continuidad por anclajes** (§11.5.1), la **regla de alcance 2D** (§11.5.11) y la anti-repetición, con un **orden de relajación explícito** cuando no hay candidatos (§11.5.12): nunca se bloquea.
- **Artesanales obligatorios**, nunca procedurales: el primer chunk de cada zona (tutorial aislado del verbo), el chunk de jefe, la estación de descanso y **los tres primeros chunks de la partida** (la primera impresión no se deja al azar).
- **Inmersiones 1–8 (zonas 1 y 2 y la primera de Z3): secuencia fija a mano.** Ahí se gana el D1. **De la 9 en adelante, ensamblaje procedural** con **semilla fija por Inmersión**: todos los jugadores juegan la misma Inmersión 12, lo que permite depurarla y hablar de ella. Esa promesa exige determinismo entre dispositivos, y por eso la simulación vive en `packages/core` con paso fijo y aritmética propia, no en un motor de terceros (§11 y §10.3).
- **Consecuencia de alcance:** el ensamblador procedural **no entra en el MVP**, porque en el MVP no se juega ni una sola Inmersión procedural (§12.1). Lo que sí entra es el **validador**: las mismas reglas de §11.5 ejecutadas sobre las secuencias escritas a mano, en test. El generador que las consume se construye en H3, cuando hay contenido que generar.

### 4.2 Curva de dificultad

Con `p = (profundidad − inicio_zona) / (fin_zona − inicio_zona)`:

```
dificultad_objetivo = clamp( 1 + 2,8·p + 0,6·racha_limpia − 1,2·penalización , 1 , 4,6 )
```

- `racha_limpia` = chunks consecutivos sin perder Aire, saturado a 1,0 tras 4 chunks.
- `penalización` = 1,0 si se han perdido 2 Aires en los últimos 20 s; se desactiva tras 3 chunks limpios.
- El techo de **4,6** (y no 5) es intencionado: con el techo en 5 el final de cada zona quedaba clavado en el máximo y la curva se convertía en una sierra 5-2-5-2. Con 4,6 el selector alterna entre 4 y 5 y la regla del respiro tiene aire para trabajar.

Tres reglas que **dominan a la fórmula** y se implementan como restricciones del generador, no como directrices sueltas:

1. **Regla de aislamiento didáctico.** Las dos primeras apariciones de un peligro nuevo salen **solas** en el chunk, sin ningún otro peligro. A partir de la tercera se pueden combinar.
2. **Regla del respiro.** Tras cualquier chunk de `dificultad ≥ 4`, el siguiente debe tener `dificultad ≤ 3`, y **no puede haber más de dos chunks de dificultad ≥ 4 en la misma Inmersión**. El ≤ 2 de la v1.0 producía una sierra en lugar de una curva y dejaba al selector sin candidatos; ≤ 3 mantiene la respiración y multiplica el conjunto legal.
3. **Regla de misericordia (anti-abandono).** Si el jugador falla la misma Inmersión **2 veces**, el generador baja silenciosamente la densidad de peligros un **20%** y añade **una bolsa de aire**. Al **cuarto** fallo, la reducción sube al **35%** y se añade una segunda bolsa. **Nunca se le dice al jugador.** Se revierte al superarla. Está desactivada en modo Abismo. Es el sistema anti-churn más importante del documento, y **actúa siempre antes que cualquier oferta comercial** (§6.5): la ayuda gratuita y silenciosa llega en el segundo fallo; ninguna oferta de vídeo aparece antes del cuarto.

**Balance de aire.** El generador acumula el `airBudget` de los chunks y lo compara con el drenaje esperado del tramo, medido **contra la capacidad de Aire de la zona** (§2.6), no contra el máximo base. Ratio oferta/demanda objetivo: **1,15** en Z1–Z2, **1,05** en Z3–Z4, **0,95** en Z5–Z6. A partir de ahí el jugador debe *jugar bien*, no solo recolectar.

La dificultad entre zonas sube por **verbos acumulados**, no por números: Z1 pide 1 verbo, Z6 pide 6 combinados. La reducción de puntos de trayectoria (6→2) endurece la ejecución sin tocar velocidades ni tamaños.

### 4.3 Cámara: trinquete con banda de retorno

La v1.0 tenía una cámara que **jamás** retrocedía. Era incompatible con media docena de decisiones del propio documento: la reaparición en el último techo de reposo (que por definición queda por encima), el verbo estrella de la Zona 5 ("cabalgar la fumarola", +500 px/s hacia arriba), la burbuja de metano ("empuje de ~2 pantallas", pensada para alcanzar un tesoro elevado) y todos los rebotes que devuelven a Bur hacia arriba. Con el trinquete absoluto, cada uno de ellos era una espiral de resaca. La regla nueva conserva el trinquete donde importa y abre exactamente el hueco que el diseño necesita:

- **El progreso es un trinquete y no se toca.** `maxY` (profundidad conquistada, checkpoints, boyas, marcador de metros) **nunca disminuye**. Esa es la regla que define el género y sigue siendo absoluta.
- **La vista tiene una banda de retorno.** La cámara puede subir hasta **96 px por encima de su máximo** (`CAM_RECALL_PX`) y ahí se para. Es medio "salto" de Bur: suficiente para ver el techo del que acabas de salir, para que la reaparición de la resaca sea visible, y para que un rebote hacia arriba se lea como un rebote y no como una amenaza. No es suficiente para deshacer progreso ni para hacer *camping* arriba.
- **Ventana de ascenso (`ASCENSO`).** Mientras Bur esté dentro de un campo de fuerza ascendente (fumarola, burbuja de metano) y durante **2,0 s** después de salir de él, la banda de retorno se abre a **640 px (2 pantallas)** y **la resaca queda suspendida**. Subir deja de ser un fallo y pasa a ser el verbo de Z5, que es lo que el documento prometía. Al expirar la ventana, la cámara vuelve a bajar con `lerp` normal hasta su máximo, sin tirón.
- **Zona muerta**: Bur se mantiene entre el **34% y el 56%** de la altura de pantalla. Dentro de esa banda la cámara no se mueve. El anclaje alto deja más mundo visible por debajo, que es hacia donde el jugador apunta.
- **Resaca**: si Bur sube por encima del borde superior con la cámara **ya tocando su límite de retorno** y sin `ASCENSO` activo, empieza la resaca (§2.4). Así el aviso solo aparece cuando de verdad te estás yendo del nivel.
- Si Bur desciende más rápido que la cámara, el cap de 520 px/s más un `lerp` acelerado (hasta 0,34 cuando la distancia supera 90 px) evitan que salga por abajo. **Caso extremo** (salida de fumarola, rebote encadenado o corriente descendente de Z6): si `|vel.y| > 420 px/s` en cualquiera de los dos sentidos, 200 ms de *zoom-out* del 8%.
- **En X sí hay scroll (v1.2, D3).** El mundo mide **540 px de ancho** (`WORLD_W`) y la ventana **180** (`VIEW_W`): la cámara sigue a Bur también en horizontal, con **zona muerta `CAM_DEADZONE_X = [0,35 · 0,65]`** del ancho visible —dentro de esa banda no se mueve— y **recorte duro a `[0, WORLD_W − VIEW_W] = [0, 360]`**, de modo que nunca se ve fuera del mundo. En X no hay trinquete: la vista va y vuelve libremente, porque explorar de lado es el punto. Paredes laterales **sólidas** en `x < 0` y `x > 540` en todas las zonas (arrecife decorativo en Z1–Z3, pared de fosa en Z6).
- **Referencia de sensación: *Hungry Shark*.** Agua abierta con estructuras dispersas, coleccionables que invitan a desviarse en lateral y el descenso como objetivo de fondo. El **tercio inferior de la pantalla sigue despejado** para el pulgar (§8), y con el tirachinas de §2.1 —que se puede iniciar en cualquier punto— toda la dirección es alcanzable desde ahí.
- **Corriente mínima**: desde la Zona 3, la cámara desciende sola a **8 px/s** como mínimo. No es una persecución: es una presión constante que impide el *camping* sin generar prisa. **Se suspende mientras `ASCENSO` está activo** (si no, la fumarola competiría contra la propia cámara).
- El *streaming* mantiene instanciados los chunks que la banda de retorno puede mostrar (§11.5.10): con retorno abierto, hasta **5**. Que la reaparición pudiera caer en un chunk ya destruido era otro fallo de la v1.0.
- **Ojeo con el minimapa (v1.2, D5).** Un tercer eje, de presentación pura: `camera.peekX/peekY` se suman a esta cámara (nunca la modifican) para producir `renderX/renderY`, el punto donde el shell coloca de verdad la vista. El jugador lo pide manteniendo el dedo sobre el minimapa de la HUD (§8), que centra la vista en el punto tocado; al soltar, la vista vuelve a Bur con `PEEK_RETURN_LAMBDA`. Sirve para mirar la repisa que un tiro de D4 no alcanza a mostrar en una sola pantalla, sin competir con el gesto de tirachinas de D2 porque usa un dedo aparte. Nunca enseña más allá de lo que el *streaming* tiene cargado, ni desplaza `maxY`, la resaca o el trinquete.

## 5. Catálogo de peligros y criaturas (25)

Todo es fauna, nunca maldad. **Ninguna entrada inflige más de 1 Aire por contacto.** Todos tienen un contraataque claro y aprendible en un solo encuentro, y todos se distinguen por **silueta y movimiento** además de por color (cobertura de daltonismo por diseño).

**Regla de dirección del catálogo (nueva y transversal).** Este es un juego que castiga subir. Por tanto **ningún empuje de fauna es vertical hacia arriba salvo los dos que existen para eso** —la Fumarola (nº 21) y la Burbuja de Metano (nº 20)—, que además abren la ventana de ascenso de la cámara (§4.3) y por eso son seguros. Todos los demás empujes son **laterales o descendentes**. La v1.0 llenaba el catálogo de trampolines hacia arriba en un juego cuya cámara los penalizaba, empezando por la primera criatura que ve el jugador; las filas de abajo lo corrigen una por una.

| # | Nombre | Zona | Comportamiento | Cómo se contrarresta |
|---|---|---|---|---|
| 1 | **Medusa Farolillo** | Z1+ | **Techo no capturable** con restitución 0,92: se coloca siempre como cara inferior, de modo que Bur la golpea **subiendo** y sale **disparada hacia abajo**. Tras el rebote se desinfla 600 ms y Bur la atraviesa | Aliado disfrazado de peligro y **primera lección del juego, en la dirección correcta**: convierte tu ascenso inevitable en descenso gratis sin gastar un tiro. No se puede reposar en ella (por eso no hay castañeo ni Aire gratis) |
| 2 | **Alga Cinta** | Z1–Z2 | Techo blando, absorbe el 82% de la velocidad | Superficie de reposo segura, pero te frena |
| 3 | **Tortuga Paseante** | Z1 | Techo móvil lento (25 px/s lateral) | Reposar encima y dejar que te coloque: viaje gratis |
| 4 | **Banco de Peces Payaso** | Z1 | Cruza en horizontal y se aparta al acercarte | Decorativo y vivo; atravesarlo da 1 perla |
| 5 | **Don Hinchón** | Z1 (jefe) | Se infla cada 3 s y empuja radialmente 200 px/s | Tirar desde el reposo en su ventana desinflada de 1,2 s. No se derrota: se le hace reír |
| 6 | **Erizo Coralino** | Z2+ | Estático sobre repisas, −1 Aire | Nunca se mueve: es puntería pura. Su naranja rompe la paleta a propósito |
| 7 | **Anémona Pegajosa** | Z2 | Atrapa 0,8 s; si sigues dentro a los 1,5 s, ventila 1 Aire (es la cuarta forma de perder Aire, §2.4) | Escapar cuesta un tiro del 60% (42 px de arrastre), que cabe de sobra en la ventana de 1,5 s, y **no gasta el doble salto ni un pip** (§2.4.5): recurso, no muerte, también con el último pip |
| 8 | **Corriente de Arrecife** | Z2+ | Banda horizontal ±90 px/s, visible como partículas | Lanzarse contra ella, o cabalgarla para alargar el tiro gratis |
| 9 | **Pulpo Camuflado** | Z2 | Parece repisa; a los 0,5 s de reposo te desplaza suave | No quedarse quieto. Parpadea 0,4 s antes: enseña a mirar antes de saltar |
| 10 | **Almeja Portón** | Z2 | Abre y cierra con ciclo de 2 s; al cerrarse **te escupe en lateral, hacia el hueco contiguo**, nunca hacia arriba | *Timing* puro; un chirrido avisa 0,5 s antes. Fallar cuesta posición, no altura |
| 11 | **Pulpa, Guardiana del Arrecife** | Z2 (jefe) | Tres brazos abren y cierran tres puertas, ciclo 2 s | Ritmo: entrar en el compás correcto. Se resuelve devolviéndole su perla |
| 12 | **Banco Migratorio** | Z3+ | Muro de peces que asciende; ralentiza un 60% y **arrastra en lateral** (el banco cruza, no eleva) | Esperar el hueco, o atravesarlo a plena potencia, o dejarse llevar en lateral para recorrer mundo gratis |
| 13 | **Pez Linterna Señuelo** | Z3+ | Finge ser repisa luminosa y desaparece al acercarte | *Tell* legible: las repisas reales pulsan a 1 Hz, los señuelos a 3 Hz |
| 14 | **Medusa Fría** | Z3+ | Campo frío: −25% de potencia de tiro durante 2 s | Tirar antes de entrar, o rodearla |
| 15 | **Bolsa de Aire Grande** | Z3+ | Reventable: reinfla un escalón de tamaño durante 12 s | Premio en Z3–Z5; **trampa en Z6**, donde el tamaño impide pasar las rendijas |
| 16 | **Kalamar** | Z3 (jefe) | Curioso, sigue a Bur; sus brazos son techos móviles | No hace daño: es un puzle de movimiento |
| 17 | **Oscuridad** | Z4+ | Sistema: fuera del radio de luz la geometría no se dibuja | Un tiro al 100% ilumina 14 px durante el vuelo |
| 18 | **Rape Farolero** | Z4 | Patrulla lenta; su linterna revela 40 px | Orbitar la luz sin tocar el cuerpo (−1 Aire). Peligro y herramienta a la vez |
| 19 | **Nieve Marina** | Z4–Z5 | Grumos que caen; techos temporales que se disuelven en 2,5 s | Usarlos rápido; encadenar antes de que se deshagan |
| 20 | **Burbuja de Metano** | Z4–Z5 | Asciende rápido desde el fondo; empuje de ~2 pantallas. **Abre la ventana de ascenso de la cámara** (§4.3): mientras dura, la vista te sigue y la resaca está suspendida | Esquivarla, o usarla a propósito para alcanzar un tesoro elevado. Es uno de los dos únicos empujes hacia arriba del juego, y es seguro por diseño |
| 21 | **Fumarola Hidrotermal** | Z5+ | Columna ascendente +500 px/s; núcleo caliente de 12 px = −1 Aire. **Abre la ventana de ascenso** (§4.3) mientras la cabalgas y 2 s después | Cabalgar el borde para alcanzar rutas laterales que saltan un tramo entero. Al salir se llega a los techos por encima de 260 px/s: se rebota, no se reposa (§2.3), y ahí está la habilidad |
| 22 | **Charca de Salmuera** | Z5 | Flotabilidad 0, impulso al 40%, hundimiento a 60 px/s | Entrar con velocidad acumulada; sus orillas concentran burbujitas |
| 23 | **Isópodo Rodante** | Z5 | Se enrosca y rueda por el suelo; empuja **en la dirección en que rueda**, no daña | Golpearlo de costado conserva casi todo tu horizontal y te lanza en lateral hacia el siguiente anclaje: velocidad gratis sin perder profundidad |
| 24 | **Tenaza, Cangrejo Guardián** | Z5 (jefe) | Pinzas que barren como muros móviles cada 3 s | Reposar entre barridos; ventanas de 1,4 s |
| 25 | **Anfípodo Gigante / Muro de Presión** | Z6 | Salta de pared a pared y bloquea el corredor 1 s; las paredes se estrechan y tienen restitución **0,85** | Encadenar rebotes al ritmo de sus saltos: con la amortiguación horizontal a 0,30 /s y esa restitución, el horizontal aguanta el encadenado (§2.2). El paso solo cabe si Bur es pequeña, y por eso **nada comprable agranda a Bur** (§6.2) |

---

## 6. Meta-progresión y economía

**Sin energía, sin vidas de espera, sin temporizadores, sin cajas de botín. Nunca.** Un sistema de energía en un juego infantil es a la vez anti-retención (corta la sesión justo cuando funciona) y éticamente indefendible. Queda descartado como decisión de proyecto, no como omisión.

**Principio: la meta-progresión no compra dificultad, compra permanencia.** Un niño que falla mucho debe seguir avanzando en algo.

### 6.1 Moneda y coleccionables

- **Perlas de luz**: 1–3 por chunk. **Moneda única.** Se obtienen jugando y **nunca se venden por dinero real**.
- **Conchas de recuerdo**: 3 por Inmersión — (1) llegarla al final, (2) recoger las 5 perlas grandes, (3) terminarla sin perder Aire. Invitan a rejugar sin obligar.
- **Postales**: 1 por zona + 6 secretas. Son la historia y el motor de "hay correo nuevo".
- **Álbum de Fauna (32 fichas)**: se rellena al acercarse a cada criatura. **Cada ficha lleva un dato real de ciencia oceánica en una frase** ("el isópodo gigante puede pasar años sin comer"). Cuesta poquísimo producir, da una razón de exploración no competitiva, y es el gancho que hace que un padre o un maestro apruebe el juego.

### 6.2 Mejoras permanentes (4 vías × 3 niveles, techo bajo a propósito)

| Vía | N1 / N2 / N3 | Coste (perlas) |
|---|---|---|
| Capacidad de Aire | +1 / +2 / +3 pips **sobre el máximo de la zona** (§2.6) | 150 / 400 / 900 |
| Piel de nácar (aislamiento) | drenaje pasivo por presión −10% / −20% / −30% (25 s → 27,8 / 31,3 / 35,7 s) y +0,3 / +0,6 / +1,0 s de reposo | 200 / 500 / 1.100 |
| Radio de luz | +25% / +50% / +75% | 180 / 450 / 1.000 |
| Imán de perlas | 12 / 20 / 30 px | 120 / 300 / 700 |

Techo total ≈ 5.700 perlas ≈ 25–35 partidas. **Ninguna mejora cambia la física del impulso ni el radio de Bur: la habilidad no se compra.** Criterio duro de QA: **la campaña completa debe ser terminable con todas las mejoras a cero.**

**Por qué la vía de presión cambió de "Resistencia a la presión" a "Piel de nácar".** La versión anterior reducía la curva de encogimiento, es decir, **compraba radio**. Y como el impulso escala con el radio, compraba potencia: un +30% de radio en Z6 daba un +13% de impulso, lo que falsificaba la frase "ninguna mejora cambia la física del impulso" en la misma página en que se escribía. Peor: un radio permanentemente mayor es un **reinflado irreversible**, y §5 nº 25 dice que el corredor hadal "solo cabe si Bur es pequeña" — o sea, era un objeto de tienda capaz de bloquear la zona final. Y como los vídeos recompensados doblan perlas, era además un anuncio que compra habilidad, prohibido por §6.5. La vía nueva mantiene la fantasía ("aguantas mejor la profundidad") tocando solo el **reloj** de presión y el tiempo de reposo: nada de física, nada de radio, nada bloqueable.

### 6.3 Estilos de partida

Antes de bajar se elige 1 de 3 (desbloqueados a 800 / 2.500 / 5.000 m). **Se desbloquean jugando y se eligen siempre gratis: no se compran con perlas ni con dinero ni con vídeo** (§6.5). Son variantes de un mismo trato, no niveles de poder, y por eso cada uno cuesta algo:

- **Ágil**: impulso +12%, Aire máximo −1.
- **Coraza**: ignora el primer golpe de cada zona; perlas −15%.
- **Farolero**: radio de luz ×1,6, velocidad terminal de caída −10%.

### 6.4 Cosmética y dailies

12 aspectos de burbuja (pompa de jabón, chicle, arcoíris, tinta…) y 6 estelas. **Solo con perlas o por hito narrativo; nunca con dinero.** Cero efecto en el juego.

**Misiones diarias**: tres al día, presentadas como recados del Buzón de la Espuma ("llega a 1.800 m", "rebota en 15 medusas", "cruza una fumarola sin daño"). 40–120 perlas cada una. Viven fuera del *loop*, jamás lo interrumpen.

### 6.5 Vídeo recompensado

Máximo **3 oportunidades por sesión**, siempre *opt-in*, siempre en momento de alta agencia, **jamás a mitad de partida**, y **siempre detrás de la puerta parental de §6.6**:

1. **"Segundo aliento"** en la pantalla de fin: continuar a la misma profundidad con 3 Aire. Una vez por partida, y **solo se ofrece a partir del cuarto fallo de la misma Inmersión**.
2. **Doblar las perlas** de una Inmersión o de una misión diaria.
3. **Rebarajar las tres misiones diarias** del Buzón. *(La v1.0 ofrecía rebarajar los tres Estilos; como el Estilo "Ágil" toca el impulso, eso era literalmente un anuncio que compra potencia, prohibido por este mismo apartado. Los Estilos se sortean y se eligen siempre gratis.)*

**El orden importa y es una regla de producto, no una preferencia.** La ayuda **gratuita, silenciosa e invisible** (regla de misericordia, §4.2.3) entra en el **segundo** fallo; la primera **oferta comercial** no aparece hasta el **cuarto**. La v1.0 lo tenía al revés —anuncio en el segundo fallo, ayuda gratis en el tercero—, es decir, monetizaba la ventana de frustración de un niño antes de ayudarle. Invariante verificable en test: `primerFalloConOferta > primerFalloConMisericordia`.

**Los tres huecos existen en el layout desde la v1, maquetados**, para que la interfaz no se rediseñe nunca por una decisión de monetización. Nunca: intersticiales, banners sobre el HUD, anuncios antes de la primera partida, anuncios que bloqueen progresión de campaña, ni recompensas que compren habilidad (con la vía de presión corregida en §6.2, ninguna mejora comprable toca la física).

**Nada de cambiar las reglas después de instalar.** La v1.0 planeaba lanzar sin anuncios y encender el `AdProvider` real "después del lanzamiento inicial", contra unas fichas de tienda y una declaración de seguridad de datos hechas sin anuncios. Eso es un cambio de trato con el padre que ya instaló. Regla nueva y firme:

- **La versión que se lanza con anuncios los tiene activos el día 1**, declarados en la ficha, en la Data Safety / App Privacy y en el texto para familias.
- **La versión que se lanza sin anuncios no los tendrá nunca.** Si el *owner* elige el modelo mixto (§10.8), son **dos SKU distintos**: "Deeply Bubbly" (pago único, sin anuncios, para siempre) y "Deeply Bubbly Free" (gratis, con los tres recompensados). Ningún SKU cambia de naturaleza con una actualización.

### 6.6 Cumplimiento, edad y protección de menores

Sección nueva. La v1.0 declaraba cumplimiento sin especificar ni una sola pieza del mecanismo, que es exactamente lo que hace caer una revisión de tienda.

- **Pantalla de edad neutra** en el primer arranque: se pide **año de nacimiento** en una rueda neutra, sin marca, sin recompensa por mentir y sin repetirla en cada arranque. El resultado ramifica la sesión en "público infantil" (por defecto si no se responde) y "adulto".
- **Puerta parental** (`ParentalGate`) delante de **todo lo que sale del juego**: oferta de vídeo recompensado, petición de valoración de tienda, enlaces externos, redes sociales, permiso de notificaciones y ajustes de privacidad. Implementación: operación aritmética de dos cifras con temporizador, sin texto explicativo largo, saltable solo resolviéndola. Es la única parte del producto donde hay texto y números por obligación regulatoria y no cuenta contra el pilar 5.
- **SDK de anuncios**: únicamente uno certificado por el **programa Families de Google Play** (Google AdMob con `tagForChildDirectedTreatment` / TFCD activado y `maxAdContentRating = G`) y conforme a la **política de audiencia infantil de la App Store** (`SKAdNetwork`, sin IDFA, sin ATT porque no se rastrea). **Sin publicidad personalizada, sin recogida de datos de menores, sin identificadores publicitarios, sin SDK de terceros de analítica.** Telemetría: **local en el dispositivo**, agregada y anónima, exportable solo por el propio usuario.
- **Sin cuentas, sin login, sin chat, sin contenido generado por usuarios, sin compras dentro de la app en la versión infantil.** Guardado local; la nube queda fuera del alcance (§12.2).
- **Cumplimiento declarado con nombre**: Families Policy de Google Play, Kids Category de la App Store, COPPA y RGPD-K. La ficha de tienda, la Data Safety y el texto de privacidad se escriben **antes** de H4, no después, y se revisan contra §6.5 y §1.2.

---

## 7. Checklist de *feel* y *juice*

El juice es capa de producto, no decoración. Mínimos exigibles para considerar "hecho" el core:

- **Squash al tirar**: escala vertical 1,00 → 0,78 y horizontal → 1,22 mapeadas a la potencia del arrastre (0 → 70 px), con oscilación senoidal de 12 Hz y amplitud del 3% (la burbuja vibra de tensión). Los ojos se desplazan hacia la dirección de tiro.
- **Anticipación**: 3 burbujitas orbitan a Bur mientras se apunta, más rápido cuanta más potencia.
- **Stretch al soltar**: 1,35 en el eje de vuelo durante 120 ms, con vuelta en `easeOutElastic`.
- **Impacto**: aplastamiento a 0,70 en el eje de colisión durante 90 ms + rotación amortiguada de ±8°.
- **Partículas**: 6–10 microburbujas al soltar (en la cola), 12 al impactar, 14 al hacer *pop*; capa ambiental de nieve marina desde Z4 (120 partículas, *parallax* 0,3, delante de todo).
- **Screen shake**: **solo** en impactos > 400 px/s (2 px, 120 ms) y en puertas de jefe (4 px, 200 ms). **Cero shake al perder Aire** (agita a los jugadores pequeños): ahí se usa un *zoom punch* de 1,02× durante 100 ms.
- **Hitstop**: 40 ms al perder Aire, 90 ms al hacer *pop*.
- **Cámara**: *lookahead* de 20 px en la dirección del impulso con `lerp 0,12`; *zoom-out* del 5% con la goma estirada al máximo (comunica ambición).
- **Sonido**: tensar = "glub" ascendente de 200 → 600 Hz mapeado a la potencia del arrastre (**el oído sabe cuánto llevas sin mirar**), y un "clic" seco al entrar en el radio de cancelación; soltar = *pop* con *pitch* inverso a la potencia; rebote = 3 muestras por material con *pitch* según velocidad de impacto y ±8% aleatorio; coleccionable = nota de una escala pentatónica que asciende con la cadena de rebotes; ambiente por zona con filtro paso-bajo que baja de 12 kHz a 800 Hz de Z1 a Z6 (**la profundidad se oye**); la música del menú gana un instrumento por cada Postal conseguida.
- **Háptica** (Capacitor Haptics): `light` al soltar y al alcanzar el 100% de potencia, `medium` al perder Aire, `heavy` solo en jefes. Desactivable; apagada por defecto en tablets.
- **Regla de oro del juice**: ningún efecto puede tapar la trayectoria punteada ni los pips de Aire.

---

## 8. UI/UX en portrait

**Escalado (decisión revisada).** `pixelArt: true`, `roundPixels: true`, sin *anti-aliasing*. La v1.0 pedía a la vez `Scale.FIT` y "escalado entero": son incompatibles —FIT escala por un factor fraccionario y `autoRound` solo redondea a píxeles de dispositivo—, y en un 1284 × 2778 daba 7,13×, con muestreo no entero y parpadeo en un juego cuyo argumento de legibilidad es el vecino más próximo. Regla nueva:

- **Ventana fija de 180 px de diseño; altura elástica.** El zoom es **`floor(anchoDispositivo / 180)`**, siempre entero. La altura visible resultante (`alto / zoom`, redondeada hacia abajo) se sitúa entre **320 y 420 px de diseño**: en pantallas altas **se ve más mundo por abajo**, nunca menos, lo cual encaja con el juego (se apunta hacia abajo). Modo Phaser: `Scale.RESIZE` con la cámara fijada a esos 180 px de ancho. El **mundo** mide 540 px: la ventana es un tercio de él y se desplaza en X (§4.3).
- **Nada de diseño depende de la altura exacta.** Toda la maquetación del HUD y todas las constantes de cámara están en fracciones de `H` (la altura visible real), no en píxeles absolutos. `H` se recalcula al rotar o al cambiar de tamaño.
- **Bandas de seguridad.** El HUD se coloca dentro de `env(safe-area-inset-*)`: nunca bajo la muesca, la cámara frontal ni la barra de estado. Si los insets superiores comen más del 12% de la altura, el HUD baja y el mundo se recorta por arriba, nunca al revés.
- **Bloqueo de orientación en *portrait*** y **pausa automática al perder el foco** (`blur`, llamada entrante, cambio de app), con reanudación por toque.
- **Audio: en iOS no puede sonar nada antes del primer toque.** El tutorial está diseñado para que su primer paso sea **mudo por definición** y toda la información llegue por imagen; el audio se desbloquea en el primer `pointerdown` y a partir de ahí las señales críticas son redundantes en audio y vídeo.

- **HUD mínimo, en la banda superior (~12% de la altura útil, bajo los insets):**
  - **Arriba-izquierda**: pips de Aire, burbujitas de 6 × 6 px. Los pips bloqueados por presión se dibujan atenuados (§2.6).
  - **Arriba-derecha**: medidor de profundidad como cinta vertical de 8 px de ancho con marcas de zona y un pez-marcador que baja, más la cifra en metros y, en gris, una raya con el récord (una raya, no un número que compita).
  - **Arriba-centro**: pausa. Icono de 10 px, **área táctil real de 44 pt**.
  - **Tercio inferior siempre despejado**: ahí vive el pulgar. Como el tirachinas de §2.1 se ancla **donde toques**, todo el cono de 90° se alcanza desde esa banda sin estirar la mano ni tapar a Bur.
  - **Minimapa (v1.2, D5), arriba-centro, justo debajo de la banda del HUD**: 54×60 px de mapa (`MINIMAP_SCALE = 0,1` sobre 540×600 px de mundo), centrado horizontalmente, panel semitransparente con borde de 1 px. Dibuja repisas (capturables e incapturables), peligros, coleccionables, campos de fuerza, boyas y estaciones, el marco de la vista actual y a Bur (2×2 blanco con filo oscuro, sujeto al panel: es la única forma del mapa que no se confunde con un coleccionable, y con la vista ojeada lejos es el único sitio donde Bur se ve); alpha completo en reposo/apuntando/ojeando, atenuado el resto del tiempo. Zona táctil de al menos 44 pt aunque el mapa dibujado sea más pequeño. Un dedo mantenido sobre él **se traga el toque** (no inicia tirachinas) y **centra la vista** en el punto tocado —el "ojeo" de D5—; al soltar, la vista vuelve a Bur. No ocupa el tercio inferior ni compite con el gesto de tirachinas: usa un segundo dedo.
- **Cifra de profundidad: legible y localizada.** Formato con `Intl.NumberFormat` de la locale activa (`10.935 m` en ES/PT/DE, `10,935 m` en EN, `10 935 m` en FR): la cifra de la v1.0 se leía como "diez coma nueve metros" para un angloparlante. Además, como la escala metros/píxel varía 11× entre zonas (§11.1), **el contador se suaviza**: interpola hacia el valor real con un tope de **9 m por *frame***, de modo que en Z6 no salta a saltos ilegibles. La cinta lateral interpola por zona y muestra las marcas de zona como referencia estable.
- **Indicador del tirachinas (tres canales redundantes para el mismo dato):** (1) una **banda elástica** dibujada del `aimOrigin` al dedo, que es el gesto mismo hecho imagen; (2) un **anillo de potencia** alrededor de Bur que se rellena de 0 a 360° con `p = |d| / 70`; y (3) la **trayectoria punteada** del tiro que saldría. Dentro del radio de cancelación (12 px) la banda no se dibuja, el anillo se muestra **vacío y atenuado** y no hay trayectoria: se ve que ahí no hay tiro. Si el arrastre pide subir, la guía y el anillo pasan a **ámbar** para avisar de que la dirección se ha recortado a la horizontal. El anillo **parpadea en rojo suave cuando queda un solo pip**, momento en que el doble salto deja de estar disponible (§2.1). Más el tono de audio afinado del §7.
- **Colores de UI reservados**: blanco puro, ámbar y el cian de interfaz **no aparecen jamás en el mundo**. La interfaz se lee aunque el fondo sea negro.
- **Tutorial de primera partida (< 25 s, diegético, sin una sola palabra):** (1) Bur sube sola y se queda quieta bajo un techo de espuma; el jugador toca por instinto (paso mudo por el desbloqueo de audio de iOS: todo se cuenta con movimiento). (2) Una mano fantasma **arrastra hacia arriba unos 45 px y suelta**; la banda elástica se tensa y el arco punteado aparece exagerado hacia abajo. La mano **enseña también una cancelación**: un segundo arrastre vuelve al origen y no pasa nada, para que el niño descubra que probar es gratis. (3) Un único posadero al que es imposible no llegar. (4) La primera burbujita de aire brillando. (5) Tortu asoma y el juego empieza. Sin modales, sin "OK". Se salta con un toque y no vuelve a aparecer.
- **Fin de Inmersión (< 2,5 s si el jugador machaca el botón):** profundidad, 3 conchas animándose una a una, perlas, y un botón gigante **"Seguir bajando"** bajo el pulgar. A su izquierda, el hueco secundario maquetado de "Perlas dobles".
- **Fin por fallo:** aparece **700 ms** después del deshinchado, sobre la misma escena y sin carga; el mismo layout, **"Otra vez"** gigante, **reinicio en < 0,8 s medidos desde el toque**. El hueco de "Segundo aliento" existe en el layout desde la v1 y solo se muestra a partir del cuarto fallo de la misma Inmersión (§6.5).
- **Pausa:** congelación con desenfoque y 4 opciones grandes: Seguir, Reiniciar Inmersión, Sonido, Salir. Sin anuncios, sin tienda.
- **Accesibilidad:**
  - modo "sin temblor";
  - modo **"trayectoria asistida"** (arco completo hasta el primer rebote en todas las zonas; no penaliza en Expedición; conserva la rampa porque sigue sin dibujar campos de fuerza ni nada posterior al primer rebote, §2.7);
  - **"tirachinas largo"** (`LONG_SLING_MUL = 1,5`: `PULL_MAX_PX` 70 → **105 px**), sugerido automáticamente tras 5 fallos seguidos. Sustituye a la "carga lenta" de la v1.1, que dejó de tener sentido en cuanto la potencia pasó a ser distancia y no tiempo: aquí **la misma potencia se reparte en un recorrido 1,5× mayor**, de modo que cada muesca de potencia exige un arrastre más largo y, por tanto, más preciso. Es la única constante del gesto que toca: el radio de cancelación, el cono y el tope de apuntado son los mismos para todo el mundo;
  - peligros distinguibles por silueta y patrón además de por color; texto ×1,5; todas las señales críticas duplicadas en audio y vídeo.
- **Dificultad elegible**, nunca llamada fácil/difícil: **"Buceo tranquilo"** (reposo de 6,0 s, gracia de resaca ×1,5, drenaje de presión ×1,4) y **"Buceo profundo"** (valores de esta especificación).

## 9. Hoja de ruta

**H1 — Prototipo de sensación (3 semanas).** Sin arte (cajas de colores). Una burbuja, techos, tirachinas (arrastre/suelta/cancelación), flotabilidad, cámara de trinquete con banda de retorno y seguimiento en X, Aire, un peligro, reinicio. **Integrador y colisión propios en `packages/core`** (paso fijo, círculo barrido contra AABB) — es lo primero que se escribe, porque de él dependen los tests, el determinismo entre dispositivos y el validador de alcanzabilidad. Panel de sliders en vivo para las constantes de §11.6. Tests Vitest headless de potencia por arrastre, presión, cámara y Aire.
*Criterio de salida:* 5 personas ajenas juegan 3 minutos sin explicación y descienden 400 m. **Si la sensación no está aquí, se ajustan constantes, no arquitectura: el motor es nuestro y el panel de tuning existe desde el día 3.**

**H2 — Rebanada vertical (6 semanas).** Zonas 1–3 **jugables y cerradas de diseño**, con **arte final solo en la Zona 1** y Z2–Z3 en *greybox* con la paleta definitiva (ver recorte más abajo). Secuenciador de Inmersiones a mano + **validador** de las reglas de §11.5, 1 jefe, estaciones y boyas, Inmersiones con su pantalla de fin, tutorial, sonido, juice, regla de misericordia, huecos de anuncio maquetados, telemetría local.
*Criterio de salida:* playtest con 8–12 niños de 7–12 años; ≥60% llegan a Z2 en su tercera partida, ≥50% piden "otra vez" sin que se les sugiera, y ninguno pregunta "¿qué tengo que hacer?" pasados los primeros 30 s.

**Recorte de alcance del MVP, explícito y decidido antes del día uno.** La lista de H2 de la v1.0 era de 4–6 meses declarada en 6–7 semanas: física completa, panel de 50 sliders, generador procedural con solver de alcanzabilidad, 44 chunks a mano, 12 peligros, 2 jefes, arte final de tres zonas, juice completo, 12 SFX, tutorial, accesibilidad, telemetría y build web. **Lo que sale del MVP y por qué:**

- **Arte final de Z2 y Z3 → H3.** Es el mayor coste del proyecto (§10.7) y el criterio de salida de H2 es una prueba de *sensación*, que el *greybox* sirve igual de bien. Z1 sí va con arte final, porque la primera impresión y el tutorial sí se juzgan con arte.
- **Ensamblador procedural → H3.** En el MVP no se juega **ninguna** Inmersión procedural (las 6 son a mano, §4.1): construirlo ahí era pagar el sistema más caro del checklist sin poder probarlo contra su propio propósito. En el MVP se construye el **validador** con las mismas reglas.
- **Segundo jefe (Pulpa) → H3.** Uno basta para validar el patrón "no se derrota, se le devuelve algo".
- **Peligros: 12 → 8** (nº 1, 2, 3, 5, 6, 7, 8, 9). **SFX: 12 → 8.** Ambientes de zona: 3 → 2 más el filtro paso-bajo.

**H3 — Contenido y meta (8 semanas).** Arte final de Z2–Z3; zonas 4–6, luz/oscuridad, fumarolas, salmuera, corredor hadal, jefe final y epílogo; **ensamblador procedural con las reglas de §11.5**; jefes 2–5; Postales, Álbum, mejoras, Estilos, dailies, modo Abismo, `AdProvider` no-op cableado, puerta parental y pantalla de edad, empaquetado Capacitor y build de tienda interna.
*Criterio de salida:* campaña completa de superficie a fosa en **18–24 min** con checkpoints (el número único de §3.1 y §11.1); sesión media medida entre 4 y 9 min; 60 fps estables en un Android de gama media de hace 4 años.

**H4 — Publicación.** Balance con datos reales de H3, localización ES/EN/PT/FR/DE (el juego jugable son <40 palabras; el contenido opcional —Postales y Álbum— suma ≈1.500 palabras, que es el presupuesto real y sigue siendo barato), fichas de tienda, cumplimiento de §6.6 y, **si el SKU elegido es el gratuito, los anuncios activos desde el día 1 de ese SKU** (§6.5): ninguna versión estrena anuncios después de haber sido instalada sin ellos.

---

## 10. Riesgos y preguntas abiertas

*Esta es la única sección del documento donde quedan cosas sin cerrar. Cada punto indica **qué números se recalculan** si la respuesta cambia, para que "abierto" no signifique "indefinido".*

1. **La flotabilidad invertida puede desorientar.** Es la apuesta central y no tiene precedente validado en el mercado. *Mitigación:* se prueba en H1 con gente ajena. *Plan B:* gravedad convencional con un "techo de agua" que desciende y empuja, conservando el resto del diseño intacto. *Aguas abajo:* si se activa, se rehacen §2.2 (signo de `BUOYANCY` y tabla de alcance), §2.3 (el reposo pasa a suelos) y §4.3; el resto del documento sobrevive.
2. **Puntería y potencia en un solo gesto puede ser demasiado para un niño de 7 años.** *Pregunta abierta:* ¿se añade una variante "solo potencia" con dirección fija oscilante como modo asistido? Debe medirse en H2. *Plan B implementado tras un flag desde H1:* mitad izquierda / mitad derecha de la pantalla como ángulo fijo de ±30°. *Aguas abajo:* solo §2.1 y `AIM_*`/`PULL_*`; el cono y la zona muerta desaparecen, la tabla de alcance no se toca. (El tirachinas de la v1.2 ya reduce mucho este riesgo: potencia y dirección son **un solo vector visible**, no dos canales.)
3. **Motor físico (riesgo cerrado por decisión, ya no abierto).** La v1.0 apostaba por Matter.js para el movimiento de Bur y a la vez exigía tests headless deterministas en `packages/core` sin importar Matter: eso obligaba a mantener **dos** físicas y a certificar niveles con una que no es la que se juega. **Decisión:** el movimiento de Bur lo simula **`packages/core`** con un integrador semi-implícito de paso fijo 1/60 y colisión de **círculo barrido contra AABB** (toda la geometría del juego son rectángulos alineados). Es código propio, corto, determinista entre dispositivos —lo que hace cierta la promesa de "la misma Inmersión 12 para todos" (§4.1)— e inmune al *tunneling* por construcción. Matter.js queda fuera del bucle jugable; Phaser dibuja. *Pendiente:* actualizar `docs/research/03-tech-stack.md`, que todavía lo lista como dependencia del núcleo.
4. **La oscuridad de Z4 en un móvil barato a pleno sol** puede ser injugable. *Mitigación:* nunca negro puro (`#0a0e18` como mínimo), radio de luz mínimo garantizado, plataformas siempre bioluminiscentes, ajuste de "modo exterior" y prueba obligatoria en la calle.
5. **La compresión de escala de profundidad** (10.935 m en ~21 min, con m/px distinto por zona) puede sentirse arbitraria y contradecir el argumento educativo. *Pregunta abierta para el owner:* ¿se muestran metros reales o una unidad propia? *Recomendación:* metros reales, con el suavizado y el formato localizado de §8, y **una ficha del Álbum que explique la compresión con honestidad** ("aquí el mapa está encogido; en el mar de verdad esto son cuatro horas de descenso"), que convierte el problema en contenido educativo. *Aguas abajo:* §11.1 (tabla de escalas) y el HUD; nada de física.
6. **Sin referente de mercado no hay curva de dificultad que copiar.** *Mitigación:* el generador toma sus parámetros de un archivo de datos, no de código, para rebalancear sin recompilar; telemetría local de "profundidad donde se perdió cada Aire" desde H2.
7. **25 criaturas en pixel art animado** es el mayor coste de producción del proyecto. *Pregunta abierta:* ¿se lanza con 18 y el resto llega como actualización de contenido a los 60 días, para reactivar D30? *Aguas abajo:* §12.1 ya asume 8 en el MVP; la biblioteca de chunks debe declarar los peligros que usa para poder podar sin romper el histograma de dificultad.
8. **Preguntas abiertas para el owner (con impacto acotado):** ¿campaña de pago único sin anuncios *y* versión gratuita con recompensados —dos SKU, §6.5—, o solo una de las dos? ¿La web se publica como demo gratuita permanente (buen canal orgánico, pero canibaliza la app)? ¿Lanzamiento 1.0 con las 6 zonas o con 4 + 2 como actualización gratuita? *Aguas abajo:* la tercera pregunta cambia §3.1 (18 Inmersiones → 12), §11.1 (altura de la columna y escalas) y el criterio de duración de campaña; las otras dos no tocan ningún número de juego.

---

## 11. Especificación técnica del núcleo jugable

*Sección escrita para ingeniería. Es normativa: si algo de las secciones 1–10 contradice a esta, manda esta.*

Stack: **Phaser 3 + TypeScript estricto + Vite + Vitest**, monorepo pnpm/Turborepo. **`packages/core` no importa nada de Phaser ni del DOM**: expone las interfaces `Clock`, `RNG` y `AdProvider`, e **implementa la física** (§10.3). Toda la lógica de esta sección vive en `core` y se testea headless en milisegundos.

**Física propia, no Matter.js.** El movimiento de Bur es un integrador semi-implícito de **paso fijo 1/60 s** con acumulador, y la colisión es **círculo barrido contra AABB**: toda la geometría del juego (repisas, paredes, sensores) son rectángulos alineados con los ejes. Razones, en orden: (1) los contratos de test de §11.7 —monotonía de cámara sobre 10.000 ticks, búsqueda de alcanzabilidad balística, curva de carga— exigen un simulador determinista dentro de `core`, y mantener ese simulador *además* de Matter significaba dos físicas divergentes certificando niveles que no son los que se juegan; (2) la promesa de "todos juegan la misma Inmersión 12" (§4.1) requiere determinismo entre dispositivos que un motor de terceros con paso variable no garantiza; (3) el barrido elimina el *tunneling* por construcción, sin sub-pasos ni colisionadores gruesos. Es código propio de unos cientos de líneas y **es la primera tarea de H1**.

### 11.1 Sistema de coordenadas y conversión px ↔ metros

- Resolución de diseño: **ventana de 180 px de ancho** (`VIEW_W`); altura visible `H` **elástica entre 320 y 420 px** (§8). Eje **Y positivo hacia abajo**. Origen `y = 0` en la superficie del agua; `x ∈ [0, 540]`.
- El mundo es una **columna continua de 540 px de ancho** (`WORLD_W`, tres ventanas) **y 25.920 px de alto**, ensamblada por *streaming* de chunks de **540 × 240 px**: **108 chunks = 18 Inmersiones × 6**, de los cuales **90 son jugables y 18 son estación** (§3.1). La estación es el sexto chunk de su Inmersión, no un añadido: por eso la aritmética cuadra. El ancho triplica al de la v1.1 y la altura no cambia: **la aritmética de profundidad, escalas y duración de campaña es idéntica**.
- Cada Inmersión aporta **1.200 px jugables** y una **boya de aliento** al terminar su tercer chunk (§3.1).
- La conversión a metros **no es global**: cada zona tiene su propia escala, y esa es la decisión que hace que 10.935 m quepan en una partida de **18–24 minutos** sin que la Zona 6 sea infinita. La transición de escala ocurre siempre **dentro de una estación de descanso**, donde el jugador no está midiendo nada.

| Zona | Rango de profundidad (m) | Rango en mundo (px) | Chunks (jugables + estación) | Inmersiones | **Escala (m/px)** |
|---|---|---|---|---|---|
| Z1 Superficie | 0 – 200 | 0 – 2.880 | 12 (10 + 2) | 2 | **0,069** |
| Z2 Arrecife | 200 – 600 | 2.880 – 7.200 | 18 (15 + 3) | 3 | **0,093** |
| Z3 Crepuscular | 600 – 1.800 | 7.200 – 11.520 | 18 (15 + 3) | 3 | **0,278** |
| Z4 Medianoche | 1.800 – 4.000 | 11.520 – 15.840 | 18 (15 + 3) | 3 | **0,509** |
| Z5 Abisal | 4.000 – 6.500 | 15.840 – 20.160 | 18 (15 + 3) | 3 | **0,579** |
| Z6 Fosa hadal | 6.500 – 10.935 | 20.160 – 25.920 | 24 (20 + 4) | 4 | **0,770** |

```ts
// packages/core/src/level/depth.ts
export function pxToMeters(worldY: number): number {
  const z = zoneAt(worldY);              // busca por rango en la tabla anterior
  return z.startM + (worldY - z.startPx) * z.metersPerPx;
}
```

El HUD **siempre muestra metros**, redondeados a la unidad, con `Intl.NumberFormat` de la locale activa y **suavizado a un máximo de 9 m por *frame*** (§8): la escala varía 11× entre zonas y sin suavizado el contador es ilegible en Z6. La cinta de profundidad interpola por zona, no linealmente sobre el mundo.

### 11.2 Entidades

Todas las entidades son estructuras planas y serializables en `core`; la capa `game-phaser` solo las dibuja.

| Entidad | Campos relevantes | Cuerpo físico |
|---|---|---|
| **`Bubble`** (Bur) | `pos`, `vel`, `radius`, `air`, `airMax`, `state`, `aimOrigin`, `pullVec`, `aimAngle`, `aimMs`, `airLaunchesLeft`, `lastRestingCeilingId`, `lastBoyaId`, `invulnUntil`, `bounceChain`, `bounceChainBodies[]`, `reinflateUntil`, `ascensoUntil`, `lightRadius` | Círculo dinámico integrado en `core`. No rota (la rotación del §7 es cosmética) |
| **`Ceiling`** | `id`, `rect{x,y,w,h}` (`w ≥ 20`, **`h ≥ 8`**), `kind: 'posadero' \| 'impaciente' \| 'pegajosa'`, **`capturable: boolean`**, `restitution`, `maxRestMs`, **`bounceCooldownMs`**, `moving?{axis,speed,range}`, `dissolveMs?` | **Sólido por las dos caras**; solo la **cara inferior** con `capturable: true` activa reposo. `capturable: false` = trampolín (medusa, señuelo) |
| **`Anchor`** | `id`, `ceilingId`, `pos`, `zone` | Punto de reposo declarado. Es lo que consumen la regla de alcance (§11.5.11), la reaparición (§2.4.2) y el test §11.7.7 |
| **`Hazard`** | `id`, `catalogId (1–25)`, `shape`, `airCost (siempre 1)`, `phase`, `periodMs`, `tellMs`, `pushImpulse?`, **`pushDir: 'lateral' \| 'down' \| 'up'`** (`'up'` solo permitido en los catalogId 20 y 21) | Sensor o cuerpo estático según catálogo |
| **`ForceField`** | `rect`, `type: 'corriente' \| 'fumarola' \| 'salmuera' \| 'frio' \| 'descendente'`, `vector`, `buoyancyMul`, `impulseMul`, `chargeMul`, **`opensAscenso: boolean`** | Sensor. Aplica fuerza continua mientras se solape |
| **`Pickup`** | `pos`, `type: 'aire' \| 'aireGrande' \| 'perla' \| 'perlaGrande' \| 'concha'`, `value` | Sensor, se destruye al recoger |
| **`Boya`** | `id`, `worldY`, `immersionIndex` | Sensor. Punto de reaparición silencioso a mitad de Inmersión (§3.1) |
| **`RestStation`** | `worldY`, `zoneFrom`, `zoneTo`, `isDelivery`, `tutorialVerb?` | Banda de 240 px sin peligros = el sexto chunk de la Inmersión. Checkpoint |
| **`Boss`** | `catalogId`, `phases[]`, `cyclePeriodMs`, `windowMs`, `resolution: 'entrega'` | Compuesto de `Ceiling` cinemáticos + `Hazard` con fase |
| **`Chunk`** | `id`, `zone`, `difficulty 1–5`, `verbs[]`, **`entryAnchorId`, `exitAnchorId`**, `airBudget`, **`targetTimeS`**, `tags[]`, `entities[]` (3–5 `Anchor`) | Contenedor de **540 × 240 px**, no cuerpo. **Sin carriles ni boca** (v1.2). **Esquema único del proyecto** (§4.1) |
| **`Camera`** | `y`, `maxY` (monótono), **`recallPx`**, **`x`** (sin trinquete, recortada a `[0, 360]`), `zoom`, `shake` | — |
| **`RunState`** | `seed`, `mode: 'expedicion'\|'abismo'`, `immersionIndex`, `lastBoyaId`, `pearls`, `shells`, `failCountThisImmersion`, `mercyLevel: 0\|1\|2` | — |

### 11.3 Máquina de estados de input

Cinco estados canónicos (la v1.1 llamaba `CHARGING` al segundo; en la v1.2 es **`AIMING`**, porque ya no se acumula nada con el tiempo). Las transiciones son la especificación completa del control; **no existe ninguna otra ruta**.

```
            pointerdown (solo con doble salto disponible)
      ┌──────────────────────────────────────┐
      │                                      ▼
 ┌────────┐  suelta a <12 px ┌──────────┐  suelta      ┌───────────┐
 │  IDLE  │◄─────────────────│  AIMING  │─────────────►│ LAUNCHED  │
 └────────┘  CANCELA: sin    └──────────┘  vel = dir*I └───────────┘
   ▲   │     tiro, sin coste,     │ aéreo: −1 Aire         │   │
   │   │     sin evento           │ (nunca el último pip)  │   │
   │   │ |vel.y| decae            │                        │   │
   │   │                          │ t>6.000 ms: CANCELA,   │   │
   │   │                          ▼ nunca dispara sola     │   │
   │   │              (vuelve al estado del que vino)      │   │
   │   │                                                   │   │
   │   │  contacto ASCENDENTE con cara inferior capturable │   │
   │   │  a |vel| ≤ 260 px/s  → airLaunchesLeft = 1        │   │
   │   └───────────────────┐   ┌───────────────────────────┘   │
   │                       ▼   ▼                               │
   │                  ┌──────────┐  pointerdown                │
   └──────────────────│ RESTING  │──────────────► AIMING       │
     maxRestMs agotado└──────────┘ (reloj congelado)           │
     → empuje de 90      │                                     │
     px/s HACIA ABAJO    │        air === 0 (cualquier estado) │
                         ▼                                     ▼
                        ┌───────────────────────────────────────┐
                        │                 DEAD                  │
                        └───────────────────────────────────────┘
                            │ 700 ms de deshinchado
                            ▼
                     [pantalla de fin, misma escena, sin carga]
                            │ toque en "Otra vez"  (o 8 s de inactividad)
                            ▼  reaparición en la última boya/estación
                          IDLE      (< 0,8 s desde el toque)
```

- **IDLE**: Bur está en el agua sin input y sin contacto de reposo. La flotabilidad la sube. Es el estado de "deriva". Acepta `pointerdown` **solo si `airLaunchesLeft > 0` y `air > AIR_LAUNCH_COST`**; en cualquier otro caso el toque **se ignora por completo** (sin evento, sin castigo, sin guía).
- **AIMING**: no acumula nada con el tiempo. **`aimOrigin` se congela en el `pointerdown`, en la posición del dedo**, y cada *frame* se recalculan `pullVec = pointer − aimOrigin`, la potencia `p = clamp(|pullVec|/70, 0, 1)` y la dirección **opuesta** al arrastre, recortada al cono de 90° (§2.1). Con `|pullVec| < 12` no hay tiro: soltar ahí **cancela**. **La flotabilidad se aplica al 35%.** Se entra desde RESTING (caso normal, con el temporizador de posadero **congelado**) y desde IDLE (doble salto). A los `AIM_MAX_MS = 6.000 ms` el tiro **se cancela** y Bur vuelve al estado del que vino.
- **LAUNCHED**: los primeros **250 ms** tras **asignar** `vel = dir · impulso` (§2.2: asignación, nunca acumulación). Durante esa ventana se ignora el reposo (para no pegarse al techo del que acabas de salir) y la amortiguación es menor. Si el lanzamiento fue **aéreo**, aquí se descuenta `AIR_LAUNCH_COST` y `airLaunchesLeft` baja a 0. Al expirar, transición automática a IDLE.
- **RESTING**: pegada a la cara inferior de un `Ceiling` capturable. Velocidad forzada a 0, drenaje pasivo de Aire congelado, `airLaunchesLeft` **reiniciado a `AIR_LAUNCHES_MAX`**, temporizador `maxRestMs` corriendo —**congelado mientras se apunta si el techo es `posadero`**, corriendo siempre en `impaciente` y `pegajosa` (§2.3)—. Al agotarse el temporizador, expulsión **hacia abajo** a 90 px/s.
- **DEAD**: `air === 0`. Sin input durante los 700 ms del deshinchado; después aparece la pantalla de fin sobre la misma escena, y **la salida a IDLE la confirma el jugador** (o un temporizador de inactividad de 8 s). La reaparición es en la última boya o estación.

**Sub-estados ortogonales** (banderas, no estados): `INVULNERABLE` (700 ms tras golpe o tras reaparecer), `RESACA` (Bur por encima del borde superior con la cámara en su límite de retorno y sin `ASCENSO`; 1.600 ms de gracia), `STUNNED` (400 ms tras golpe, input aceptado pero impulso al 60%), `REINFLATED` (12 s de radio +1 escalón), **`ASCENSO`** (dentro de un `ForceField` con `opensAscenso` y 2.000 ms después: abre la banda de retorno de la cámara a 640 px y suspende la resaca y la corriente mínima).

### 11.4 Física: fórmulas normativas

```ts
// TIRACHINAS: potencia = distancia de arrastre, LINEAL (§2.1)
pull = pointer - aimOrigin                           // aimOrigin CONGELADO (posición del DEDO)
p    = clamp(len(pull) / 70, 0, 1)                   // PULL_MAX_PX = 70 px
if (len(pull) < 12) noShot = true                    // PULL_CANCEL_PX: soltar aquí CANCELA

// Módulo del impulso, ya corregido por presión
impulse = (90 + p * (280 - 90))                      // IMPULSE_MIN 90 – IMPULSE_MAX 280
        * (radius / 7) ** 0.35                       // penalización de presión
        * (stunned ? 0.60 : 1)
        * (stickyCeiling ? 0.60 : 1)                 // superficie pegajosa (§2.3)
        * impulseMulFromForceField                   // medusa fría: 0.75 durante 2 s

// Dirección: OPUESTA al arrastre, cono de 90° (cualquier dirección no ascendente)
dir = normalize(-pull)                               // tiras hacia atrás, sale hacia delante
theta = atan2(dir.x, dir.y)                          // 0 = recto abajo, ±90° = horizontal
if (dir.y < 0) theta = (dir.x >= 0 ? +1 : -1) * 1.5708  // recorte a la horizontal + guía ÁMBAR
if (abs(theta) < 0.087) theta = 0                    // ~±5° de zona muerta → recto abajo

// LANZAMIENTO: asignación, NUNCA acumulación. Solo desde RESTING…
vel = { x: sin(theta) * impulse, y: cos(theta) * impulse }
// …o UN lanzamiento aéreo por fase, que cuesta 1 pip y nunca deja el Aire a 0:
if (state === 'IDLE' && airLaunchesLeft > 0 && air > AIR_LAUNCH_COST) { air -= 1; airLaunchesLeft-- }

// Integración por frame (dt fijo = 1/60 s)
vel.y -= BUOYANCY * dt * buoyancyMul * (state === 'AIMING' ? 0.35 : 1)
vel.x *= exp(-DAMPING_X * dt)                        // 0.30 /s  → el horizontal se conserva
vel.y *= exp(-DAMPING_Y * dt)                        // 0.60 /s  → terminal ascendente 167 px/s
vel   += forceFieldVector * dt
vel.y  = clamp(vel.y, -Infinity, MAX_FALL_SPEED)     // 520 px/s

// Radio por zona (escalonado: la presión cambia en la estación). NADA COMPRABLE LO TOCA.
radius = RADIUS_BASE * ZONE_RADIUS_PCT[zone] + (reinflated ? oneZoneStep : 0)

// Captura de reposo
if (contactoCaraInferior && ceiling.capturable && vel.y < 0 && abs(vel.y) <= 260)
   state = 'RESTING'                                 // si no: rebote con la restitución del material

// Luz (Z4+)
lightRadius = (8 + (state === 'LAUNCHED' && lastPullPower >= 1.0 ? 6 : 0)) * (1 + upgradeLight)
```

**Amortiguación exponencial exacta** (`exp(-k·dt)`), no la aproximación de Euler `(1 − k·dt)`: son equivalentes a 1/60 y divergen si alguien sube el paso. **Integración**: paso fijo de 1/60 s con acumulador; colisión por **barrido de círculo contra AABB**, sin sub-pasos y sin *tunneling* posible incluso a 520 px/s contra repisas de 8 px.

**Cámara** (dentro del paso fijo, después de la física, antes del render). Todos los `lerp` son **independientes de la tasa de refresco**:

```ts
const k = (lambda: number) => 1 - Math.exp(-lambda * dt)   // λ 12 /s ≈ 0,18 @60fps; 25 /s ≈ 0,34
target = bur.y - H * 0.45
if (bur.y < camY + H*0.34 || bur.y > camY + H*0.56)        // fuera de la zona muerta
   camY += (target - camY) * k(dist > 90 ? 25 : 12)

maxCamY = max(maxCamY, camY)                               // TRINQUETE del máximo
recall  = ascenso ? 640 : 96                               // banda de retorno (§4.3)
camY    = clamp(camY, maxCamY - recall, maxCamY)           // la vista puede volver; el progreso no
if (zone >= 3 && !ascenso) camY += 8 * dt                  // corriente mínima
if (abs(bur.vel.y) > 420) zoomPunchOut(0.08, 200)          // caso extremo, en ambos sentidos

// Cámara en X (v1.2): zona muerta, sin trinquete, recorte duro al mundo de 540 px
const lo = camX + 180 * 0.35, hi = camX + 180 * 0.65       // CAM_DEADZONE_X
if (bur.x < lo) camX += (bur.x - 180 * 0.35 - camX) * k(12)
if (bur.x > hi) camX += (bur.x - 180 * 0.65 - camX) * k(12)
camX = clamp(camX, 0, 540 - 180)                           // [0, 360]: nunca se ve fuera del mundo
```

`maxY` de **progreso** (profundidad, checkpoints, marcador) es una variable distinta de `camY` y **nunca disminuye**, con o sin banda de retorno.

### 11.5 Reglas de generación de chunks

El generador es **determinista dado `(seed, immersionIndex)`** y consume sus parámetros de un **archivo de datos JSON**, no de código, para poder rebalancear sin recompilar. En el MVP estas reglas se ejecutan como **validador** de las secuencias escritas a mano (§4.1); el generador que las consume llega en H3.

1. **Continuidad por anclajes (v1.2, D3).** Desaparecen los carriles `L/C/R` y la boca de entrada: en un mundo de 540 px no hay tres pasillos, hay agua abierta. La única garantía de continuidad es la **regla de alcance 2D** de la regla 11 aplicada al par `(exitAnchor de chunk[i], entryAnchor de chunk[i+1])`. Un chunk puede declarar varios anclajes de salida candidatos; el validador certifica al menos la ruta declarada, y el selector solo admite un sucesor cuyo `entryAnchor` esté dentro del alcance del `exitAnchor` elegido.
2. **Anti-repetición.** Un `chunk.id` no puede reaparecer dentro de una ventana de **6**. Dos chunks con el mismo `tag` no pueden encadenarse más de **2** veces seguidas.
3. **Selección por dificultad.** Se computa `dificultad_objetivo` (§4.2, techo 4,6) y se elige entre chunks con `difficulty ∈ [round(D)−1, round(D)]`, con pesos **30/70**.
4. **Regla del respiro.** Si `chunk[i].difficulty ≥ 4`, entonces `chunk[i+1].difficulty ≤ 3`, y como máximo **dos** chunks de dificultad ≥ 4 por Inmersión. Restricción dura del selector.
5. **Regla de aislamiento didáctico.** Las dos primeras instancias de un `catalogId` de peligro en toda la partida deben venir en un chunk cuyo array de peligros tenga longitud 1.
6. **Piezas fijas, nunca sorteadas.** Chunks 1–3 de la partida; primer chunk de cada zona (tutorial del verbo, sin peligros); chunk de jefe; chunk de estación. Además, **las Inmersiones 1–8 son secuencias fijas escritas a mano**.
7. **Presupuesto de aire.** `Σ airBudget / drenaje_esperado` debe caer en el ratio objetivo de la zona (1,15 / 1,05 / 0,95), calculado contra `ZONE_AIR_MAX` de la zona (§2.6). Si no, el generador inyecta o retira `Pickup` de tipo `aire` hasta cumplirlo.
8. **Regla de misericordia.** Si `runState.failCountThisImmersion >= 2` y `mode === 'expedicion'`: `densidad_peligros *= 0.80` y se añade **1** `Pickup` de aire (`mercyLevel = 1`). A partir de **4** fallos: `*= 0.65` y **2** bolsas (`mercyLevel = 2`). Se revierte al superar la Inmersión. **Nunca se comunica al jugador ni se registra en la UI.** Siempre se dispara **antes** que cualquier oferta comercial (§6.5).
9. **Jitter cosmético.** Cada chunk aplica un desplazamiento de ±8 px a la altura de sus repisas decorativas y sortea su flora de fondo, para que la recurrencia con solo 24 piezas por zona no se lea. **Nunca toca un `Anchor`**: el jitter es decorativo y no puede romper la regla 11.
10. **Streaming.** Se mantienen instanciados **4 chunks** (anterior, actual, siguiente y el posterior), y **5** mientras `ASCENSO` esté activo, porque la banda de retorno de la cámara puede llegar a mostrar dos pantallas hacia arriba y porque la reaparición de la resaca debe caer siempre sobre geometría viva. Presupuesto: **< 4 ms** de construcción por chunk.
11. **Regla de alcance 2D (crítica).** Todo `Anchor` debe ser alcanzable desde el anterior, en las dos dimensiones: el desnivel **no supera `MAX_HOP_PX`** (110 / 105 / 100 / 95 / 90 / 80) **y** la separación horizontal **no supera `MAX_HOP_X_PX`** (200 / 190 / 180 / 170 / 160 / 140; §2.2). Esa caja es solo un filtro rápido: la certificación real es **balística, con el mismo integrador que juega el jugador**, **desde reposo, con velocidad de entrada cero y sin doble salto** —el doble salto es margen para el jugador, nunca para el diseñador—. **La regla se aplica también a la junta entre chunks** (`exitAnchor` de `chunk[i]` → `entryAnchor` de `chunk[i+1]`), que es el caso peor. Con 3–5 anclajes por chunk (§4.1), la regla también gobierna las rutas internas.
12. **Orden de relajación (el selector nunca se bloquea).** Si el conjunto de candidatos legales queda vacío, se relajan restricciones **en este orden exacto y determinista**, deteniéndose en cuanto haya candidato: (a) ampliar la ventana de dificultad en ±1; (b) levantar la regla de `tag`; (c) reducir la ventana anti-repetición 6 → 4 → 2; (d) insertar un **chunk de transición** (pieza corta de 120 px de alto y 540 de ancho, sin peligros, con anclajes repartidos que siempre cumplen la regla 11); (e) como último recurso, repetir el chunk legal más antiguo. Las reglas **4, 5, 7 y 11 nunca se relajan**. Se registra en telemetría cada relajación: si (d) o (e) aparecen a menudo, falta biblioteca.

### 11.6 Constantes ajustables (valores iniciales)

Todas viven en `packages/core/src/tuning.ts`, exportadas como un único objeto congelado, expuestas en el panel de sliders del prototipo y serializables a JSON para poder guardar y comparar *presets* de playtest.

| Constante | Valor inicial | Unidad | Qué toca |
|---|---|---|---|
| `BUOYANCY` | 100 | px/s² | Empuje ascendente base |
| `DAMPING_Y` | 0,60 | /s | Amortiguación vertical |
| `DAMPING_X` | 0,30 | /s | Amortiguación horizontal (encadenado de paredes) |
| `TERMINAL_RISE` | 167 | px/s | **Derivada e invariante**: `BUOYANCY / DAMPING_Y` |
| `MAX_FALL_SPEED` | 520 | px/s | Cap de seguridad de caída |
| `IMPULSE_MIN` | 90 | px/s | Arrastre mínimo que cuenta como tiro |
| `IMPULSE_MAX` | 280 | px/s | Arrastre completo (70 px) |
| `LAUNCH_MODE` | `'set'` | — | **El lanzamiento asigna la velocidad, no la suma** |
| `PULL_MAX_PX` | 70 | px | Arrastre a potencia máxima (`p` **lineal**) |
| `PULL_CANCEL_PX` | 12 | px | Soltar dentro = cancelar, sin coste |
| `AIM_MAX_MS` | 6.000 | ms | Tope de apuntado: **cancela**, nunca dispara |
| `AIR_LAUNCHES_MAX` | 1 | lanzamientos | "Doble salto" por fase aérea; se reinicia al reposar |
| `AIR_LAUNCH_COST` | 1 | pips | Coste del lanzamiento aéreo; **nunca con el último pip** |
| `LONG_SLING_MUL` | 1,5 | — | Accesibilidad: "tirachinas largo" (`PULL_MAX_PX` → 105 px) |
| `AIM_CONE_DEG` | 90 | ° | Semiángulo: **cualquier dirección no ascendente** |
| `AIM_DEADZONE_DEG` | 5 | ° | Zona muerta hacia recto abajo |
| `AIM_BUOYANCY_MUL` | 0,35 | — | Apuntar ancla: flotabilidad mientras se apunta EN EL AIRE (§2.1) |
| `RADIUS_BASE` | 7,0 | px | Radio en superficie |
| `ZONE_RADIUS_PCT` | [1,00 · 0,92 · 0,84 · 0,74 · 0,64 · 0,55] | — | Presión por zona |
| `IMPULSE_RADIUS_EXP` | 0,35 | — | Exponente de penalización por presión |
| `MAX_HOP_PX` | [110 · 105 · 100 · 95 · 90 · 80] | px | Desnivel máximo entre anclajes (§11.5.11) |
| `MAX_HOP_X_PX` | [200 · 190 · 180 · 170 · 160 · 140] | px | Separación lateral máxima entre anclajes (§11.5.11) |
| `REST_CAPTURE_SPEED` | 260 | px/s | Velocidad máxima de acercamiento para capturar |
| `REST_MAX_MS` | 3.000 / 1.200 / 600 | ms | Posadero / impaciente / pegajosa |
| `REST_RELEASE_PUSH` | 90 | px/s **hacia abajo** | Empuje al agotarse el reposo |
| `LAUNCH_LOCK_MS` | 250 | ms | Duración del estado LAUNCHED |
| `RESTITUTION_ROCK` | 0,55 | — | Roca y coral |
| `RESTITUTION_JELLY` | 0,92 | — | Medusa (superficie **no capturable**) |
| `RESTITUTION_SOFT` | 0,18 | — | Alga y nieve marina |
| `RESTITUTION_HADAL_WALL` | 0,85 | — | Paredes de Z6: hace posible el verbo de la zona |
| `BOUNCE_COOLDOWN_MS` | 600 | ms | Un trampolín se desinfla tras rebotar |
| `LATERAL_FRICTION` | 0,08 | — | Fricción en rebote |
| `AIR_START` | 5 | pips | Aire inicial |
| `AIR_MAX_BASE` | 8 | pips | Techo base (11 con mejoras) |
| `ZONE_AIR_MAX` | [8 · 8 · 7 · 7 · 6 · 6] | pips | Capacidad por zona; se aplica en la estación |
| `INVULN_MS` | 700 | ms | Tras golpe o reaparición |
| `STUN_MS` | 400 | ms | Impulso al 60% |
| `HIT_PUSHBACK` | 120 | px/s | Empujón al recibir golpe |
| `RESACA_GRACE_MS` | 1.600 | ms | Gracia antes de penalizar |
| `PRESSURE_DRAIN_S` | 25 | s | Periodo de −1 Aire en Z5–Z6 |
| `BOUNCE_CHAIN_REWARD` | 5 | rebotes | Cadena limpia **en cuerpos distintos** que da +1 Aire |
| `REINFLATE_MS` | 12.000 | ms | Duración del reinflado |
| `LIGHT_RADIUS_BASE` | 8 | px | Luz propia en Z4+ |
| `LIGHT_RADIUS_CHARGED` | 14 | px | Luz durante vuelo a carga máxima |
| `TRAJECTORY_DOTS` | [6 · 6 · 5 · 4 · 3 · 2] | puntos | Andamio por zona |
| `CAM_LAMBDA` | 12 | /s | Seguimiento normal (≈ lerp 0,18 a 60 fps) |
| `CAM_LAMBDA_FAST` | 25 | /s | Cuando la distancia supera 90 px (≈ 0,34) |
| `CAM_RECALL_PX` | 96 | px | Banda de retorno de la vista |
| `CAM_RECALL_ASCENSO_PX` | 640 | px | Banda de retorno con `ASCENSO` activo |
| `ASCENSO_TAIL_MS` | 2.000 | ms | Cola de la ventana de ascenso |
| `CAM_DEADZONE` | [0,34 · 0,56] | fracción de H | Banda sin movimiento vertical de cámara |
| `CAM_DEADZONE_X` | [0,35 · 0,65] | fracción de `VIEW_W` | Banda sin movimiento horizontal; `camX ∈ [0, 360]` |
| `CAM_MIN_SCROLL` | 8 | px/s | Corriente mínima desde Z3 (suspendida en `ASCENSO`) |
| `WORLD_W` | 540 | px | Ancho del mundo (tres ventanas) |
| `VIEW_W` | 180 | px | Ancho de la ventana visible |
| `CHUNK_W` / `CHUNK_H` | 540 / 240 | px | Tamaño de chunk |
| `ANCHORS_PER_CHUNK` | 3–5 | anclajes | Densidad de contenido (§4.1) |
| `CHUNK_REPEAT_WINDOW` | 6 | chunks | Anti-repetición |
| `IMMERSION_CHUNKS` | 6 (5 jugables + 1 estación) | chunks | Estructura de Inmersión |
| `BOYA_AFTER_CHUNK` | 3 | chunks | Boya de aliento a mitad de Inmersión |
| `MAX_SEGMENT_S` | 35 | s | Tiempo objetivo máximo entre boyas (pilar 3) |
| `MERCY_FAILS` | 2 / 4 | fallos | Disparo de misericordia nivel 1 / nivel 2 |
| `MERCY_DENSITY_MUL` | 0,80 / 0,65 | — | Reducción de densidad por nivel |
| `AD_OFFER_MIN_FAILS` | 4 | fallos | Primera oferta comercial, siempre después de la misericordia |
| `DEFLATE_MS` | 700 | ms | Deshinchado antes de la pantalla de fin |
| `RESTART_BUDGET_MS` | 800 | ms | Presupuesto duro de reinicio **desde el toque** |
| `PEEK_UP_PX` | 120 | px | Cuánto puede subir el ojeo por encima de la cámara viva (con la cámara dentro de la ventana instanciada) |
| `PEEK_DOWN_PX` | 240 | px | Cuánto puede bajar (un *chunk*). Manda el *streaming*: si la cámara ya está fuera de la ventana, el recorte sobre la ventana puede dar unos px más de alcance |
| `PEEK_LAMBDA` | 14 | /s | Velocidad con la que la vista persigue el objetivo del ojeo |
| `PEEK_RETURN_LAMBDA` | 5 | /s | Velocidad del regreso a Bur al soltar el minimapa |
| `MINIMAP_SCALE` | 0,1 | px minimapa / px mundo | 540×600 px de mundo → 54×60 px de minimapa |
| `MINIMAP_ABOVE_PX` | 120 | px | Mundo mostrado por encima de la cámara viva en el minimapa |
| `MINIMAP_WORLD_H` | 600 | px | Alto de mundo que cubre el minimapa (120 arriba + 480 abajo): cabe **todo objetivo de ojeo legal**; el marco de la vista sí puede salirse del mapa en un ojeo a fondo (se recorta al dibujarlo) |

### 11.7 Contratos de test (Vitest, headless, sin canvas)

Estos tests son parte de la definición de "hecho" del núcleo:

1. **Potencia por arrastre, lineal**: `power(70) === 1.0`, `power(35) === 0.5`, `power(0) === 0` y `power(140) === 1.0` (saturación). Con "tirachinas largo" (`PULL_MAX_PX = 105`), `power(70) === 2/3`.
2. El impulso a radio 3,9 px con arrastre completo (**227 px/s**) es **mayor o igual** que a radio 7,0 px con un arrastre de 50 px (**226 px/s**), y la diferencia es < 2%: la promesa de §2.6 es aritmética, no retórica.
3. **Cancelación**: un `pointerup` con `|pull| < 12 px` no produce impulso, no cambia de estado (Bur sigue en `RESTING`), no gasta Aire y no emite evento. A 13 px sí hay tiro, con `p ≈ 0,19` (125 px/s).
4. **Tope de apuntado**: a los 6.000 ms el tiro **se cancela** y Bur vuelve al estado previo; en ninguna secuencia de entradas el núcleo lanza sin un `pointerup`. Y apuntando desde un `posadero`, el temporizador de reposo **no avanza**; desde `impaciente` y `pegajosa`, sí.
5. `maxCamY` es **monótona no decreciente** en cualquier secuencia de 10.000 *ticks* aleatorios, y `camY ∈ [maxCamY − recall, maxCamY]` en todos ellos. `maxY` de progreso es monótona incluso con `ASCENSO` forzado.
6. Ninguna transición sale de DEAD salvo a IDLE, y solo tras `DEFLATE_MS` **y** confirmación del jugador (o los 8 s de inactividad); la reaparición ocurre siempre en la última boya o estación y nunca por encima de ella.
7. **Alcanzabilidad 2D, con junturas.** Todo par de anclajes consecutivos —dentro de un chunk y en la junta `(exitAnchor, entryAnchor)`— cumple `|Δy| ≤ MAX_HOP_PX` y `|Δx| ≤ MAX_HOP_X_PX`, **y** existe un tiro que lo une, evaluado con velocidad de entrada cero, **desde reposo y sin doble salto**. Búsqueda sobre la trayectoria balística del **mismo integrador que juega el jugador** (§10.3): no hay dos físicas. **El doble salto es margen, no requisito**: esta certificación se ejecuta con `AIR_LAUNCHES_MAX = 0` y debe pasar en toda la campaña.
8. Con `failCount = 2`, la densidad generada es exactamente el 80% de la nominal; con 4, el 65%; vuelve al 100% al marcar la Inmersión como superada. Y `AD_OFFER_MIN_FAILS > MERCY_FAILS[0]`: la ayuda gratis siempre llega antes que la oferta.
9. Ninguna entidad del catálogo inflige más de 1 Aire por contacto, y **ningún `Hazard` con `pushDir: 'up'` existe fuera de los catalogId 20 y 21** (test de invariante sobre los datos, no sobre el código).
10. `pxToMeters` es estrictamente creciente y continua en los seis límites de zona.
11. `TERMINAL_RISE === BUOYANCY / DAMPING_Y` (identidad, no constante suelta), y la simulación libre desde velocidad 0 converge a ese valor con error < 1%.
12. **Invariante de capacidad de Aire**: el Aire actual nunca supera `ZONE_AIR_MAX[zone] + mejoras`, ningún cambio de capacidad ocurre fuera de una `RestStation`, y ninguna transición de zona reduce el Aire actual.
13. **Presupuesto del pilar 3**: para toda Inmersión de la campaña, la suma de `targetTimeS` entre dos boyas consecutivas es ≤ `MAX_SEGMENT_S`.
14. **Lanzamiento aéreo.** Desde `IDLE` con `airLaunchesLeft = 0` un `pointerdown` no cambia de estado ni emite evento. Con `airLaunchesLeft = 1` el tiro sale y cuesta exactamente 1 pip; con `air === 1` **no sale** (nunca el último pip). Reposar restaura `airLaunchesLeft` a 1, y nunca hay dos lanzamientos aéreos en la misma fase.
15. **Cámara en X.** En cualquier secuencia de 10.000 *ticks*, `camX ∈ [0, WORLD_W − VIEW_W]` y Bur nunca sale de `[0, WORLD_W]`; fuera de la zona muerta `CAM_DEADZONE_X` la cámara converge a la banda, y dentro de ella `camX` no cambia. `camX` **no** tiene trinquete: puede decrecer.
16. **Determinismo**: `(seed, immersionIndex)` produce la misma secuencia de chunks y la misma simulación tras 10.000 ticks de entradas grabadas, en dos ejecuciones y con dos órdenes de acumulador distintos.
17. **Ojeo (D5), invariante de reglas.** Con cualquier `target` de `setPeek`, en cualquier secuencia de *ticks*: `camera.x/y`, `maxY`, la banda de retorno, la resaca y las decisiones de *streaming* son **idénticas** a la misma secuencia sin ojeo; solo cambian `peekX/peekY/renderX/renderY`. `renderX ∈ [0, WORLD_W − viewW]` siempre, y en Y la vista ojeada **nunca se sale de la ventana instanciada más de lo que ya se sale la cámara sin ojear** (con la cámara dentro de la ventana eso equivale a no salirse nunca; el trinquete del §4.3 sí la saca por su cuenta). El caso `streamBottomY − streamTopY < viewH` colapsa a un único valor sin producir `NaN`, y la banda siempre contiene la vista sin ojear.
18. **Ojeo, tirón relativo.** El mismo gesto de arrastre (mismo `pointerdown` relativo al origen, mismo `pointerup`) produce el **mismo** `vel` de lanzamiento con `peek = null` que con cualquier ojeo activo: el origen congelado se calcula sobre el punto del mundo bajo el dedo en la vista **dibujada** (`pointerCam` incluye `peekX/peekY`), así que el desplazamiento de cámara no se filtra en la potencia ni en la dirección.
19. **Ojeo, independencia de la tasa de fotogramas.** Simular el mismo `target` fijo con `dt` de 1/30 s y con 30 pasos de 1/60 s converge al mismo `peekX/peekY` final (dentro de un margen pequeño), igual que el resto de `smoothK` del documento (§11.7.5).
20. **Ojeo, congelado durante el tirón.** Con `aimOrigin !== null` y `target = null`, el *offset* del ojeo no varía entre *ticks* (el regreso está suspendido); con `target` no nulo sigue persiguiéndolo con normalidad aunque haya un tirón en curso.

---

## 12. Alcance del MVP (primer jugable en navegador)

**Objetivo del MVP: responder "¿esto se siente bien y se quiere repetir?", no "¿esto es un producto?".** Corresponde a los hitos H1 + H2, es decir **9 semanas**. La lista de la v1.0 era de 4–6 meses declarada en 6–7; el recorte está razonado en §9 y aplicado aquí.

### 12.1 Checklist — DENTRO del MVP

**Núcleo físico y control**
- [ ] `packages/core` sin dependencias de render, con `Clock`, `RNG` y `AdProvider` como interfaces y **la física propia dentro** (integrador de paso fijo + colisión de círculo barrido contra AABB, §10.3). *Primera tarea del proyecto.*
- [ ] Flotabilidad invertida, amortiguación anisótropa (0,60 / 0,30), cap de caída, `TERMINAL_RISE` como identidad derivada.
- [ ] **Lanzamiento por asignación** (`vel = dir · impulso`), nunca acumulativo.
- [ ] Máquina de estados completa: IDLE / **AIMING** / LAUNCHED / RESTING / DEAD, con las banderas INVULNERABLE, RESACA, STUNNED, REINFLATED y **ASCENSO**.
- [ ] **Tirachinas**: potencia lineal por arrastre (`PULL_MAX_PX = 70`), dirección opuesta al arrastre, **origen congelado en el dedo**, cono de 90° con recorte a la horizontal, zona muerta de 5°, **cancelación a < 12 px** y tope de apuntado de 6 s que **cancela**.
- [ ] **Lanzamiento solo desde reposo**, con **un doble salto aéreo** por fase (coste 1 pip, nunca el último) y contador reiniciado al reposar.
- [ ] **Cámara en X** con zona muerta `[0,35 · 0,65]` y recorte a `[0, 360]` en un mundo de **540 px**.
- [ ] **Captura de reposo por defecto** bajo techos capturables (≤ 260 px/s), superficies no capturables con enfriamiento de trampolín, expulsión hacia abajo al agotar el reposo.
- [ ] Presión por zona: radio escalonado, penalización de impulso con exponente 0,35, **capacidad de Aire por zona aplicada solo en estación**, pips atenuados, suelo de legibilidad de 8 px.
- [ ] Reinflar (verbo de Z3) con su duración de 12 s.
- [ ] Cámara de trinquete **con banda de retorno** en Y, zona muerta, `lerp` independiente de la tasa de refresco, corriente mínima y *zoom-out* de emergencia.
- [ ] **Panel de tuning en vivo** con sliders para las constantes de §11.6 y exportación a JSON. *Es la herramienta más importante del proyecto; se construye el primer día.*

**Contenido**
- [ ] **Zona 1 con arte real**; **Zonas 2 y 3 en *greybox*** con la paleta definitiva (el arte final de Z2–Z3 se hace en H3, §9).
- [ ] **18 chunks** de biblioteca de **540 × 240 px** con **3–5 anclajes cada uno** (6 por zona, con al menos un chunk de cada nivel de dificultad presente) + los chunks fijos: 3 de apertura, 3 de tutorial de verbo, 1 de jefe, 6 de estación, 1 de transición.
- [ ] **Validador** de las reglas de §11.5 sobre las secuencias a mano, incluida la **alcanzabilidad 2D con junturas y sin doble salto** (§11.7.7). *El ensamblador procedural es H3: en el MVP no se juega ninguna Inmersión procedural.*
- [ ] **6 Inmersiones jugables** (2 en Z1, 3 en Z2 más la primera de Z3), encadenadas sin pantalla de carga, cada una con su **boya de aliento**.
- [ ] **8 peligros del catálogo**: nº 1, 2, 3, 5, 6, 7, 8, 9.
- [ ] **1 jefe**: Don Hinchón (Z1), resuelto por entrega, no por combate. *(Pulpa pasa a H3.)*
- [ ] Estaciones de descanso con recarga al máximo de zona, checkpoint, tutorial aislado del verbo y pantalla de fin de Inmersión.

**Sistemas de juego**
- [ ] Aire con **las 4 formas de perderlo** de §2.4 (golpe, resaca, presión, ventilación por atrapamiento), el **coste del doble salto** y las 3 de ganarlo.
- [ ] Perlas y las 3 conchas por Inmersión.
- [ ] Curva de dificultad de §4.2 con las tres reglas duras y el techo de 4,6.
- [ ] **Regla de misericordia** operativa e invisible, disparada al **segundo** fallo.
- [ ] Telemetría local: profundidad de cada pérdida de Aire, fallos por Inmersión, punto exacto de abandono, **relajaciones del selector**.

**Presentación**
- [ ] HUD completo: pips de Aire, cinta de profundidad en metros con formato localizado y suavizado, pausa con área táctil de 44 pt, tercio inferior despejado, **respeto de las bandas de seguridad**.
- [ ] Escalado de anchura fija / altura elástica, bloqueo de orientación, pausa al perder el foco, desbloqueo de audio al primer toque.
- [ ] Indicador del tirachinas en tres canales: **banda elástica** origen→dedo + **anillo de potencia** + trayectoria punteada (6→5 puntos), con el estado atenuado dentro del radio de cancelación y el ámbar del recorte a la horizontal, más el tono de audio afinado.
- [ ] Checklist de juice de §7 completo: squash & stretch, partículas, hitstop, *screen shake* acotado, *zoom punch*.
- [ ] **8 efectos de sonido**, ambiente de zona con paso-bajo progresivo. Sin música definitiva.
- [ ] Tutorial sin texto de menos de 25 s, saltable, **mudo en su primer paso**, que enseña el arrastre **y la cancelación**.
- [ ] Fin de Inmersión y fin por fallo, ambos con **reinicio en < 0,8 s desde el toque** y con los huecos de vídeo recompensado **maquetados y desactivados**.
- [ ] Accesibilidad mínima: sin temblor, **"tirachinas largo" (`PULL_MAX_PX` ×1,5)**, trayectoria asistida.
- [ ] **Build web compartible por URL** y guardado local del progreso.

### 12.2 Checklist — FUERA del MVP

- [ ] **Arte final de Zonas 2 y 3** (van en *greybox*).
- [ ] **Ensamblador procedural** (en el MVP solo el validador).
- [ ] Zonas 4, 5 y 6, y sus verbos (luz/oscuridad, fumarolas, salmuera, rebotes de pared).
- [ ] Jefes 2 a 6 —incluida Pulpa—, jefe final, entrega a Ámbar y epílogo con la cámara ascendente.
- [ ] Postales, Álbum de Fauna y bestiario con datos reales.
- [ ] Mejoras permanentes, Estilos de partida, cosmética.
- [ ] Misiones diarias y Buzón de la Espuma.
- [ ] Modo Abismo.
- [ ] Música por capas que crece con las Postales.
- [ ] Háptica y build de Capacitor.
- [ ] Pantalla de edad, puerta parental y `AdProvider` real (en el MVP solo existe el hueco de UI, y el MVP no se publica en tiendas).
- [ ] Guardado en la nube, tablas de clasificación, localización más allá de ES/EN.

### 12.3 Criterios de aceptación del MVP

El MVP se declara superado si, y solo si, **todo** lo siguiente es cierto en un playtest con 8–12 niños de 7 a 12 años y 5 adultos ajenos al proyecto:

1. **Nadie pregunta "¿qué tengo que hacer?"** pasados los primeros 30 segundos.
2. **≥ 70%** describen el control como "justo" sin ayuda; tiempo medio hasta el primer aterrizaje intencionado **< 20 s**.
3. **≥ 60%** llegan a la Zona 2 en su tercera partida.
4. **≥ 50%** piden "otra vez" sin que se les sugiera.
5. Ningún jugador entiende "subir" como algo bueno después de su primera resaca —**salvo dentro de una ventana de ascenso**, donde debe entenderlo como algo bueno a la primera (se mide en H3, cuando existe la fumarola).
6. El reinicio se mide por debajo de **0,8 s desde el toque** y **ningún fallo cuesta más de 35 s de progreso**, verificado con cronómetro y respaldado por el test §11.7.13.
7. **60 fps estables** en un Android de gama media de hace cuatro años, con `apps/web` servido desde una URL.
8. Ningún jugador pierde Aire por apuntar o por cancelar un tiro (apuntar es gratis), ningún doble salto deja a nadie a 0 pips, y ninguna sesión registra un tramo entre boyas superior a 35 s.

Si el criterio 1 o el 5 fallan, se activa el plan B de la sección 10.1 (gravedad convencional con techo de agua descendente) **antes** de construir nada más.

---

## 13. Registro de revisión (v1.0 → v1.1)

Esta versión no añade contenido: **cierra contradicciones**. Cada línea indica el problema y la decisión tomada.

**Física del núcleo**

1. **El impulso ahora está definido: asigna, no acumula** (`vel = dir · impulso`). Era la palabra que faltaba para poder escribir la primera línea del lanzamiento. Descarta el encadenado de impulsos en el aire, que rompía la coreografía "de techo en techo" y toda hipótesis de alcanzabilidad. §2.2, §11.3, §11.4, `LAUNCH_MODE`.
2. **Constantes de flotabilidad recalculadas y coherentes**: `BUOYANCY` 310 → **100**, amortiguación 0,86 → **0,60 vertical / 0,30 horizontal**, `TERMINAL_RISE` pasa a ser la identidad `B/D = 167` (antes decía 210 con inputs que daban 360). Con ellas, un tiro a plena carga desciende **362 px en Z1 y 267 px en Z6**, siempre por encima de los 240 px de un chunk (antes: 171 y 106 px, es decir, tramos impasables). Nueva **tabla de alcance por zona** y nueva constante `MAX_HOP_PX`. §2.2, §11.6.
3. **El reposo se captura por defecto.** Contacto ascendente con techo capturable a ≤ 260 px/s = reposo. La ventana de 60 px/s de la v1.0 medía ~6 px de recorrido: inalcanzable, y además generaba castañeo infinito bajo cada repisa (y Aire gratis bajo una medusa). Se añaden `capturable`, `BOUNCE_COOLDOWN_MS` y la cadena de rebotes "en cuerpos distintos". §2.3, §2.5, §11.4.
4. **Exponente de presión 0,5 → 0,35**, para que la promesa "en Z6 la carga máxima equivale al 70% de superficie" sea aritméticamente cierta (350 vs 346 px/s). §2.6, §11.7.2.
5. **Puntería sin discontinuidad**: origen de puntería congelado en el `pointerdown`, ganancia angular 1,5×, radio mínimo de 18 px, congelado de la dirección cuando el dedo sube por encima del origen (antes: salto de 124° y cono inalcanzable desde la zona del pulgar), ajuste fino **simétrico** ±15% y zona muerta expresada en grados. Además, **la flotabilidad baja al 35% al cargar**, de modo que el tiro no rota bajo un dedo quieto. §2.1, §11.4.
6. **La sobrecarga ya no mata**: suelo de 1 pip, máximo 2 pips por mantenido, suelta automática a 2.500 ms, umbral de 1.800 ms en reposo. Un mantenido exploratorio de 3,4 s ya no revienta a un niño. §2.2, §2.4.3.
7. **Amortiguación exponencial exacta y cámara independiente de la tasa de refresco** (λ en /s, no *lerp* por frame). Grosor mínimo de repisa (8 px), repisas sólidas por las dos caras y colisión por barrido: el *tunneling* deja de ser un riesgo. §11.4, §11.2, §10.3.

**Cámara, fallo y estructura**

8. **Trinquete con banda de retorno** (96 px, y 640 px con `ASCENSO`). Resuelve de una vez: la reaparición de resaca en un techo que quedaba fuera de pantalla, el verbo "cabalgar la fumarola", la burbuja de metano y todos los rebotes hacia arriba. El **progreso** sigue siendo estrictamente monótono. §4.3, §11.4, §11.7.5.
9. **Cadena de reaparición completa** (último techo → anclaje de entrada del chunk → boya), incluido el caso `lastRestingCeilingId = null`; el *streaming* pasa a 4–5 chunks para que el destino exista siempre. §2.4.2, §11.5.10.
10. **Boyas de aliento a mitad de Inmersión** y reaparición en la última boya: el pilar 3 ("ningún fallo cuesta más de 35 s") pasa de imposible a verificable, con test propio. §3.1, §11.7.13.
11. **Un solo flujo de muerte**: deshinchado de 700 ms → pantalla de fin en la misma escena → reinicio < 0,8 s **desde el toque**. Antes había dos flujos contradictorios (1.400 ms automáticos vs pantalla de fin en 800 ms). §2.4, §11.3, §11.7.6.
12. **Una sola aritmética de campaña**: Inmersión = 5 chunks jugables + 1 de estación, 45–65 s; campaña **18–24 min**; 108 chunks = 25.920 px. Sustituye a las tres cifras incompatibles de la v1.0 y aclara que la estación consume un chunk. §3.1, §9, §11.1.

**Generador y contenido**

13. **Regla de alcance vertical (§11.5.11)**, aplicada también **en las junturas entre chunks** y con velocidad de entrada cero: era la única garantía que faltaba para que un nivel ensamblado sea jugable. El test de alcanzabilidad ya no valida chunks aislados.
14. **El selector no se bloquea**: techo de dificultad 4,6, respiro ≤ 3 (no ≤ 2), histograma obligatorio de biblioteca, carriles adyacentes admitidos, boca mínima 96 → **64 px** (tres bocas de 96 px no caben en 180 px) y **orden de relajación determinista** con chunk de transición. §4.1, §4.2, §11.5.
15. **El catálogo deja de empujar hacia arriba**: regla transversal de dirección; la Medusa Farolillo se convierte en trampolín **descendente** no capturable (la primera lección del juego ya no enseña la dirección perdedora); almeja, banco migratorio e isópodo pasan a empuje lateral; metano y fumarola son los dos únicos empujes ascendentes y abren la ventana de ascenso. Test de invariante sobre los datos. §5, §11.7.9.
16. **Capacidad de Aire por zona especificada** (`ZONE_AIR_MAX = [8,8,7,7,6,6]`), aplicada solo en estación, sin quitar pips en uso, con reinflado que devuelve radio y no capacidad, y ratio de suministro calculado contra la capacidad de la zona. §2.5, §2.6, §11.7.12.

**Producto, ética y alcance**

17. **La ayuda gratuita va antes que la oferta comercial**: misericordia al **2.º** fallo (y refuerzo al 4.º); primera oferta de vídeo **no antes del 4.º**. Antes se monetizaba la frustración de un niño una ronda antes de ayudarle. §4.2.3, §6.5, §11.7.8.
18. **Sin cambio de trato tras la instalación**: el SKU que se lanza sin anuncios no los tendrá nunca; el que los lleva los declara el día 1. Nueva **§6.6** con pantalla de edad neutra, **puerta parental** ante anuncios, valoración, enlaces y notificaciones, SDK certificado nombrado, y telemetría local sin identificadores.
19. **La valoración de tienda sale del pico emocional** y pasa al menú principal, una vez, tras puerta parental. El Buzón declara sus reglas anti-presión (sin rachas, sin *push* por defecto, sin caducidades). §1.2, §3.3.
20. **Pilar 5 reformulado y verificable**: <40 palabras en el **juego jugable**; Postales y Álbum (≈1.500 palabras) son contenido opcional fuera del *loop* y constituyen el presupuesto real de localización. §0, §1.1, §9.
21. **Presentación en portrait resuelta**: anchura fija 180 px con zoom entero y altura elástica (320–420 px) en vez del imposible "FIT + escalado entero", bandas de seguridad, bloqueo de orientación, pausa al perder foco, desbloqueo de audio en iOS (y un primer paso de tutorial mudo por diseño), formato de metros localizado y contador suavizado. §8, §11.1.
22. **Accesibilidad coherente**: "carga lenta" escala **todos** los tiempos del gesto (antes dejaba 20 ms entre potencia máxima y pérdida de aire, endureciendo el juego para quien más ayuda necesita); "trayectoria asistida" conserva la rampa de §2.7. §8.
23. **Una sola física, no dos**: `packages/core` implementa el integrador y la colisión; Matter.js sale del bucle jugable. Elimina el motor de referencia duplicado que exigían los tests, y hace cierta la promesa de determinismo entre dispositivos ("todos juegan la misma Inmersión 12"). §10.3, §11.
24. **MVP recortado a 9 semanas** con los recortes decididos por escrito: arte final solo en Z1, ensamblador procedural a H3 (en el MVP no se jugaba ninguna Inmersión procedural), un jefe, 8 peligros, 8 SFX, 18 chunks de biblioteca. §9, §12.
25. **Correcciones menores de coherencia**: ventana de maestría 140 → **170 ms** (el 38% ahora es cierto), esquema de `Chunk` unificado en uno solo, las **cinco** formas de perder Aire enumeradas y la anémona recalibrada, expulsión del reposo **hacia abajo**, `MAX_FALL_SPEED` 620 → **520** con su caso de uso real, restitución propia de pared hadal (0,85) para que el verbo de Z6 exista, y notas de dirección de arte para la ballena caída y el deshinchado de Bur. §1.4, §2.2, §2.3, §2.4, §4.1, §5.

**Qué sigue abierto:** solo la sección 10, que ahora indica para cada punto **qué números se recalculan** si el *owner* cambia la respuesta.

---

## 14. Registro de revisión (v1.1 → v1.2)

Esta versión **no cierra contradicciones: incorpora un playtest**. El *owner* jugó el primer jugable en móvil y las cuatro decisiones de `docs/design/DECISIONS-v1.2.md` se aplican aquí íntegras. Cada línea indica el problema observado y la decisión tomada.

**El gesto**

1. **El tirachinas sustituye a la carga por tiempo.** La potencia era invisible: el jugador no podía ver cuánto llevaba cargado y el pulgar no cronometra. Ahora `pointerdown` congela un **origen en el dedo**, el **arrastre es la potencia** (`p = |d| / 70`, **lineal**) y la **dirección es la opuesta** al arrastre. Desaparecen `CHARGE_FULL_MS`, `CHARGE_EXP`, `MASTERY_WINDOW_MS`, `AUTO_RELEASE_MS`, `MIN_TAP_MS`, `AIM_GAIN`, `AIM_MIN_RADIUS` y el ajuste fino `DRAG_*`. §2.1, §2.2, §11.3, §11.4, §11.6.
2. **Cancelar es gratis y visible.** Soltar a menos de **12 px** del origen devuelve el pájaro a la horquilla: sin tiro, sin coste, sin evento; dentro de ese radio no se dibuja guía y el anillo se muestra vacío. Es lo que permite que un niño explore la puntería sin miedo. §2.1, §8, §11.7.3.
3. **Cono abierto a 90°.** Cualquier dirección **no ascendente**, con recorte a la horizontal más cercana (guía en ámbar) en lugar de la conservación de "última dirección válida" de la v1.1. Nunca se lanza hacia arriba. §2.1, §11.4.
4. **Tope de apuntado que cancela, nunca suelta automática.** `AIM_MAX_MS = 6.000 ms`, y **el temporizador del posadero se congela mientras se apunta** (no así en *impaciente* y *pegajosa*). Apuntar deja de competir con el anti-*camping*. §2.1, §2.3, §11.7.4.
5. **Desaparece la sobrecarga de todo el documento.** Con potencia por distancia, castigar el mantenido no significa nada. Las formas de perder Aire pasan de **cinco a cuatro** (golpe, resaca, presión, atrapamiento) más el **coste opcional del doble salto**. §2.2, §2.4, §12.1, §12.3.8.
6. **Accesibilidad: "tirachinas largo" en vez de "carga lenta".** `LONG_SLING_MUL = 1,5` reparte la misma potencia en 105 px de recorrido: más precisión para quien la necesita, sin tocar ninguna otra constante del gesto. §8, §11.6.

**El tiro nace en el reposo**

7. **Se acabó corregir en el aire.** El lanzamiento sale de `RESTING`; en el aire hay **un solo "doble salto"** por fase (`AIR_LAUNCHES_MAX = 1`), que **cuesta 1 pip** y **nunca está disponible con el último**. Un toque sin doble salto disponible no hace nada. El juego pasa de reaccionar a **calcular**, y la trayectoria punteada gana peso como andamio. §2.1, §2.2, §2.7, §11.3, §11.7.14.
8. **El estado `CHARGING` se llama ahora `AIMING`** y no acumula nada con el tiempo; `chargeMs` desaparece de `Bubble` y entran `pullDist`, `pullTheta`, `aimMs`, `aimValid`, `cancelZone` y `airLaunchesUsed`. §11.2, §11.3.

**Mundo ancho**

9. **`WORLD_W = CHUNK_W = 540 px`** (tres ventanas de 180), altura de chunk sin cambios: la aritmética de profundidad, escalas y campaña (108 chunks = 25.920 px, 18–24 min) **no se toca**. §11.1, §4.1.
10. **La cámara sigue a Bur también en X**, con zona muerta `CAM_DEADZONE_X = [0,35 · 0,65]` y recorte a `[0, 360]`. En X **no hay trinquete**: la vista va y vuelve, porque explorar de lado es el punto. En Y no cambia nada. §4.3, §11.4, §11.7.15.
11. **Adiós a los carriles `L/C/R` y a la boca de entrada.** La continuidad la garantiza únicamente la regla de alcance entre anclajes, ahora **bidimensional**; los chunks siguen declarando `entryAnchorId` y `exitAnchorId`. Desaparecen `CHUNK_MOUTH_MIN_W` y el campo `entry/exit` del `Chunk`. §4.1, §11.2, §11.5.1, §11.5.11.
12. **Referencia de sensación: *Hungry Shark*** — agua abierta, estructuras dispersas, coleccionables que invitan a desviarse — con el **tercio inferior de la pantalla despejado** para el pulgar y paredes laterales sólidas en `x < 0` y `x > 540`. §4.3, §8.

**Menos potencia, mundo más denso**

13. **`IMPULSE_MIN/MAX` 150–430 → 90–280 px/s** y **tabla de alcance recalculada** con `d = (T/D)·(x − ln(1+x))`, `T = 167`, `D = 0,60`: **193 px** en Z1 y **140 px** en Z6 a plena potencia (antes 362 y 267), **30 px** con el tirón mínimo y **101 px** a media banda. Un tiro **ya no cruza un *chunk* entero**, que es exactamente lo que se buscaba. §2.2.
14. **`MAX_HOP_PX` 200…150 → [110 · 105 · 100 · 95 · 90 · 80]** y nueva **`MAX_HOP_X_PX` [200 · 190 · 180 · 170 · 160 · 140]**: la regla de alcance del generador es **2D** y se certifica con el **mismo integrador**, desde reposo y **sin doble salto** (el doble salto es margen del jugador, no del diseñador). El desnivel máximo queda en el **57% del alcance**, es decir, 43% de margen. §2.2, §11.5.11, §11.7.7.
15. **3–5 anclajes por chunk** en vez de 1–2, con repisas más y más cortas (24–48 px): más rutas, más rebotes y más decisiones por pantalla. §4.1, §12.1.
16. **La promesa de la presión se reformula con los números nuevos**: a radio 3,9 px un arrastre completo da **227 px/s**, lo mismo que 50 px de arrastre en superficie (**226 px/s**). El exponente 0,35 sigue siendo el correcto. §2.6, §11.7.2.

**Contratos y alcance**

17. **Los contratos de test de la carga por tiempo se sustituyen por contratos del tirachinas**: linealidad `p(70) = 1` / `p(35) = 0,5`, radio de cancelación, imposibilidad de lanzar desde `IDLE` sin doble salto, coste de 1 pip que nunca es el último, cámara X recortada y alcanzabilidad 2D. §11.7.1, .3, .4, .7, .14, .15.
18. **El checklist del MVP se actualiza sin crecer**: el gesto de tirachinas y el doble salto sustituyen a la carga y la sobrecarga, el validador certifica en 2D, la biblioteca es de chunks de 540 px con 3–5 anclajes y la accesibilidad cambia "carga lenta" por "tirachinas largo". El alcance en semanas **no se mueve**. §12.

**Qué no cambia:** pilares §0, historia y tono §1, zonas y catálogo §5, sistema de Aire (salvo la desaparición de la sobrecarga), presión, estaciones, boyas, misericordia, cámara en Y, economía §6, *juice* §7, hoja de ruta §9 y la sección 10 de riesgos abiertos.

**Ojeo (D5, añadido tras D1–D4)**

19. **El mundo ancho de D3 más el tiro corto de D4 dejan la repisa objetivo fuera de pantalla la mayoría de las veces.** Un arrastre libre de cámara chocaría con el tirachinas de D2 (cualquier toque congela un origen), así que la solución es un **minimapa que también es mando de cámara**: un dedo mantenido sobre él centra la vista en el punto tocado (`GameWorld.setPeek`); el otro dedo sigue libre para tirar. §4.3, §8.
20. **Es presentación, no regla.** `camera.peekX/peekY` se suman sobre la cámara del §4.3 como el *lookahead* de §7: `camera.x/y`, `maxY`, el trinquete, la resaca y el *streaming* nunca lo ven. Se dibuja `renderX/renderY`; el regreso al soltar usa `PEEK_RETURN_LAMBDA` y persigue el objetivo con `PEEK_LAMBDA`, los dos vía `smoothK`. Límites en `[0, WORLD_W − viewW]` en X y `[PEEK_UP_PX, PEEK_DOWN_PX]` en Y, con prioridad de lo que el *streaming* tiene cargado y con la vista sin ojear siempre dentro de la banda. Una pausa lo borra de golpe (`clearPeek`), porque el mundo deja de avanzar y el regreso no puede correr. §4.3, §11.6.
21. **El origen del tirachinas incluye el ojeo**: la conversión del dedo se hace sobre la vista dibujada, así que un mismo arrastre da la misma velocidad de lanzamiento con o sin ojeo activo. Mientras un tirón está en curso, el regreso del ojeo se congela (pero un segundo dedo sobre el minimapa lo sigue pilotando). §2.1, §11.7.18, §11.7.20.
22. **El minimapa nuevo en la HUD**, anclado a la cámara viva y no a la vista ojeada, dibuja repisas, peligros, coleccionables, campos, boyas y estaciones, el marco de la vista y a Bur; alpha completo en reposo/apuntando/ojeando, atenuado el resto. Ayuda de teclado opcional I/J/K/L en escritorio. §8, §11.6.
23. **Nuevos contratos de test** para la invariancia de reglas, el tirón relativo, la independencia de la tasa de fotogramas y el congelado durante el tirón. §11.7.17–20.
