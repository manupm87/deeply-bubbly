# Investigación de mercado — Juegos móviles de referencia para "Deeply Bubbly"

Fecha: 2026-09-05
Autor: Investigación de mercado (research agent), para manugijon@gmail.com

## Objetivo

Analizar juegos móviles de éxito con mecánicas afines a la propuesta de "Deeply Bubbly" (one-touch / carga-y-suelta con física, scroll vertical, sesiones cortas) para extraer patrones de diseño, retención, monetización y "game feel" aplicables al proyecto. Se presta atención especial a juegos con **scroll siempre-hacia-abajo**, por ser el elemento de mayor novedad de la propuesta.

---

## 1. Doodle Jump

- **Core loop:** el personaje salta automáticamente hacia arriba de plataforma en plataforma; el jugador solo controla el movimiento lateral (inclinando el móvil o tocando los lados). Cae en muerte súbita si se sale de plataforma o le alcanza un enemigo.
- **Control:** tilt (acelerómetro) o toque en los laterales de la pantalla; cero fricción de aprendizaje.
- **Sesión:** muy corta (30 segundos–3 minutos), formato "una partida más".
- **Qué lo hizo pegar:** simplicidad radical, arte hecho a mano muy carismático, power-ups sorpresa (muelles, jetpacks, propulsores), y una curva de dificultad que se percibe justa ("morí por mi culpa, no por el juego").
- **Monetización:** banners, intersticiales entre partidas, IAP de skins/temas y, en versiones recientes, vídeo recompensado para continuar. Nota de advertencia: la saturación de anuncios en actualizaciones posteriores dañó la retención — hay un límite claro de tolerancia del jugador.
- **Lección de game feel:** el looping es prácticamente idéntico a lo que propone Deeply Bubbly, pero **invertido en verticalidad** (sube en vez de bajar) y sin física de carga: es más reactivo que "Angry Birds", que es el matiz que aporta la propuesta.

## 2. Downwell

- **Core loop:** descenso vertical constante por un pozo generado proceduralmente; el jugador dispara hacia abajo con "gunboots" para frenar la caída y encadenar combos de eliminación sin tocar el suelo (heurística de riesgo/recompensa).
- **Control:** un solo stick/dirección + un botón de disparo; extremadamente minimalista para lo profundo que llega a ser.
- **Sesión:** partidas de 15–20 minutos (run completa), pero cada nivel dura 1–2 minutos.
- **Qué lo hizo pegar:** el mecanismo de "cada sistema resuelve más de un problema" (disparar frena la caída, mata enemigos y genera munición al aterrizar) crea profundidad emergente sin más botones. El sistema de "Styles" al inicio de cada run (más vida vs. caída más lenta, etc.) da rejugabilidad tipo roguelike.
- **Monetización:** juego de pago único (sin anuncios ni IAP), lo que demuestra que un loop de descenso puede sostenerse por diseño puro, sin apoyarse en monetización agresiva.
- **Lección de game feel:** el "elemento primario es caer, y el éxito se mide en cuánto logras hacer en una guerra imposible contra la gravedad" — esa frase encaja casi literalmente con la premisa de la burbuja buceando cada vez más hondo.

## 3. Angry Birds

- **Core loop:** tensar un tirachinas (arrastrar hacia atrás), soltar para lanzar un proyectil con trayectoria balística; cada pájaro tiene una habilidad especial activable a mitad de vuelo.
- **Control:** arrastrar y soltar (drag-and-release), sin física oculta: el jugador ve el ángulo y la tensión antes de soltar.
- **Sesión:** niveles de 30 segundos a 2 minutos, con reintentos inmediatos.
- **Qué lo hizo pegar:** meses de ajuste fino de la física del tirachinas para que "se sintiera natural" en pantalla táctil; feedback visual y sonoro exagerado en cada impacto (juice); progresión de 1 a 3 estrellas por nivel que empuja a repetir para dominar.
- **Monetización:** pago inicial (modelo clásico), luego expansión a F2P con IAP de power-ups y "Mighty Eagle"; posteriormente vídeo recompensado para power-ups extra.
- **Lección de game feel:** el mecanismo de carga-y-suelta de Deeply Bubbly es prácticamente un calco de este tirachinas, pero aplicado en vertical y hacia abajo. La clave de Angry Birds es que **la fuerza de carga se visualiza claramente antes de soltar** — algo que Deeply Bubbly debe replicar (un indicador de tensión/potencia).

