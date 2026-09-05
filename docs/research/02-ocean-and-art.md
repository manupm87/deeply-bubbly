# Investigación: zonas oceánicas y dirección de arte — "Deeply Bubbly"

> Documento de investigación para dar soporte narrativo, de nivel (level design) y de arte a un juego mobile-first, pixel-art, en el que una burbuja desciende sin parar hacia el punto más profundo del océano.

---

## 1. Las zonas de profundidad del océano (base científica)

El océano se divide verticalmente en cinco grandes zonas pelágicas según la profundidad, la cantidad de luz, la presión y la temperatura. Esta estructura es un regalo para el diseño de niveles: cada zona es, literalmente, un "bioma" con su propia paleta, su propia luz y sus propios habitantes, y las transiciones entre zonas son puntos naturales para introducir mecánicas nuevas o un jefe.

| Zona | Profundidad | Luz | Presión | Temperatura | Rasgos y fenómenos destacados |
|---|---|---|---|---|---|
| **Epipelágica** (zona de luz solar / "zona fótica") | 0–200 m | Luz solar plena, fotosíntesis posible | ~1–20 atmósferas | Cálida, variable (según latitud) | Arrecifes de coral, algas, bancos de peces, luz que se filtra en rayos ("god rays"), oleaje y corrientes superficiales |
| **Mesopelágica** ("zona crepuscular") | 200–1.000 m | Solo llega ~1% de la luz solar; penumbra azul que se apaga con la profundidad | 20–100 atm | Desciende rápido, de templada a fría | Aquí empieza la bioluminiscencia como herramienta de caza/camuflaje; muchos animales migran cada noche hacia la superficie a comer ("migración vertical") |
| **Batipelágica** ("zona de medianoche") | 1.000–4.000 m | Oscuridad total, cero luz solar | 100–400 atm | ~4 °C, casi constante | Aquí la única luz es la que generan los propios animales; presión enorme; calamares y peces gigantes ("gigantismo de las profundidades") |
| **Abisopelágica** ("zona abisal") | 4.000–6.000 m | Oscuridad total | 400–600 atm | Cerca del punto de congelación | Llanuras abisales, fumarolas hidrotermales, charcas de salmuera, "lluvia marina" (marine snow) constante, restos de ballenas caídas (whale falls) que crean oasis de vida |
| **Hadal** (fosas oceánicas) | 6.000–~11.000 m | Oscuridad absoluta | 600–1.100+ atm | Muy fría, cercana a 1–4 °C | Fosas tectónicas estrechas; la Fosa de las Marianas (Challenger Deep) es el punto más profundo conocido, a **~10.935 m** (algunas fuentes citan hasta 10.994 m); presión equivalente a decenas de elefantes sobre un sello postal |

### Fenómenos naturales reutilizables como mecánicas de juego

- **Bioluminiscencia**: reacción química (luciferina) que usan más del 50% de los animales de aguas profundas para cazar, camuflarse o comunicarse (fotóforos, "bombillas" bacterianas). *Uso en juego*: luces que sirven de guía, de camuflaje temporal, o de señuelo/trampa (el pez rape).
- **Fumarolas hidrotermales (thermal vents)**: chimeneas que expulsan agua muy caliente rica en minerales; sostienen ecosistemas enteros (gusanos tubícolas gigantes) sin luz solar, mediante quimiosíntesis. *Uso en juego*: corrientes ascendentes de calor que impulsan a la burbuja hacia arriba (peligro/ventaja), o zonas que dañan si se tocan directamente.
- **Ballenas caídas (whale falls)**: un cadáver de ballena en el fondo se convierte en un ecosistema que dura décadas. *Uso en juego*: un set piece narrativo — un "oasis" de vida sorprendente en la zona más vacía y oscura, posible zona de descanso/checkpoint con criaturas amistosas.
- **Nieve marina (marine snow)**: lluvia continua de materia orgánica que cae desde arriba. *Uso en juego*: partículas visuales de fondo (parallax), o plataformas móviles/pegajosas hechas de detritos.
- **Charcas de salmuera (brine pools)**: lagos de agua hipersalina en el fondo marino, más densos que el agua circundante, tóxicos en el centro pero con vida abundante en sus bordes. *Uso en juego*: obstáculo de "no tocar el centro", zona de flotación anómala (la burbuja rebota o flota distinto).
- **Corrientes y migración vertical**: cada noche, billones de criaturas mesopelágicas suben a la superficie a comer y bajan de día. *Uso en juego*: corrientes que empujan lateral o verticalmente, "tráfico" de criaturas migrando que hay que esquivar o cabalgar.
- **Gigantismo de las profundidades**: en la oscuridad y el frío, algunos animales (calamar gigante, cangrejo araña japonés, isópodo gigante) alcanzan tamaños enormes. *Uso en juego*: base biológica real y creíble para justificar jefes de gran tamaño en las zonas profundas.

