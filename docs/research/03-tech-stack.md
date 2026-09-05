# 03 — Stack tecnológico para "Deeply Bubbly"

> Fecha de la investigación: 5 de septiembre de 2026. Versiones verificadas por búsqueda web en esa fecha; conviene reconfirmarlas antes de fijar versiones exactas en `package.json`.

## 1. Contexto y criterios de decisión

"Deeply Bubbly" es un juego 2D de física, pixel-art, portrait, mobile-first pero **browser-first**, con una única mecánica de entrada (mantener pulsado para cargar impulso, soltar para lanzar) y scroll descendente continuo. Requisitos clave para la elección de stack:

1. **Sensación física "jugosa" (juicy)** para una burbuja que rebota, se comprime y fluye en el agua — no basta con un motor de física simplista tipo AABB.
2. **Pixel-art nítido en pantallas hi-DPI** (sin blur de escalado, sin *bleeding* de texturas en los bordes de sprite).
3. **Input táctil de baja latencia** para un mecanismo de un solo toque (hold-and-release), crítico para el "game feel".
4. **Publicación en tiendas** (Google Play / App Store) partiendo de una base web, vía Capacitor/Cordova/TWA.
5. **Integración de anuncios recompensados** (AdMob) sin bloquear el diseño inicial (sin anuncios en v1, pero con "huecos" ya previstos: continuar tras morir, recompensas dobles).
6. **Código SOLID/DRY, testable de forma headless** (lógica de juego sin dependencias de renderizado, ejecutable con Vitest en Node sin canvas/WebGL).
7. **Agent-friendly**: TypeScript estricto, arquitectura en paquetes con fronteras claras, fácil de que un agente de IA razone y modifique sin romper otras capas.

## 2. Opciones evaluadas

### 2.1 Phaser 3 / Phaser 4 (+ Capacitor)

- **Versiones actuales**: Phaser 3 sigue mantenido (rama estable, ampliamente probada en producción). **Phaser 4** alcanzó estable con **v4.1.0 el 30 de abril de 2026**, tras varias release candidates; incluye un renderer WebGL reescrito desde cero (arquitectura basada en "render nodes"), sistema de filtros unificado y mejor gestión de contexto WebGL. La migración desde Phaser 3 es descrita por el propio equipo como "de pocas horas" para juegos que usan sprites, texto, tilemaps y objetos estándar.
- **Renderizado pixel-art**: soporte nativo de `pixelArt: true` / `roundPixels`, escalado por `Scale Manager` con modos `FIT`/`RESIZE`, y control de filtrado de texturas (nearest-neighbor) — exactamente lo necesario para hi-DPI sin blur.
- **Física**: incluye **Arcade Physics** (AABB/circular, rápida pero simplista — insuficiente para un "rebote jugoso" creíble de una burbuja deformable) y **Matter.js** integrado (rígida, con rotación, restitución, fricción, sensores — mucho más adecuada al *game feel* buscado). También se puede sustituir por un motor propio o **planck.js** si se desacopla bien la capa de física.
- **Input**: gestor de input táctil/puntero de bajo nivel, eventos `pointerdown/pointerup` sin overhead de frameworks UI — latencia mínima, adecuado para hold-and-release.
- **Empaquetado para tiendas**: patrón muy probado — Phaser + Vite + **Capacitor** (WebView nativo) es el camino más documentado y con más ejemplos de juegos publicados en Play/App Store.
- **Ecosistema y ads**: al ser el motor 2D web más usado, hay más tutoriales y ejemplos de integración con plugins de Capacitor para AdMob que con cualquier otra opción de esta lista.
- **Testing headless**: Phaser en sí acopla lógica y renderizado si no se diseña con cuidado; la solución (ver §4) es mantener el **core de juego (física, reglas, estado) en un paquete TypeScript puro sin importar Phaser**, y que Phaser solo consuma ese core desde las `Scene`. Esto es totalmente viable y es el patrón recomendado por la propia comunidad de Phaser + TDD.
- **Bundle size**: Phaser 3/4 completo ronda ~1.1–1.4 MB minificado (gzip ~300 KB); aceptable para un juego móvil vía WebView, y se puede recortar con tree-shaking parcial en v4.

### 2.2 PixiJS + física custom / planck.js / matter-js