## 4. Getting Over It with Bennett Foddy

- **Core loop:** un solo control (un martillo que se maneja con el ratón/touch) sirve para empujar, tirar, columpiarse y "pogo-saltar"; un solo error puede hacer perder minutos u horas de progreso.
- **Control:** un único gesto continuo de arrastre, sin botones.
- **Sesión:** larga (30 min–varias horas por intento), pensada para streaming/narrativa personal, no para "snacking".
- **Qué lo hizo pegar:** la frustración como mecánica deliberada; el diseño de niveles depende del fallo del jugador para tener sentido narrativo/filosófico.
- **Monetización:** pago único, sin anuncios.
- **Lección de game feel:** confirma que un mecanismo de "carga físico único" puede sostener un juego entero, pero también es la advertencia de lo que Deeply Bubbly **debe evitar**: penalizaciones catastróficas por error de carga (retroceder toda la partida) generan frustración negativa, no la "difícil pero justa" que se busca en un público infantil/familiar.

## 5. Jelly Jump

- **Core loop:** cuanto más tiempo se mantiene pulsada la pantalla, más alto salta el personaje gelatina; soltar lanza el salto, y hay que mover el dedo lateralmente para dirigir el aterrizaje.
- **Control:** hold-to-charge + arrastre lateral simultáneo.
- **Sesión:** ultra corta, formato hipercasual (bajo 2 minutos).
- **Qué lo hizo pegar:** feedback visual inmediato de "cuánto más aguanto, más lejos llego", con el riesgo de pasarse y salirse de la plataforma — tensión constante entre precisión y ambición.
- **Monetización:** modelo hipercasual estándar (intersticiales + vídeo recompensado para revivir).
- **Lección de game feel:** es el ejemplo más cercano al mecanismo exacto de "pulsar y mantener para cargar fuerza" que propone el brief. Confirma que ese control es intuitivo y no requiere tutorial.

## 6. Alto's Odyssey

- **Core loop:** sandboarding infinito de scroll lateral; un solo toque para saltar/hacer trucos, mantener pulsado para trucos en el aire; progresión por misiones (llegar a X, encadenar Y grinds).
- **Control:** one-touch puro; se eliminó deliberadamente un mecanismo de gancho porque "complicaba el one-touch".
- **Sesión:** diseñado para sesiones cortas o largas por igual — "flow state" relajante con sonido ambiental cuidado.
- **Qué lo hizo pegar:** estética y sonido consistentes que inducen calma; sorpresas ambientales (tormentas de arena, globos) que rompen la monotonía del loop infinito sin añadir controles nuevos.
- **Monetización:** varía por plataforma — versión de pago único sin IAP en iOS (monetización "limpia"), versión Android freemium con tienda de monedas.
- **Lección de game feel:** demuestra que se puede mantener un único botón/gesto y aun así lograr profundidad mediante el entorno y las misiones, no mediante más controles. Aplicable directamente a cómo Deeply Bubbly puede añadir variedad (corrientes, criaturas) sin tocar el esquema de control.

## 7. Stack (Ketchapp)