---

## 2. Cómo lo hacen los juegos de referencia (arte y diseño)

### Dave the Diver
Combina sprites en pixel art de alta calidad para el personaje y criaturas pequeñas con fondos y elementos 3D (edificios, barcos, jefes grandes) para dar profundidad de composición. La paleta está cuidadosamente limitada y las animaciones son fluidas y expresivas. Lección aplicable: no todo tiene que ser pixel-art puro; se puede mezclar una capa de fondo con más detalle/parallax suave sin romper la lectura del primer plano en pixel-art nítido.

### Convenciones generales de pixel-art submarino/acuático (Ecco the Dolphin, Abzu, niveles acuáticos de Mario/Kirby, Subnautica)
- **Paleta por profundidad**: la saturación y el brillo bajan progresivamente con la profundidad; el tono general se desplaza de cian/turquesa (superficie) → azul medio → azul-violeta oscuro → casi monocromo negro-azulado con acentos de un solo color vivo (bioluminiscencia) en las zonas más profundas. Subnautica sigue este patrón exacto zona a zona y es el ejemplo más citado de "diseño de bioma por profundidad".
- **Iluminación como narrador de profundidad**: rayos de luz ("god rays") en superficie, penumbra difusa en zona crepuscular, y luz puntual (fotóforos, criaturas, fumarolas) como único punto de interés visual en la oscuridad total. La luz puntual también sirve de gancho de lectura en pantallas pequeñas: el ojo va directo al punto brillante.
- **Parallax en capas**: normalmente 3–4 capas (fondo lejano muy desaturado y borroso, capa media con siluetas de flora/fauna, capa de juego nítida en primer plano, partículas flotantes tipo "nieve marina" en una capa casi transparente delante de todo). Esto da sensación de profundidad sin necesidad de 3D real.
- **Mood/atmósfera (Abzu)**: prioriza composiciones amplias, bancos de peces como "coreografía" de fondo, y una paleta de pocos colores muy saturados por escena para generar impacto emocional; los momentos de calma usan paletas frías, los de tensión introducen un color de alerta (rojo/naranja) que contrasta fuerte con el azul dominante.

### Recomendaciones concretas para pantalla mobile pequeña (portrait)
- **Siluetas antes que detalle**: en pantallas pequeñas, la legibilidad depende de la silueta reconocible del sprite, no del detalle interno. Contornos (outline) oscuros o de color contrastante en personajes/obstáculos ayudan mucho; en fondos, en cambio, restan legibilidad si se abusa.
- **Tamaño de sprite**: 32×32 px es un punto de partida razonable para elementos jugables (la burbuja, obstáculos pequeños); jefes y set pieces pueden escalar sin perder el mismo pixel-density (mismo tamaño de píxel base) para mantener coherencia visual.
- **Paleta compartida y limitada por zona**: usar una paleta maestra reducida (16–32 colores) con subconjuntos por zona evita ruido visual y refuerza la identidad de cada bioma; los colores de UI (barra de carga del impulso, indicadores de vida/tamaño de la burbuja) deben reservarse y no reutilizarse en el escenario, para que se lean instantáneamente como interfaz y no como parte del mundo.
- **Contraste funcional**: el elemento que amenaza (corriente, criatura, disminución de presión) debe tener un color que rompa la paleta ambiente de la zona (ej. un tono cálido en un bioma frío) para que el jugador lo perciba en una fracción de segundo, crítico en un juego de reflejos rápidos en vertical.
- **Menos anti-aliasing = más legible**: bordes duros y pixel-perfect leen mejor a tamaños pequeños que bordes suavizados, especialmente en movimiento rápido (scroll continuo).

---

## 3. Framing apto para todas las edades (sin miedo ni gore)

El objetivo de diseño ("apto para todas las edades, pensado para ~16 años, sin sangre/gore") es totalmente compatible con la fauna real de aguas profundas si se enfatiza el asombro y la curiosidad en vez del terror:

