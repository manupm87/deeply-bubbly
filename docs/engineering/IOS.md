# App iOS: plan (v1.4)

Fecha: 2026-09-06. Estado: **plan acordado con el owner, sin empezar**. Decisión de stack tomada en `docs/research/03-tech-stack.md` y `ARCHITECTURE.md`: **Capacitor** envolviendo la build web (`apps/web/dist`) en un WebView nativo, en un paquete nuevo `apps/mobile`.

## 1. Requisitos y qué tenemos

| Necesario | Estado |
|---|---|
| Mac con Xcode | El owner lo tiene; el desarrollo pasa al Mac (este repo se clona allí). Apple solo compila y firma iOS en macOS. |
| Apple ID | Con un Apple ID **gratuito** Xcode firma con un "Personal Team" e instala en el iPhone por cable. Límites: caduca a los **7 días** (reinstalar desde Xcode), máximo 3 dispositivos propios, 10 apps por Apple ID, sin TestFlight, sin push/compras/Game Center. Suficiente para playtests. |
| Apple Developer Program (99 $/año) | Solo para TestFlight y App Store. Pedirla uno o dos días antes de necesitarla. |
| App preparada para WebView | Ya: `viewport-fit=cover`, `apple-mobile-web-app-capable`, HUD dentro de `env(safe-area-inset-top)`, audio sintetizado desbloqueado en el primer toque, guardado en `localStorage`, pausa automática por `visibilitychange`/`blur`. |

## 2. Fases

### Fase A — instalación en el iPhone del owner (sin cuenta de pago)

1. **`apps/mobile`** con Capacitor: `capacitor.config.ts` (`appId` p. ej. `com.manupm.deeplybubbly`, `webDir` apuntando a `../web/dist`, `ios.contentInset: 'never'`, fondo del color del agua de Z1), orientación bloqueada a **portrait** en `Info.plist`, `pnpm` scripts `mobile:sync` y `mobile:open`.
2. **Iconos y pantalla de arranque** generados desde el arte procedural (Bur sobre el degradado de Z1) en todos los tamaños del catálogo de Xcode; script en `apps/mobile/tools/` para regenerarlos.
3. **Ajustes de WebView** que suelen morder en iOS: sin zoom por doble toque ni pellizco, sin rebote de scroll (`WKWebView` `bounces=false`), `allowsInlineMediaPlayback`, y probar el audio con el **interruptor de silencio** del iPhone (Web Audio respeta el silencio salvo que la sesión de audio sea `playback`: plugin o ajuste nativo si hace falta).
4. **Plugins nativos pequeños** (los dos únicos puntos donde web y nativo difieren):
   - **Háptica** (`@capacitor/haptics`): el "temblor" de impactos y del doble salto; en Safari no existe. Se conecta detrás de un puerto del shell (`platform/`), nunca en `core`.
   - **Estado de la app** (`@capacitor/app`): `pause`/`resume` nativos para la pausa automática, en lugar de fiarlo todo a `visibilitychange`.
5. **En el Mac**: `pnpm --filter @deeply-bubbly/web build && pnpm --filter @deeply-bubbly/mobile exec cap sync ios && cap open ios`; en Xcode elegir el Apple ID como Team, conectar el iPhone, Run. La primera vez el iPhone pide activar el **modo desarrollador** y confiar en el certificado en Ajustes > General > VPN y gestión de dispositivos.
6. Verificación: la suite de Playwright sigue siendo la del web; para la app, checklist manual en el iPhone (arranque < 2 s, portrait bloqueado, safe-area, audio con y sin silencio, háptica, pausa al bloquear pantalla, guardado tras cerrar la app).

### Fase B — TestFlight y App Store (con cuenta de pago)

1. Certificado de distribución, perfil de aprovisionamiento y clave de App Store Connect como secretos del repo.
2. Workflow de GitHub Actions en runner macOS que compila, firma y sube a TestFlight en cada tag `v*` (fastlane o `xcodebuild` + `altool`). Los minutos macOS cuestan 10× los de Linux; para este repo es poco.
3. Ficha: nombre, capturas en los tamaños obligatorios (6,7" y 6,5" al menos), descripción, **política de privacidad** (obligatoria; hoy la telemetría es local), clasificación por edad. Al ser para niños, decidir si entra en **Kids Category** (reglas propias sobre anuncios y enlaces externos; ver GDD §6.6) o se evita.
4. Ronda de TestFlight con el owner y familia antes de enviar a revisión.

## 3. Fuera de alcance por ahora

Android (Capacitor lo da casi gratis después), AdMob y vídeo recompensado (GDD §6.5, huecos ya maquetados), compras.

## 4. Riesgos

- **Rendimiento del WebView**: Phaser en WKWebView va bien en pixel art a zoom entero; vigilar el `postFX` de desenfoque de la pausa y los `god rays` en iPhones antiguos.
- **Audio**: iOS no suena antes del primer toque (ya contemplado) y el interruptor de silencio puede callar Web Audio; probar pronto.
- **Caducidad de 7 días** de la firma gratuita: aceptable para playtests; no para dárselo a nadie más.