- **Core loop:** un tap para soltar un bloque en movimiento sobre la pila; la precisión determina el tamaño del siguiente bloque, y de ahí la dificultad creciente.
- **Control:** un solo tap, sin arrastre ni carga.
- **Sesión:** extremadamente corta (bajo 1 minuto por partida).
- **Qué lo hizo pegar:** satisfacción visual y sonora exagerada por cada acierto (juice puro); dificultad autoimpuesta por el propio error del jugador.
- **Monetización:** referencia de la industria hipercasual: vídeo recompensado (continuar/revivir) mejora la retención y el tiempo de sesión, a diferencia de intersticiales/banners que la deterioran. Recomendación de mercado: 2–3 oportunidades de vídeo recompensado en sesiones cortas (<10 min), hasta 3–6 en sesiones más largas.
- **Lección de game feel:** valida el patrón "vídeo recompensado = revivir/continuar" como estándar de la industria, coherente con el punto del brief de dejar hueco para "continuar tras morir".

## 8. Flappy Bird

- **Core loop:** un tap = un impulso hacia arriba; la gravedad hace el resto; hay que enhebrar huecos entre tuberías.
- **Control:** un solo tap, sin variantes.
- **Sesión:** brutalmente corta, con reintentos inmediatos ("una más" compulsivo).
- **Qué lo hizo pegar:** dificultad muy alta con reglas triviales; competencia consigo mismo (superar el propio récord) como motor de retención, más que contenido nuevo.
- **Monetización:** solo banners, sin IAP; ejemplo de que ni siquiera hace falta vídeo recompensado si el loop es suficientemente adictivo — aunque hoy el estándar de mercado ha evolucionado hacia el rewarded video.
- **Lección de game feel:** advertencia de diseño — la dificultad extrema sin válvula de escape (sin power-ups, sin progresión) puede generar rechazo si no se dosifica; Deeply Bubbly, al apuntar a todas las edades, necesita una curva más amable que Flappy Bird.

## 9. Cut the Rope

- **Core loop:** puzles de física donde se cortan cuerdas y se manipulan objetos del escenario para llevar un caramelo hasta la boca de Om Nom.
- **Control:** gestos táctiles directos sobre los objetos físicos (cortar, tocar burbujas de aire, etc.), sin abstracción.
- **Sesión:** niveles de 1–3 minutos, cientos de niveles.
- **Qué lo hizo pegar:** filosofía de diseño explícita de "refuerzo positivo": el juego no castiga el error, premia el esfuerzo; física predecible y "elegante" que hace que cada solución se sienta ganada.
- **Monetización:** F2P con anuncios desactivables por suscripción/oferta especial; el estudio remarca que equilibrar monetización con diversión requirió mucho testeo iterativo.
- **Lección de game feel:** la física debe ser **predecible y legible**, no solo "realista" — el jugador tiene que poder anticipar el resultado de su input antes de soltar. Aplica directo al indicador de carga de Deeply Bubbly.

## 10. Bounce Tales / Icy Tower (clásicos Nokia/PC, precursores del género)

- **Core loop (Icy Tower):** el personaje salta más alto cuanto más impulso lateral (velocidad de carrera) lleva acumulado; hay que gestionar el momentum para subir una torre infinita.
- **Core loop (Bounce Tales):** plataformas físicas con una bola que rueda, rebota y se desliza; nivel de física muy sofisticado para su época (2001).
- **Sesión:** corta, pensada para partidas rápidas en móviles con teclas físicas.
- **Qué lo hizo pegar:** eran de los pocos juegos con "físicas de verdad" en móviles de gama baja de los 2000; el momentum como recurso a gestionar (no solo input directo) fue pionero de mecánicas que luego se ven en Doodle Jump.
- **Monetización:** preinstalados por Nokia, sin monetización directa (otra era de negocio).
- **Lección de game feel:** demuestran que la "física con personalidad" (rebote, inercia, sonido de goma) es una capa de producto tan importante como la mecánica en sí — algo directamente aplicable al pixel-art + física juicy que pide el brief.

## 11. Jetpack Joyride (mención breve, mismo género one-touch)

