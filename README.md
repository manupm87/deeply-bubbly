<p align="center">
  <img src="https://img.shields.io/badge/estado-en%20desarrollo-3fc1c9?style=flat-square" alt="estado: en desarrollo" />
  <img src="https://img.shields.io/badge/plataforma-m%C3%B3vil%20%7C%20navegador-2a9d8f?style=flat-square" alt="plataforma" />
  <img src="https://img.shields.io/badge/licencia-source--available%2C%20solo%20lectura-f26b4f?style=flat-square" alt="licencia" />
</p>

<h1 align="center">🫧 Deeply Bubbly</h1>

<p align="center"><em>Una burbuja que quiere hacer lo único que una burbuja no sabe hacer: bajar.</em></p>

---

**Deeply Bubbly** es un videojuego para móvil (vertical, pixel art) en el que guías a **Bur**, una burbuja que
nace de la última bocanada de una ballena y decide descender hasta el fondo del océano para devolverle la luz
que se llevó sin querer. Por el camino: arrecifes, medusas farolillo, calamares curiosos, fumarolas
hidrotermales y la presión del agua, que la hace cada vez más pequeña.

**Un solo gesto.** Mantén pulsado para cargar, suelta para impulsarte hacia abajo. Bur flota, así que
descansa *debajo* de las repisas y cada tiro es una decisión: ¿bajo qué techo quiero caer?

**Sin castigo.** Nadie muere, nada sangra. Si te quedas sin aliento, Bur se deshincha con un suspiro y vuelve
a formarse unos segundos más arriba. Pensado para todas las edades.

> 🎮 **Pruébalo en el navegador (mejor desde el móvil):** <https://manupm87.github.io/deeply-bubbly/>
>
> 🚧 Es un primer jugable en construcción: Zona 1 con arte procedural y Zona 2 en *greybox*. Sin sonido
> definitivo, sin tienda, sin anuncios. Se despliega automáticamente con cada cambio en `main`.

## ¿Qué hay en este repositorio?

| Carpeta | Qué contiene |
|---|---|
| [`docs/design/GDD.md`](docs/design/GDD.md) | El documento de diseño completo: historia, zonas, criaturas, física, alcance del MVP |
| [`docs/research/`](docs/research/) | Investigación previa: mercado móvil, el océano real y dirección de arte, stack técnico |
| [`docs/engineering/`](docs/engineering/) | Arquitectura del código y especificación del shell web |
| [`packages/core/`](packages/core/) | La lógica del juego: TypeScript puro, determinista, sin motor gráfico, con tests |
| [`apps/web/`](apps/web/) | La versión para navegador (Phaser 3 + Vite), que más adelante se empaqueta para tiendas móviles |

## Cómo ejecutarlo en local

Necesitas Node 22 o superior y pnpm.

```bash
pnpm install
pnpm dev        # abre http://localhost:5173 (mejor con el modo dispositivo móvil del navegador)
pnpm test       # tests del núcleo
pnpm check      # typecheck + lint + tests + build
pnpm --filter @deeply-bubbly/web test:e2e   # Playwright en Chromium con perfil Pixel 7
```

Trucos útiles en el navegador: `?tuning=1` abre el panel de ajuste en vivo (o tecla `T`), `?debug=1` expone
`window.__db` con el mundo para inspeccionarlo, tecla `D` dibuja anclajes y cajas de colisión, espacio hace de
dedo en escritorio.

## Hoja de ruta

- [x] Investigación y documento de diseño
- [x] Arquitectura y contratos del núcleo
- [x] Núcleo jugable (física propia determinista, control, cámara, Zona 1) con 570+ tests
- [x] Shell web con HUD, tutorial, pantallas, efectos, audio sintetizado y panel de ajuste (`?tuning=1`)
- [x] Despliegue continuo en GitHub Pages y tests e2e en Chromium móvil
- [x] Zona 2 en *greybox*: corrientes, erizos, anémonas, pulpos; regla de misericordia activa
- [ ] Zona 3 en *greybox*, jefe Pulpa
- [ ] Playtest y ajuste de la sensación de juego
- [ ] Arte final, sonido, jefes 2 a 6
- [ ] Empaquetado móvil (Capacitor) y publicación en tiendas

## Licencia

El código es visible para que cualquiera pueda leerlo y aprender de él, pero **no es software libre**: no se
permite usarlo, copiarlo, modificarlo, redistribuirlo ni ejecutarlo sin permiso escrito. Consulta
[`LICENSE`](LICENSE) para el texto completo. Las dependencias de terceros conservan sus propias licencias.

---

<details>
<summary><strong>English summary</strong></summary>

**Deeply Bubbly** is a mobile-first (portrait, pixel-art) game about Bur, a bubble that descends into the
ocean to return a light it borrowed from a whale. One gesture: press and hold to charge, release to dive.
Bur floats, so it rests *under* ledges and the whole game scrolls downward. No deaths, no gore; made for all
ages. The repository holds the full game design document (Spanish), research notes, a pure-TypeScript
deterministic game core with tests, and a Phaser 3 browser shell. Work in progress; no playable release yet.

The code is source-available for reading only. Use, copying, modification and redistribution are not
permitted without written permission. See [`LICENSE`](LICENSE).
</details>