- **Pez rape (anglerfish)**: en vez de depredador aterrador, se puede presentar como una criatura "con linterna propia" que ilumina el camino (aliado neutral) o como un obstáculo de "sigue la luz con cuidado" (su lámpara atrae, no debe herir).
- **Calamar gigante**: sus ojos enormes (de los más grandes del reino animal) y su tamaño son un gancho visual perfecto para un jefe imponente pero no gore — grande, curioso, casi tímido, en vez de agresivo.
- **Gusanos tubícolas / fumarolas**: vida "imposible" sin sol, ideal para un momento de asombro ("¡hay vida aquí abajo, sin luz!") con tono educativo positivo.
- **Ballena caída**: en vez de un cadáver explícito, representarla como una "gran estructura ósea antigua cubierta de vida y luces", un santuario/oasis, evitando cualquier iconografía macabra.
- Regla general: nada de dientes ensangrentados, ataques explícitos o "muerte" gráfica de la burbuja; el fallo se resuelve con "la burbuja se encoge/pierde brillo/estalla suavemente con un efecto burbujeante", nunca con violencia.

---

## 4. Tabla zona por zona (para nivel/arte del juego)

| Zona (profundidad in-game) | Mood | Paleta sugerida | Criaturas y flora | Peligros / aliados potenciales | Jefe potencial |
|---|---|---|---|---|---|
| **1. Superficie / Epipelágica** (0–200 m) | Alegre, luminoso, tutorial | Cian, turquesa, blanco espuma, amarillo sol filtrado | Peces payaso, corales, algas, tortugas, bancos de peces pequeños | Oleaje/corrientes suaves que empujan lateral; medusas como primer "toca y rebota"; algas como plataformas blandas | Pez globo curioso o tortuga guía (jefe tutorial, no letal) |
| **2. Arrecife profundo / borde epipelágico** (~50–200 m) | Vibrante pero ya con caída de luz | Turquesa oscuro, coral naranja/rosa como acento | Peces payaso, pulpos, estrellas de mar, anémonas | Corrientes de arrecife, anémonas urticantes (rebote), pulpo camuflado (ilusión) | Pulpo gigante "guardián del arrecife" |
| **3. Zona crepuscular / Mesopelágica** (200–1.000 m) | Misterio, penumbra azul, primeras luces propias | Azul-violeta desaturado con puntos de bioluminiscencia cian/verde | Calamares, peces linterna, medusas bioluminiscentes, pez rape pequeño | Migración vertical (tráfico de criaturas), luces que confunden/guían, corrientes frías que ralentizan | Calamar gigante juvenil (grande, curioso, no agresivo) |
| **4. Medianoche / Batipelágica** (1.000–4.000 m) | Oscuridad casi total, tensión, asombro | Negro-azulado, acentos únicos de bioluminiscencia (un solo color vivo por escena) | Pez rape adulto, peces de gigantismo moderado, calamares grandes | Presión que encoge/ralentiza la burbuja; oscuridad que reduce visibilidad (mecánica de "seguir la luz"); zonas de alta presión que exigen cargar más el impulso | Pez rape gigante ("linterna viviente") |
| **5. Abisal** (4.000–6.000 m) | Vacío, solemne, sorpresa de vida | Casi monocromo gris-azul oscuro, acentos cálidos puntuales (fumarolas) | Gusanos tubícolas, cangrejos de aguas profundas, isópodos gigantes | Fumarolas hidrotermales (corrientes de empuje/daño), charcas de salmuera (obstáculo de flotación), nieve marina como plataformas móviles, "ballena caída" como zona de respiro/checkpoint | Cangrejo araña gigante o guardián de la fumarola |
| **6. Fosa hadal / Challenger Deep** (6.000–~10.935 m) | Épico, extremo, clímax | Negro casi puro con un único tono de luz (ej. dorado o blanco) reservado para el objetivo final | Anfípodos gigantes, criaturas únicas de fosa (poco conocidas = libertad creativa) | Presión extrema (mecánica al límite: la burbuja muy pequeña/frágil), paredes estrechas de la fosa, gigantismo extremo como amenaza final | Jefe final: criatura endémica de fosa, gigante pero majestuosa, guardiana del "fondo del mundo" |

---

## 5. Conexión con la mecánica del juego

