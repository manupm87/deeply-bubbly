# Deeply Bubbly

Juego móvil (portrait, pixel art) en el que una burbuja baja al fondo del mar. Navegador primero, tiendas después.

- Diseño normativo: `docs/design/GDD.md` (§11 = especificación técnica, §12 = alcance MVP). Investigación en `docs/research/`.
- Arquitectura y convenciones: `docs/engineering/ARCHITECTURE.md`. Léelo antes de tocar código.
- `packages/core` es lógica pura y determinista, sin Phaser/DOM (ESLint lo impide). `apps/web` es solo presentación e input y habla solo con `GameWorld`.
- Comandos: `pnpm check` (typecheck+lint+test+build), `pnpm dev`, `pnpm test`. pnpm está en `~/.local/bin` (corepack).
- Código y comentarios en inglés; docs y mensajes al usuario en español.
- Cada feature nueva: tests en core + revisión adversaria antes de darla por hecha.