- **Versión actual**: **PixiJS v8**, última release **8.20.1** (principios de septiembre de 2026); renderer WebGL/WebGPU muy rápido, arquitectura moderna, buen soporte hi-DPI (`resolution` configurable, `scaleMode: 'nearest'` para pixel-art).
- **PixiJS es solo un renderer** (no un motor de juego): no trae física, escenas, input de alto nivel, gestor de assets con flujo de juego, tilemaps, ni cámaras — todo eso hay que construirlo o añadirlo vía librerías de terceros (ej. `@pixi/layers`, `@esotericsoftware/spine-pixi`, etc.).
- **Física**: total libertad para elegir. Comparando las dos opciones de física de la lista:
  - **matter-js**: última versión estable **0.20.0** (npm), muy popular (>120k descargas/semana), API sencilla, buen renderer propio de depuración. Suficiente para la mayoría de rebotes/colisiones simples, pero su solver es menos preciso en pilas de cuerpos y en restituciones muy elásticas puede volverse inestable si no se ajustan bien los parámetros.
  - **planck.js**: port TypeScript/JS de **Box2D**, con solver iterativo más preciso, CCD (continuous collision detection) y más tipos de joints. Es la opción de mejor *calidad física* para un objeto rebotante como la burbuja (restitución consistente, sin *tunneling* a alta velocidad, comportamiento predecible bajo impulsos fuertes tipo Angry Birds). A cambio, API más "de bajo nivel" (unidades en metros, pasos de tiempo fijos) y curva de aprendizaje algo mayor.
- **Conclusión de esta rama**: PixiJS + planck.js da el mejor *techo* de calidad física y de rendering, pero implica construir a mano: gestor de escenas, input de alto nivel, sistema de cámara/scroll, gestor de assets — es decir, reconstruir buena parte de lo que Phaser ya da "de fábrica". Tiene sentido si el estudio va a invertir mucho tiempo en un motor propio; para un equipo pequeño que quiere iterar rápido y llegar a tienda, es más riesgo/tiempo sin beneficio claro frente a "Phaser + Matter.js" (que ya usa el mismo tipo de solver, con integración lista).

### 2.3 Excalibur.js

- **Versión actual**: **0.32.0** (publicada hace ~7 meses respecto a la fecha de la investigación). TypeScript de origen, API pensada para pruebas unitarias, motor honesto y bien documentado.
- Pros: TypeScript-first genuino (mejor que Phaser, que es JS con tipados añadidos), diseño orientado a testabilidad.
- Contras: comunidad y ecosistema mucho más pequeños que Phaser/PixiJS, motor de física propio menos maduro que Matter/Box2D para "juicy bouncing", menos ejemplos de publicación en tiendas vía Capacitor, menos plugins de terceros (ads, analytics). Riesgo de tener que resolver más problemas "primero" en lugar de iterar sobre el diseño del juego.

### 2.4 Godot 4 (export web)

