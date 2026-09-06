# Deeply Bubbly

Juego móvil (portrait, pixel art) en el que una burbuja baja al fondo del mar. Navegador primero, tiendas después.

- **Estado, decisiones pendientes y forma de trabajar: `docs/engineering/HANDOFF.md`. Léelo primero en cada sesión nueva.** Siguiente paso: app iOS, plan en `docs/engineering/IOS.md`.
- Diseño normativo: `docs/design/GDD.md` (§11 = especificación técnica, §12 = alcance MVP). Investigación en `docs/research/`.
- Arquitectura y convenciones: `docs/engineering/ARCHITECTURE.md`. Léelo antes de tocar código.
- `packages/core` es lógica pura y determinista, sin Phaser/DOM (ESLint lo impide). `apps/web` es solo presentación e input y habla solo con `GameWorld`.
- Comandos: `pnpm check` (typecheck+lint+test+build), `pnpm dev`, `pnpm test`. pnpm vía corepack (`corepack enable`; en el PC WSL2 quedó en `~/.local/bin`).
- Código y comentarios en inglés; docs y mensajes al usuario en español.
- Cada feature nueva: tests en core + revisión adversaria antes de darla por hecha. Trabajo sustancial en workflows multiagente (opt-in permanente del owner), subagentes en Opus/Sonnet.