- **Core loop:** correr automáticamente hacia la derecha; mantener pulsado para volar con el jetpack (control análogo a "cargar", aunque aquí es continuo, no de soltar).
- **Sesión:** corta, con misiones diarias que alargan la retención a medio plazo.
- **Monetización:** referencia de la industria en el uso de vídeo recompensado bien dosificado — 3-6 oportunidades por sesión según duración, siempre opt-in ("si el jugador no puede rechazarlo sin penalización, no es rewarded video").
- **Lección:** las misiones/daily goals fuera del loop principal son un motor de retención D1-D7 barato de implementar y no interfieren con el control de una sola mano.

---

## Scroll siempre-hacia-abajo: ¿cuán novedoso es?

La búsqueda específica de juegos con scroll **permanentemente descendente** (no ascendente como Doodle Jump/Icy Tower, ni lateral como Alto's Odyssey) arroja resultados escasos y reveladores:

- La inmensa mayoría de los "vertical scrollers" de móvil son **de ascenso** (Doodle Jump, Icy Tower, Sonic Jump y decenas de clones): el jugador sube y el suelo es la amenaza (caer = morir).
- Los pocos ejemplos de descenso pura encontrados son de nicho y poco pulidos: *Just Fall Down*, *Just Goes Down* — plataformas que suben desde abajo mientras el jugador cae, evitando pinchos, sin mecánica de carga ni tema.
- *Downwell* es el título de descenso más pulido y exitoso, pero su control es disparo/movimiento continuo, no carga-y-suelta; y su tema es un pozo abstracto, no un océano.
- No se ha encontrado ningún juego mainstream de éxito que combine **(a)** scroll siempre-hacia-abajo, **(b)** control de carga-y-suelta al estilo tirachinas, y **(c)** tema de inmersión oceánica con profundidad como medidor de progreso/dificultad (más profundidad = más presión, más peligro).
- Los juegos de temática de "buceo/profundidad" existentes (*Deep Sea Diver*, *Underwater Survival: Deep Dive*, el formato "crash" *Deep Dive* de casino) usan movimiento lateral continuo o simuladores de supervivencia con gestión de oxígeno, no un loop de salto físico encadenado.

**Conclusión de novedad:** el género "descenso vertical infinito" existe pero está infra-explotado en comparación con su espejo ascendente, y la combinación específica de Deeply Bubbly (scroll descendente + carga/suelta tipo Angry Birds + tema oceánico con presión como mecánica) no tiene un competidor directo identificado. Esto es una ventaja de posicionamiento, pero también implica que **no hay un modelo de referencia ya validado por el mercado** para copiar directamente los ratios de dificultad/monetización de este sub-género exacto — habrá que testear más que en un clon directo.

---

## Diseño y lecciones para Deeply Bubbly

1. **Visualiza la carga antes de soltar.** Angry Birds y Jelly Jump funcionan porque el jugador ve la tensión/potencia acumulada (barra, estiramiento visual de la burbuja, partículas) antes de comprometerse. Sin este feedback, el control de "mantener pulsado" se siente arbitrario.

2. **Invierte el patrón de Doodle Jump, no lo copies literalmente.** El público ya conoce el loop "salta de superficie en superficie, controla dónde caer". Aprovecha esa familiaridad mental pero deja claro desde el primer segundo que aquí el objetivo es bajar, no subir (dirección de cámara, arte, tutorial de 3 segundos).

3. **La física debe ser predecible, no solo "realista" (lección de Cut the Rope).** El jugador necesita poder anticipar la trayectoria aproximada de la burbuja según cuánto cargue, especialmente en un juego apto para niños — evita aleatoriedad excesiva en el ángulo/potencia.

4. **Un solo input, profundidad emergente (lección de Downwell).** Mantén el esquema a un único gesto (pulsar-mantener-soltar) y añade profundidad mediante el entorno: corrientes que empujan, criaturas que rebotan distinto, presión que afecta el tamaño/fragilidad de la burbuja — nunca añadiendo botones nuevos.

5. **Diseña la penalización por fallo con cuidado (advertencia de Getting Over It).** Un público infantil/familiar no debe perder minutos de progreso por un solo error de carga. Preferible: perder altura/vidas de forma progresiva, no retroceder toda la run.

6. **Usa el "styles"/loadout inicial de Downwell como plantilla de rejugabilidad.** Ej.: elegir un "rasgo" de burbuja al empezar cada run (más resistente a presión vs. más ágil) da variedad sin generar contenido nuevo cada vez.

7. **Deja hueco visible desde el día 1 para "continuar" con vídeo recompensado**, aunque no se active en la v1. El patrón de mercado validado es: al morir, ofrecer opción opcional de revivir/continuar viendo un anuncio — nunca forzoso. Diseña la pantalla de game over ya pensando en ese hueco.

8. **Dosifica el vídeo recompensado, no lo fuerces.** Referencia de industria: 2–3 oportunidades por sesión corta, hasta 3–6 en sesiones más largas; siempre opt-in y en momentos de alta agencia del jugador (justo tras morir, o para doblar una recompensa), nunca interrumpiendo el flujo a mitad de partida.

9. **La sesión debe ser corta por diseño (30s–3min), con reinicio instantáneo.** Todos los referentes de éxito viral (Flappy Bird, Doodle Jump, Stack) minimizan la fricción entre "morir" y "reintentar" a menos de 1 segundo. Esto es crítico para el bucle de retención a corto plazo.

10. **La progresión de "zonas del océano" puede tomar prestada la estructura de niveles de Cut the Rope/Angry Birds**: bloques de 15–20 niveles por zona temática (superficie soleada → arrecife → zona de penumbra → fosa abisal), cada una con 1-2 mecánicas nuevas de entorno y un "boss" o hito visual al final, similar a cómo Angry Birds introduce un tipo de pájaro nuevo por bloque de niveles.

11. **Usa el juice como capa de producto, no como decoración (lección de Bounce Tales / Angry Birds / Stack).** Sonido "gomoso" al rebotar, deformación de la burbuja al cargar y al impactar, partículas de burbujas pequeñas al chocar contra corales/rocas: son baratos de implementar en pixel-art y son el principal factor de "sensación de calidad" en juegos de mecánica simple.

12. **Aprovecha el vacío de mercado del scroll siempre-descendente con tema oceánico.** No existe un competidor directo validado; esto es una oportunidad de posicionamiento ("el Doodle Jump al revés, submarino"), pero implica testear con usuarios reales antes de fijar curvas de dificultad, ya que no hay un balance de referencia que copiar de un clon exitoso.

13. **La presión del agua como debuff progresivo es un buen "reloj de dificultad" nativo del tema (en línea con el mecanismo "crash" de Deep Dive).** Puede sustituir a temporizadores artificiales: cuanto más profundo, más frágil/lenta la burbuja, generando tensión creciente coherente con la narrativa sin necesidad de un contador de tiempo visible, que puede resultar estresante para el público infantil.

14. **Diseña misiones/objetivos diarios fuera del loop principal (lección de Jetpack Joyride)** para dar una razón de volver a corto plazo (D1–D7) sin depender solo del "battle contra tu récord" de Flappy Bird, que se agota más rápido en audiencias jóvenes acostumbradas a más variedad.

15. **Cuidado con la saturación publicitaria post-lanzamiento (advertencia de Doodle Jump).** El brief ya contempla lanzar sin anuncios y añadirlos después de forma opt-in: mantener esa disciplina es clave, porque el precedente de mercado muestra que añadir anuncios agresivos a un juego ya querido erosiona la base de usuarios rápidamente.

---

## Fuentes consultadas

- [Expert Tips for Simplifying the Core Loop in Game Design](https://www.yodo1.com/blog/expert-tips-for-simplifying-the-core-loop-in-game-design)
- [How to Make Doodle Jump with Felgo - Monetization](https://felgo.com/doc/howto-doodle-jump-game-monetization-tutorial/)
- [Doodle Jump HD — Review 2026: Sentiment & Intel](https://marlvel.ai/intel-report/games/doodle-jump-hd)
- [Downwell Design Analysis - Game Developer](https://www.gamedeveloper.com/design/downwell-design-analysis)
- [Downwell Is The Mobile Roguelike I Can't Stop Playing](https://www.thegamer.com/downwell-roguelike-mobile-wont-stop-playing/)
- [Downwell (video game) - Wikipedia](https://en.wikipedia.org/wiki/Downwell_(video_game))
- [From Slingshot to Downfall: How Angry Birds Revolutionized Mobile Gaming](https://shahmm.medium.com/from-slingshot-to-downfall-how-angry-birds-revolutionized-mobile-gaming-and-lost-its-flight-bb3124b9d087)
- [Slingshot Science: The Physics in Angry Birds](https://www.sciencebuddies.org/blog/slingshot-science-the-physics-in-angry-birds)
- [Getting Over It with Bennett Foddy - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/GettingOverItWithBennettFoddy)
- [Designer Interview: The aesthetics of frustration in Getting Over It](https://www.gamedeveloper.com/design/designer-interview-the-aesthetics-of-frustration-in-i-getting-over-it-i-)
- [Getting Over It with Bennett Foddy - Wikipedia](https://en.wikipedia.org/wiki/Getting_Over_It_with_Bennett_Foddy)
- [Best Hyper-Casual Game Mechanics](https://game-ace.com/blog/hyper-casual-game-mechanics/)
- [Happy Jelly Jump 3D Game - Google Play](https://play.google.com/store/apps/details?id=com.jelly.jumpgame&hl=en_US)
- [Alto's Odyssey - Wikipedia](https://en.wikipedia.org/wiki/Alto's_Odyssey)
- [Alto's Odyssey – Hardcore Gaming 101](https://www.hardcoregaming101.net/altos-odyssey/)
- [Not all endless games are shallow: Alto's Odyssey proves it](https://androidguys.com/reviews/app-reviews/altos-odyssey-review/)
- [Quick Guide To Hyper-Casual Games - Game Developer](https://www.gamedeveloper.com/business/quick-guide-to-hyper-casual-games-definition-types-mechanics-and-monetization)
- [The ultimate guide to hyper casual games | Adjust](https://www.adjust.com/blog/how-to-make-a-hyper-casual-game-successful/)
- [A flappy case of a Flappy Bird - Game Developer](https://www.gamedeveloper.com/business/a-flappy-case-of-a-flappy-bird)
- [Top 7 mobile game monetization models in 2026](https://adapty.io/blog/mobile-game-monetization/)
- [Q&A: What the Cut the Rope makers learned from plunging into F2P](https://www.gamedeveloper.com/business/q-a-what-the-i-cut-the-rope-i-makers-learned-from-plunging-into-f2p)
- [Cut the Rope | Cut the Rope Wiki | Fandom](https://cuttherope.fandom.com/wiki/Cut_the_Rope)
- [Bounce Tales - Original Nokia - Google Play](https://play.google.com/store/apps/details?id=com.AdlemGames.BounceTales&hl=en_US)
- [Icy Tower | Play Online | NuMuKi](https://www.numuki.com/game/icy-tower/)
- [The Rewarded Video Ad Placement Playbook: Retention & Monetization](https://www.applixir.com/blog/the-rewarded-video-ad-placement-playbook-retention-monetization/)
- [Rewarded Playtime Handbook - AppSamurai](https://appsamurai.com/playbooks/rewarded-playtime/)
- [Vertically scrolling video game - Wikipedia](https://en.wikipedia.org/wiki/Vertically_scrolling_video_game)
- [91 Best Vertical Scrolling Games – Games Like](https://www.moregameslike.com/best-vertical-scrolling-games/)
- [Deep Dive | Underwater Crash Game - Veliplay](https://veliplay.com/our-games/deep-dive/)
- [Underwater Survival: Deep Dive - Google Play](https://play.google.com/store/apps/details?id=com.alien.open.world.underwater.games.ocean.survival&hl=en)
- [Deep Sea Diver - Google Play](https://play.google.com/store/apps/details?id=com.deep.sea.diver.dg&hl=en_US)