- **Presión como recurso narrativo y de gameplay**: al bajar de zona, subir la presión puede encoger progresivamente la burbuja (más difícil de controlar, más frágil), lo que justifica mecánicamente por qué el juego se vuelve más difícil y por qué recoger "burbujas de aire" o power-ups de resistencia a la presión tiene sentido narrativo.
- **La luz como recompensa visual y funcional**: en zonas oscuras, la bioluminiscencia puede marcar superficies seguras para aterrizar (gameplay: "plataformas que brillan"), resolviendo a la vez el problema de legibilidad en pantalla pequeña y reforzando el tema.
- **Transiciones de zona = punto de anclaje de nivel**: cada cambio de zona (200 m, 1.000 m, 4.000 m, 6.000 m) es un punto natural para: cambiar paleta, introducir una mecánica nueva (corriente, encogimiento por presión, oscuridad), y opcionalmente un mini-jefe o set piece (ballena caída, fumarola) que sirva de checkpoint/respiro antes de la siguiente dificultad.
- **Coherencia con inspiraciones del owner**: igual que Doodle Jump usa plataformas que se generan sin fin hacia arriba, aquí las "plataformas" (rocas, coral, criaturas dormidas, fumarolas apagadas) se generan hacia abajo con biomas que cambian de arte y de reglas, dando variedad sin perder la mecánica simple de un solo toque (cargar y soltar, estilo Angry Birds).

---

## Fuentes consultadas

- [Woods Hole Oceanographic Institution — Ocean zones](https://www.whoi.edu/ocean-learning-hub/ocean-topics/how-the-ocean-works/ocean-zones/)
- [Bathypelagic zone — Wikipedia](https://en.wikipedia.org/wiki/Bathypelagic_zone)
- [Mesopelagic zone — Wikipedia](https://en.wikipedia.org/wiki/Mesopelagic_zone)
- [Ocean Depth Zones — Study.com](https://study.com/learn/lesson/ocean-depth-zones.html)
- [Depth Zones — manoa.hawaii.edu/ExploringOurFluidEarth](https://manoa.hawaii.edu/exploringourfluidearth/physical/ocean-depths/depth-zones)
- [Layers of the Ocean — Sea and Sky](https://www.seasky.org/deep-sea/ocean-layers.html)
- [Whale Fall Ecosystems — Natural World Facts](https://www.naturalworldfacts.com/whale-fall-ecosystems)
- [Hydrothermal Vent Communities — Natural World Facts](https://www.naturalworldfacts.com/hydrothermal-vents)
- [Deep Sea Gigantism — Natural World Facts](https://www.naturalworldfacts.com/deep-sea-gigantism)
- [Bioluminescence Explained — Natural World Facts](https://www.naturalworldfacts.com/bioluminescence-explained)
- [Brine Pool Ecosystems Explained — Natural World Facts](https://www.naturalworldfacts.com/brine-pool-ecosystems)
- [Marine snow — Wikipedia](https://en.wikipedia.org/wiki/Marine_snow)
- [Dave the Diver — Wikipedia](https://en.wikipedia.org/wiki/Dave_the_Diver)
- [Dave the Diver: How Unity Blends 2D Pixel Art with 3D Elements — foro3d.com](https://foro3d.com/en/2026/february/dave-the-diver-how-unity-fuses-2d-pixel-art-with-3d-elements.html)
- [Pixel Art Design for Game Development — Alain Galvan](https://alain.xyz/blog/pixel-art-design-for-game-dev)
- [Pixel Art Color Palettes: A Complete Guide — FreePixel](https://freepixel.art/blog/pixel-art-color-palettes-complete-guide)
- [Experts' Game Art Design Guide For Your Dream Mobile Game — 300mind.studio](https://300mind.studio/blog/mobile-game-art-design-guide/)
- [Deep sea animals A to Z — Monterey Bay Aquarium](https://www.montereybayaquarium.org/visit/exhibits/into-the-deep/deep-sea-animals-a-to-z)
- [7 Weird and Wild Deep-Sea Creatures — Ocean Conservancy](https://oceanconservancy.org/blog/2019/07/04/weird-wild-deep-sea-creatures/)
- [The Giant Squid: 12 Fascinating Facts — Wildlife Nomads](https://www.wildlifenomads.com/blog/giant-squid-facts/)
- [Deep-sea Giant Squid — Smithsonian Ocean](https://ocean.si.edu/ocean-life/invertebrates/deep-sea-giant-squid)