- **Versión estable**: **4.7.1** (14 de julio de 2026). Export HTML5 nativo (WebAssembly + WebGL2) muy sólido para juegos completos.
- Pros: motor completo (física 2D Box2D-like propia, editor visual, animación, tilemaps, excelente para pixel-art con su renderer 2D nativo), exportación directa a Android/iOS/Web desde el mismo proyecto.
- Contras (decisivos para este proyecto):
  - El export web usa el **renderer "Compatibility"** únicamente (Forward+ y Mobile no soportados en web todavía) — limita fidelidad visual respecto al build nativo.
  - Lenguaje principal GDScript (o C#, no soportado en web); integrar TypeScript/Vitest headless para testear la lógica de juego de forma "web-native" no es el flujo natural de Godot — se perdería la ventaja de "lógica pura testeable con las mismas herramientas que el resto del stack web".
  - Menos natural para un equipo/agente que trabaja predominantemente en TypeScript y npm/pnpm; el "agent-friendly" del prompt (agentes de IA que editan código) encaja peor con un editor visual + `.tscn`/`.gd` que con un monorepo TS convencional.
  - Integración de AdMob vía plugins de Godot es más nicho que el ecosistema Capacitor.
- Godot es una alternativa muy competente si el equipo prioriza tener un único motor para todas las plataformas y no le importa salir del ecosistema npm; para los requisitos explícitos de este proyecto (browser-first, TS testable headless, agent-friendly, Capacitor) es una opción secundaria, no la principal.

### 2.5 Defold

- Motor ligero, muy buen rendimiento en móvil, exportación nativa a iOS/Android/HTML5/consolas sin coste de licencia.
- Lenguaje Lua — nuevamente rompe el requisito de "TypeScript, testable con Vitest, agent-friendly en un monorepo npm". Comunidad más pequeña que Phaser. Buen motor, pero no encaja con los criterios de este proyecto salvo que se acepte reescribir toda la lógica en Lua y perder Vitest/TS end-to-end.

### 2.6 Unity (WebGL / mobile)

- Motor más pesado; el build WebGL de Unity tiene arranque lento, tamaño de descarga grande y peor rendimiento relativo en navegadores móviles que las opciones basadas en Canvas/WebGL nativas de JS — contradice el requisito "browser-first". Unity brilla para 3D o 2D+3D híbrido y publicación store-first, no para un juego 2D ligero browser-first. C# no interopera con Vitest/TS. Se descarta para este proyecto.

## 3. Tabla comparativa resumida

| Criterio | Phaser 3/4 + Matter | PixiJS + planck.js | Excalibur.js | Godot 4 (web) | Defold | Unity |
|---|---|---|---|---|---|---|
| Calidad física "bouncy" | Alta (Matter) | Muy alta (Box2D) | Media | Alta (motor propio) | Alta | Alta |
| Pixel-art hi-DPI | Nativo, fácil | Nativo, fácil | Nativo | Nativo (con límite de renderer en web) | Nativo | Requiere ajuste fino |
| Latencia input táctil | Muy baja | Muy baja | Baja | Baja-media (overhead WASM) | Baja | Media (runtime pesado) |
| TS puro + Vitest headless | Sí, con disciplina de paquetes | Sí, con disciplina de paquetes | Sí, nativo | No (GDScript/C#) | No (Lua) | Parcial (C#, NUnit, no Vitest) |
| Camino a tienda (Capacitor) | Muy documentado | Documentado | Poco documentado | Export nativo propio | Export nativo propio | Export nativo propio |
| Ecosistema ads (AdMob) | Amplio | Amplio (vía Capacitor) | Escaso | Nicho | Nicho | Amplio (SDK propio) |
| Bundle inicial (web) | Medio (~300 KB gz) | Medio-bajo | Bajo | Alto (WASM runtime) | Medio | Muy alto |
| Madurez ecosistema/comunidad | Muy alta | Alta | Baja-media | Muy alta (pero no-web-first) | Media | Muy alta |
| Esfuerzo de "motor propio" a construir | Bajo | Alto (escenas, input, cámara) | Medio | Ninguno | Ninguno | Ninguno |

## 4. Recomendación

**Phaser 3 (rama estable actual) con Matter.js como física, TypeScript estricto, Vite como bundler, Capacitor para el empaquetado a tiendas, y una arquitectura de monorepo que aísle la lógica de juego pura en un paquete sin dependencias de renderizado.**

Justificación breve:

- Es la combinación con **menor riesgo de ejecución** para un equipo pequeño / agente de IA que necesita llegar a un juego jugable y publicable, no a construir un motor.
- **Matter.js** da la calidad de física "jugosa" necesaria para el rebote de la burbuja (restitución, rotación, fricción, sensores para gatillos de nivel) sin la sobrecarga de aprendizaje de Box2D/planck.js. Si más adelante el *game feel* exige más precisión (p. ej. rebotes a muy alta velocidad sin *tunneling*), la capa de física del core está aislada (ver §5) y se puede sustituir por planck.js sin tocar reglas de juego ni escenas.
- **Phaser 4** (estable desde abril 2026) es tentador por su renderer nuevo, pero para un proyecto que arranca ahora se recomienda **empezar en Phaser 3** (ecosistema de plugins y ejemplos de Capacitor/AdMob más probado) y **evaluar migrar a Phaser 4 en un hito posterior** — el propio equipo de Phaser documenta la migración como de bajo esfuerzo, y Phaser 4 es la apuesta de futuro del framework. Si al iniciar el proyecto Phaser 4 lleva ya varios meses estable y sus plugins de terceros (Capacitor examples, etc.) están al día, se puede arrancar directamente en v4.
- Pixel-art hi-DPI se resuelve con `pixelArt: true`, `roundPixels: true`, `Phaser.Scale.FIT` con `autoRound`, y una resolución de diseño fija en baja resolución (p. ej. 180×320 o 240×426) escalada por enteros cuando el DPI lo permite, evitando el filtrado bilineal.
- El input hold-and-release se implementa directamente sobre `pointerdown`/`pointerup` del gestor de input de Phaser (no sobre gestos de alto nivel), lo que minimiza la latencia — crítico porque toda la mecánica del juego depende de un solo gesto.
- Capacitor es, con diferencia, el camino con más ejemplos reales de "juego Phaser + Vite → Capacitor → Play Store/App Store" y con el ecosistema de plugins AdMob (`capacitor-community/admob` u otras alternativas mantenidas) más maduro para rewarded video.
- **TypeScript + Vitest headless** se garantiza por diseño de paquetes (§5), no por elección de motor: el core del juego (estado del nivel, física de la burbuja abstraída detrás de una interfaz, reglas de puntuación, generación de niveles, IA de enemigos) vive en un paquete `@deeply-bubbly/core` sin ningún import de Phaser/PixiJS/DOM, testeable 100% con Vitest en Node.

### Sobre PixiJS + planck.js

Sigue siendo la opción de **mayor techo de calidad** (mejor física, renderer más moderno/rápido) y merece reconsiderarse si, tras el prototipo, el equipo determina que Matter.js no da la sensación deseada y que vale la pena invertir en un motor de escenas/input propio. No se recomienda como punto de partida porque añade trabajo de infraestructura (gestor de escenas, cámara de scroll, gestor de assets) que Phaser ya resuelve, retrasando la validación del *game feel*, que es el riesgo de producto más importante de este juego.

### Sobre Godot 4, Defold y Unity

Se descartan como elección principal: los tres rompen el requisito explícito de "TypeScript testable headless con Vitest, agent-friendly, monorepo npm/pnpm". Son motores excelentes en general, pero no siempre encajan con equipos/agentes que iteran en TypeScript sobre un monorepo web, y Godot en concreto tiene limitaciones de renderer en su export web. Si en el futuro el proyecto decide abandonar el modelo "browser-first" a favor de máxima fidelidad nativa multiplataforma, Godot 4 sería la alternativa más razonable a revisar.

## 5. Arquitectura de monorepo propuesta

Gestor de paquetes: **pnpm** (workspaces) + **Turborepo** para orquestación de tareas y caché. Justificación: pnpm evita dependencias fantasma (instalación estricta por symlinks del content-addressable store) y es más rápido/ligero en disco que npm; Turborepo añade caché de builds/tests y ejecución paralela con grafo de dependencias, sin la complejidad añadida de Nx, que no aporta valor a este tamaño de proyecto todavía.

```
deeply-bubbly/
├── apps/
│   ├── web/                  # Shell del juego para navegador (Vite + Phaser)
│   │   ├── src/
│   │   │   ├── scenes/       # Boot, Preload, Menu, Gameplay, GameOver...
│   │   │   ├── render/       # Adaptadores: dibuja el estado del @core en Phaser
│   │   │   ├── input/        # Gestor hold-and-release sobre pointer events
│   │   │   ├── ads/          # Interfaz de "AdProvider" + stub sin ads (v1)
│   │   │   └── main.ts
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── mobile/                # Shell nativo (Capacitor) que envuelve apps/web
│       ├── android/
│       ├── ios/
│       ├── capacitor.config.ts
│       └── src/ads/           # Implementación real de AdProvider vía plugin AdMob
│
├── packages/
│   ├── core/                  # @deeply-bubbly/core — LÓGICA PURA, sin dependencias de render
│   │   ├── src/
│   │   │   ├── physics/       # Interfaz PhysicsEngine + adaptador Matter (o planck a futuro)
│   │   │   ├── bubble/        # Reglas de la burbuja: carga, impulso, presión, tamaño
│   │   │   ├── level/         # Generación/definición de niveles, zonas del océano
│   │   │   ├── entities/      # Enemigos, obstáculos, jefes (comportamiento, no dibujo)
│   │   │   ├── scoring/       # Puntuación, profundidad, combos
│   │   │   └── index.ts
│   │   └── package.json       # sin "phaser" ni "pixi.js" en dependencies
│   │
│   ├── game-phaser/            # @deeply-bubbly/game-phaser — capa de presentación Phaser
│   │   ├── src/                # Scenes/GameObjects que consumen @core vía su API pública
│   │   └── package.json        # depende de @deeply-bubbly/core + phaser
│   │
│   ├── assets/                  # @deeply-bubbly/assets — sprites, tilesets, audio, atlas
│   │   ├── sprites/
│   │   ├── audio/
│   │   └── package.json
│   │
│   ├── ads/                     # @deeply-bubbly/ads — interfaz AdProvider + implementación no-op
│   │   └── src/
│   │
│   └── config/                   # tsconfig base, eslint, prettier compartidos
│
├── tests/                        # (o co-localizados en cada paquete con Vitest)
├── docs/
│   └── research/
│       └── 03-tech-stack.md
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

Reglas de dependencia (SOLID/DRY, agent-friendly):

- `core` no importa **nada** de `phaser`, `pixi.js` ni del DOM — se testea con Vitest puro en Node, en milisegundos, sin canvas/WebGL. Expone interfaces (`PhysicsEngine`, `AdProvider`, `Clock`, `RNG`) que las capas externas implementan (Inversión de Dependencias).
- `game-phaser` traduce el estado de `core` a `Scene`/`GameObject` de Phaser; no contiene reglas de juego, solo presentación e input.
- `ads` define la interfaz `AdProvider` (mostrar recompensado, notificar recompensa) en `core`/`ads` puro, con una implementación *no-op* para v1 (sin anuncios) y una implementación real en `apps/mobile` sobre el plugin de Capacitor — así el "hueco para ads" pedido por el owner ya existe en la arquitectura sin activarse.
- `apps/web` es el punto de entrada para navegador (jugable y testeable en CI vía Playwright si se desea más adelante); `apps/mobile` es una capa fina que solo añade Capacitor + plugins nativos (AdMob, notificaciones, etc.) alrededor del build de `apps/web`.

## 6. Librerías clave y versiones (verificadas 5-sep-2026)

| Paquete | Versión recomendada | Rol |
|---|---|---|
| `phaser` | ^3.9x (última 3.x estable) — evaluar `^4.1.0` tras validar plugins/Capacitor en v4 | Motor de juego, renderer, escenas, Matter integrado |
| `matter-js` (vía `phaser.physics.matter`, o standalone) | `0.20.0` | Motor de física 2D |
| `pixi.js` | `8.20.1` (referencia si se opta por la ruta PixiJS en el futuro) | Renderer alternativo de mayor techo |
| `planck` (planck.js) | última release estable en npm (evaluar en el momento de adoptarla) | Física Box2D de mayor precisión (opción de upgrade) |
| `typescript` | `^5.6` o superior estable en el momento de iniciar | Tipado estricto en todo el monorepo |
| `vite` | `8.0.x` | Build/dev server para `apps/web` |
| `vitest` | `5.0.x` | Test runner headless para `packages/core` |
| `pnpm` | `^9.x` | Gestor de paquetes / workspaces |
| `turbo` (Turborepo) | última estable (motor Rust) | Orquestación de tareas y caché en el monorepo |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios` | última serie 6.x/7.x estable en el momento de empaquetar | Shell nativo Android/iOS desde el build web |
| `@capacitor-community/admob` (o equivalente mantenido, p. ej. `capacitor-admob-ads`) | última estable | Integración de AdMob (rewarded video) en `apps/mobile` |
| `eslint` + `@typescript-eslint` | última estable | Calidad de código consistente en todos los paquetes |

> Nota de mantenimiento: antes de fijar versiones exactas en `package.json`, confirmar la última patch/minor de cada paquete el día de la instalación, ya que este documento fija un punto en el tiempo (5-sep-2026).

## 7. Riesgos y próximos pasos

1. **Prototipo de "game feel" primero**: construir un prototipo mínimo (una burbuja, un suelo, carga y lanzamiento) en Phaser 3 + Matter.js antes de construir ninguna otra capa, para validar cuanto antes si Matter.js da la sensación deseada o si hace falta ajustar restitución/fricción/gravedad o migrar a planck.js.
2. **Definir la interfaz `PhysicsEngine` en `core` desde el día uno**, aunque solo tenga un adaptador (Matter), para que un cambio de motor de física futuro no obligue a tocar reglas de juego.
3. **Evaluar Phaser 4 en un hito posterior** (p. ej. tras el primer playtest interno), no en el arranque, para no absorber riesgo de un framework con pocos meses de estabilidad además del riesgo propio del juego.
4. **Diseñar la interfaz `AdProvider` y los puntos de enganche** (pantalla de "game over" → botón "continuar viendo anuncio", "duplicar recompensa") desde v1, aunque la implementación sea *no-op*, tal como pide el brief.
5. Confirmar antes de publicar en tienda las políticas de contenido de AdMob para audiencia infantil/familiar (framework de anuncios familiares de Google), dado que el público objetivo incluye niños.
