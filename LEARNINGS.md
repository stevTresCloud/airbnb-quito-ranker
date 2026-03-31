# Learnings — Airbnb Quito Ranker

Registro de lo aprendido en cada fase. Incluye conceptos de Next.js,
decisiones de arquitectura, errores reales y por qué se resolvieron así.

---

## Fase 1 — Base y Auth (2026-03-29)

### Next.js 16 vs Next.js 14: diferencias que importan

#### 1. `middleware.ts` → `proxy.ts`
En Next.js 14 existía un archivo especial `middleware.ts` en la raíz que
interceptaba todos los requests antes de renderizar. En Next.js 16 ese archivo
se renombró a `proxy.ts` y la función exportada también cambió de nombre:

```ts
// Next.js 14 (viejo)
export function middleware(request: NextRequest) { ... }

// Next.js 16 (nuevo)
export function proxy(request: NextRequest) { ... }
```

Si usas el nombre viejo, el proxy simplemente no corre — sin error, sin aviso.

#### 2. `cookies()` es ahora async
En Next.js 14, `cookies()` de `next/headers` era síncrono:
```ts
// Next.js 14
const cookieStore = cookies()

// Next.js 16
const cookieStore = await cookies()
```

Olvidar el `await` no da error de TypeScript pero devuelve una Promise en lugar
del objeto de cookies, y todo falla silenciosamente.

#### 3. `useFormState` → `useActionState`
Para manejar el estado de un formulario que llama a un Server Action,
Next.js 14 usaba `useFormState` de `react-dom`. En React 19 / Next.js 16
se movió a React mismo y se renombró:

```ts
// Next.js 14
import { useFormState } from 'react-dom'

// Next.js 16
import { useActionState } from 'react'
```

La firma es la misma: `[state, action, isPending] = useActionState(fn, initialState)`.

---

### Conceptos clave de App Router

#### Route Groups — `(nombre)`
Los paréntesis en el nombre de una carpeta crean un "route group":
```
src/app/(auth)/login/page.tsx  →  URL: /login   ✅
src/app/(app)/page.tsx         →  URL: /         ✅
```
El nombre entre paréntesis NO aparece en la URL. Sirve para:
- Aplicar layouts distintos a grupos de páginas
- Organizar archivos sin afectar las rutas

#### Server Components vs Client Components
Por defecto, todos los componentes en App Router son **Server Components**:
- Se renderizan en el servidor
- Pueden hacer `await` directamente (sin useEffect)
- Pueden leer variables de entorno del servidor
- **No pueden** usar hooks (useState, useEffect) ni event listeners

Para usar hooks o interactividad, agrega `'use client'` al inicio del archivo:
```tsx
'use client'  // ← este comentario convierte el archivo en Client Component
import { useState } from 'react'
```

#### Server Actions (Server Functions)
Son funciones que corren en el servidor aunque se llamen desde el cliente.
Se marcan con `'use server'` y se pasan a formularios o botones:

```ts
// actions.ts
'use server'
export async function loginAction(prevState, formData) {
  // este código NUNCA llega al browser
  const email = formData.get('email')
  // ...
}
```

Regla importante: **no puedes definir Server Actions dentro de Client Components**.
Deben estar en un archivo separado con `'use server'` al inicio.

#### El flujo de autenticación con Supabase + proxy.ts
```
Request del usuario
      ↓
proxy.ts (corre primero, siempre)
  └─ ¿hay sesión? → No → redirige a /login
  └─ ¿hay sesión? → Sí → deja pasar
      ↓
Layout del route group (app)
  └─ segunda verificación server-side (defensa en profundidad)
      ↓
Page component (dashboard, detalle, etc.)
```

#### Por qué dos clientes de Supabase
```ts
createSupabaseBrowser()  // para Client Components ('use client')
createSupabaseServer()   // para Server Components y Server Actions
```
Supabase necesita acceso a las cookies para mantener la sesión.
- En el **browser**: las cookies son accesibles directamente
- En el **servidor**: hay que leerlas desde `next/headers`
- En el **proxy**: hay que poder leer Y escribir cookies (para refrescar el token)

---

### Estructura de archivos creados en Fase 1

```
src/
├── proxy.ts                        ← intercepta todos los requests (auth guard)
├── lib/
│   └── supabase.ts                 ← factories de clientes Supabase
└── app/
    ├── layout.tsx                  ← root layout (metadata, dark mode)
    ├── (auth)/
    │   ├── layout.tsx              ← layout mínimo para rutas públicas
    │   └── login/
    │       ├── page.tsx            ← formulario de login (Client Component)
    │       └── actions.ts          ← loginAction y logoutAction (Server Actions)
    └── (app)/
        ├── layout.tsx              ← layout protegido (verifica sesión, header)
        └── page.tsx                ← dashboard stub

supabase/
└── fase1.sql                       ← tablas + RLS + seeds (correr en Supabase)

next.config.ts                      ← security headers (CSP, HSTS, X-Frame-Options)
```

---

### Bug real encontrado en Fase 1

**Síntoma:** `localhost:3000` mostraba la página default de Next.js en lugar del dashboard.

**Causa:** Existían dos archivos para la misma ruta `/`:
- `src/app/page.tsx` — el archivo original de `create-next-app` (nunca borrado)
- `src/app/(app)/page.tsx` — el dashboard nuevo

Next.js no da error — simplemente usa uno y silencia el conflicto.
TypeScript tampoco lo detecta porque es una regla del framework, no del lenguaje.

**Solución:** Borrar `src/app/page.tsx`.

**Cómo habría sido evitado:** `npm run build` antes de probar en el browser.
El build de Next.js sí reporta conflictos de rutas. Por eso ahora el proceso
de verificación al final de cada fase incluye `npm run build` como primer paso.

---

### Security headers — qué hace cada uno

| Header | Protege contra |
|---|---|
| `X-Frame-Options: DENY` | Clickjacking — alguien no puede poner la app en un `<iframe>` |
| `X-Content-Type-Options: nosniff` | MIME sniffing — el browser no puede "adivinar" el tipo de un archivo |
| `Strict-Transport-Security` | Fuerza HTTPS — el browser nunca usará HTTP después de la primera visita |
| `Referrer-Policy` | Cuando el usuario sale a un link externo, no revela la URL completa |
| `Content-Security-Policy` | Declara qué orígenes pueden cargar recursos (scripts, imágenes, etc.) |
| `frame-ancestors 'none'` (dentro del CSP) | Lo mismo que X-Frame-Options pero más moderno |

---

## Fase 2 — Configuración Global (2026-03-29)

### Patrón Server Component + Client Component para formularios

El patrón estándar para páginas con formulario en App Router:

```
page.tsx (Server Component)
  └─ hace await de Supabase directamente en el cuerpo
  └─ pasa datos como props al Client Component

XxxForm.tsx (Client Component — 'use client')
  └─ recibe los datos iniciales como props
  └─ usa useActionState para conectar con el Server Action
  └─ maneja feedback de éxito/error

actions.ts ('use server')
  └─ verifica sesión (siempre, aunque la página ya esté protegida)
  └─ valida datos
  └─ escribe a Supabase
  └─ llama revalidatePath para invalidar caché
  └─ devuelve { ok: boolean; error?: string } | null
```

Por qué esta separación:
- El fetch inicial vive en el Server Component → HTML renderizado con datos ya incluidos (más rápido, sin flash de carga)
- La interactividad (useState, feedback, pending) vive en el Client Component → solo ese JS llega al browser
- Los Server Actions solo corren en el servidor → las credenciales de Supabase nunca llegan al cliente

### revalidatePath — para qué sirve

```ts
import { revalidatePath } from 'next/cache'
revalidatePath('/configuracion')
```

Next.js cachea el resultado de los Server Components. Sin `revalidatePath`, si guardas
la configuración y recargas la página, el Server Component devuelve el HTML cacheado
(con los valores viejos) en lugar de hacer fetch nuevo a Supabase.

`revalidatePath` marca ese caché como obsoleto. La próxima visita a esa ruta
dispara un nuevo fetch.

### Validación doble: cliente + servidor

Para la suma de pesos (debe ser 100%) y la suma de porcentajes de pago (debe ser 100%):

- **Cliente:** el botón se deshabilita si la suma ≠ 100 (feedback visual inmediato)
- **Servidor:** el Server Action también valida antes de escribir a DB

Por qué dos validaciones:
- La validación del cliente es UX (feedback en tiempo real, sin round-trip al servidor)
- La validación del servidor es seguridad (alguien podría llamar el Server Action directamente)
- Si solo validas en cliente: cualquiera con devtools puede enviar datos inválidos

### useActionState para formularios con feedback

```ts
const [estado, accion, pendiente] = useActionState<ActionState, FormData>(miServAction, null)
```

- `estado`: lo que devolvió el Server Action (null inicialmente, luego `{ ok, error }`)
- `accion`: se pasa al `<form action={accion}>` — reemplaza el submit normal
- `pendiente`: true mientras el servidor procesa

El Server Action recibe `(prevState, formData)` — el `prevState` es el estado anterior,
útil si quieres acumular mensajes. En este proyecto lo ignoramos (`_prevState`).

### Dos formularios en una misma página

Para el botón "Recalcular todo" que tiene su propio Server Action:

```tsx
// Formulario 1: guardar configuración
const [estado1, accion1, pendiente1] = useActionState(guardarConfig, null)
<form action={accion1}>...</form>

// Formulario 2: recalcular
const [estado2, accion2, pendiente2] = useActionState(recalcularRanking, null)
<form action={accion2}>...</form>
```

Cada `<form>` tiene su propio `useActionState` independiente. Así el feedback
de cada operación es separado y no se mezclan los estados.

### Rutas dinámicas vs estáticas en el build

En el output de `npm run build`:
- `○ (Static)` — página sin fetch de datos, Next.js la pre-renderiza una vez
- `ƒ (Dynamic)` — página con fetch de datos en cada request, se renderiza en el servidor

`/configuracion` y `/configuracion/scoring` son `ƒ Dynamic` porque hacen fetch a Supabase.
`/login` es `○ Static` porque no necesita datos para renderizar el formulario vacío.

### Estructura de archivos creados en Fase 2

```
src/app/(app)/configuracion/
├── actions.ts          ← Server Actions: guardarConfiguracion, recalcularRanking
├── ConfiguracionForm.tsx ← Client Component: formulario con 13 campos en 5 secciones
├── page.tsx            ← Server Component: fetch a Supabase → pasa a ConfiguracionForm
└── scoring/
    ├── actions.ts      ← Server Action: guardarPesos (con validación suma=1.00)
    ├── ScoringForm.tsx ← Client Component: 7 criterios con barra visual + contador suma
    └── page.tsx        ← Server Component: fetch criterios → pasa a ScoringForm
```

## Fase 3 — Ingreso de Proyectos (2026-03-29)

### Librerías puras (lib/) — la base de todo

`lib/calculos.ts` y `lib/scoring.ts` son TypeScript puro: input → output, sin DB, sin React.
Esta separación tiene dos ventajas:
- Se pueden testear con Vitest sin mocks de Supabase ni del browser
- El Server Action que guarda un proyecto las llama como funciones normales

### Vitest — tests para TypeScript puro

Vitest se configura en `vitest.config.ts`. La configuración mínima para funciones puras:
```ts
export default defineConfig({
  test: { environment: 'node' }  // sin DOM, más rápido
})
```

El alias `@/` (usado en imports como `@/lib/calculos`) **no** se resuelve automáticamente
en Vitest — si hubiera problemas, se agrega `resolve.alias` en la config. En este caso
funcionó porque los tests importan directamente desde rutas relativas.

### Bug encontrado en tests: tautología matemática

Al escribir el test de "no doble conteo de reserva", la verificación inicial era:
```ts
// INCORRECTO: reserva + pago_entrada_neto = monto_entrada_total (por definición)
// → ambas expresiones son iguales → el test siempre pasa aunque la lógica sea incorrecta
const conDobleConteo = reserva_efectiva + pago_entrada_neto + monto_durante_total + ...
```

La corrección: el doble conteo real es `reserva + monto_entrada_total` (sumar la reserva
dos veces encima de la entrada completa):
```ts
const conDobleConteo = reserva_efectiva + monto_entrada_total + monto_durante_total + ...
```

### score_roi requiere todos los proyectos para normalizar

`score_roi` se normaliza entre el mínimo y máximo ROI del conjunto.
El Server Action de `/nuevo/actions.ts` hace esto:
1. Calcula el `roi_anual` del nuevo proyecto con `calcularMetricas()`
2. Hace fetch de todos los `roi_anual` existentes en DB
3. Arma el array `[...existentes, nuevoRoi]`
4. Se lo pasa a `calcularScores()` para normalizar

Para tests, se pasa el array explícitamente como parámetro — sin DB.

### Claude API no acepta audio binario

Diseño original: enviar el audio grabado con MediaRecorder a Claude.
Problema: el SDK de Anthropic solo acepta `text` e `image` como tipos de contenido.
No hay soporte para audio binario.

**Solución adoptada:** separar en dos pasos:
1. **Browser**: Web Speech API transcribe en tiempo real (gratis, sin API key, funciona en Chrome Android)
2. **Servidor**: el texto transcripto se envía a Claude para extraer el JSON estructurado

Ventaja adicional: el usuario puede revisar y corregir el transcript antes de enviarlo a Claude.

### Web Speech API — declaración de tipos

TypeScript no incluye tipos de `SpeechRecognition` por defecto en configuraciones `strict`.
En lugar de instalar `@types/web`, declaramos solo lo mínimo necesario directamente en el
componente con `declare class SpeechRecognition`:
```ts
declare class SpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  start(): void; stop(): void
}
```
Esto evita agregar una dependencia de tipos solo para un componente.

### Route Handlers vs Server Actions para media

| Caso | Usar |
|---|---|
| Formulario HTML submit | Server Action |
| Upload de archivo binario / JSON complejo desde JS | Route Handler |

Los Route Handlers de Next.js 16 usan exactamente el mismo patrón que antes:
`export async function POST(request: Request) { ... }`

La sesión en Route Handlers se verifica igual que en Server Actions:
```ts
const supabase = await createSupabaseServer()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })
```

### redirect() en Server Actions

`redirect()` de `next/navigation` lanza una excepción internamente.
Debe llamarse **fuera de try/catch** en un Server Action.
Si está dentro de try/catch, el catch la atrapa como un error normal.

### Estructura de archivos creados en Fase 3

```
src/
├── types/
│   └── proyecto.ts              ← Interfaces InputCalculos, MetricasCalculadas, InputScoring, ScoresCalculados
├── lib/
│   ├── calculos.ts              ← Fórmulas financieras (TypeScript puro)
│   ├── scoring.ts               ← Motor de ranking con 7 criterios (TypeScript puro)
│   └── __tests__/
│       ├── calculos.test.ts     ← 8 tests unitarios
│       └── scoring.test.ts      ← 5 tests unitarios
├── app/
│   ├── (app)/
│   │   └── nuevo/
│   │       ├── page.tsx         ← Server Component (layout + heading)
│   │       ├── NuevoTabs.tsx    ← Client Component (tabs Foto|Voz|Manual)
│   │       ├── FormularioRapido.tsx ← Client Component (8 campos + useActionState)
│   │       └── actions.ts       ← Server Action: guardarProyecto (calcula métricas + scores)
│   └── api/
│       ├── transcribir/route.ts ← POST {transcript} → Claude → JSON proyecto
│       └── analizar-foto/route.ts ← POST {imagen base64} → Claude Vision → JSON proyecto
└── components/
    ├── GrabadorVoz.tsx          ← Web Speech API → transcript → /api/transcribir
    └── CamaraCaptura.tsx        ← <input capture> → base64 → /api/analizar-foto

vitest.config.ts                 ← config mínima para tests node (sin DOM)
```

## Fase 3b — Sectores Dinámicos (2026-03-30)

### 1. No se pueden exportar constantes desde archivos `'use server'`

`SECTORES`, `TIPOS` y `PREFERENCIAS` estaban exportados desde `actions.ts` que tiene `'use server'`.
En Next.js, un archivo `'use server'` **solo puede exportar `async function`s** — cualquier otro export
(constante, tipo, objeto) es ignorado o falla silenciosamente en runtime.

El error fue `SECTORES.map is not a function` en el browser porque el módulo llegó como `undefined`.

**Fix:** mover las constantes a `data.ts` (sin directiva), importarlas desde ambos lados.

**Regla:** si una constante la necesitan tanto Server como Client Components, va en un archivo neutro
(sin `'use server'` ni `'use client'`).

### 2. Separar scores de sectores del hardcode — patrón "pasar desde DB"

El motor de scoring tenía `SCORE_SECTOR` hardcodeado. El problema: para añadir un sector
había que modificar código. La solución sigue el mismo patrón que los pesos de criterios:

- La tabla `sectores_scoring` almacena `nombre → score_base`
- El Server Action fetcha el mapa y lo pasa a `calcularScores()` como parámetro
- `lib/scoring.ts` sigue siendo una función pura (sin Supabase) — testeable con Vitest

Nuevo parámetro con valor default vacío para no romper tests existentes:
```ts
export function calcularScores(
  proyecto, pesos, todos_roi, todos_precio_m2,
  scores_sectores: Record<string, number> = {}  // default = {} para retrocompatibilidad
)
```

### 3. CSV como fuente de verdad para seeds

El usuario tenía un ranking propio de 25 sectores de Quito Norte con scores, zonas,
rangos de precio Airbnb y perfiles. Se usó directamente como seed de `sectores_scoring`.

Ventaja: el CSV ya tenía la investigación hecha. Se generó el SQL de seeds a partir de él
sin inventar valores — los datos de `airbnb_noche_min/max` en el formulario vienen de esa misma fuente.

### 4. Hint de precio Airbnb en el select de sector

Al seleccionar un sector en el formulario, se muestra debajo del select:
`Airbnb estimado: $28–$45/noche`

Implementado con estado local en el Client Component (`useState(sectorSelect)`).
El array de sectores viene del Server Component (`page.tsx`) que lo fetcha antes de renderizar
y lo pasa como prop hasta `FormularioRapido` por la cadena: `page → NuevoTabs → FormularioRapido`.

### 5. Flujo "Agregar nuevo sector" sin romper la arquitectura de formulario

El select tiene un valor centinela `'__nuevo__'`. Cuando el usuario lo elige:
- Aparece un `<input>` de texto para el nombre
- Se usa un campo oculto (`sector_select`) que lleva el valor al Server Action
- En `actions.ts`: si `sector_select === '__nuevo__'`, se usa `sector_nuevo` como nombre real
- Antes de insertar: `ilike` (case-insensitive) verifica que no exista duplicado

El sector nuevo se crea en `sectores_scoring` con `score_base=0`. El usuario lo configura
después desde `/configuracion/sectores`. En el ranking aparece con score de ubicación=0
hasta que lo asigne — alerta visual `⚠ sin score` en la pantalla de configuración.

### 6. Dos formularios independientes en la misma página de configuración

`/configuracion/sectores` tiene:
- Formulario 1: editar scores/precios de sectores existentes → `guardarSectores`
- Formulario 2: agregar nuevo sector → `agregarSector`

Cada uno tiene su propio `useActionState`. Esto evita que el submit de uno interfiera con el otro
y permite feedback independiente. Mismo patrón que se podría aplicar en otras páginas de configuración.

### 7. `step={1000}` en inputs numéricos bloquea valores intermedios

El campo `precio_base` tenía `step={1000}`. HTML5 valida que el valor sea múltiplo del step.
Un precio real como $82,788 no es múltiplo de 1000 → el browser rechaza el submit con tooltip nativo.

**Fix:** `step={1}` para precios enteros, `step={0.01}` para áreas decimales.

## Fase Seguridad — Bloqueo de Configuración + Privacidad (2026-03-30)

### 1. WebAuthn — autenticación biométrica en el browser

WebAuthn (Web Authentication API) es el estándar del W3C para autenticación biométrica sin contraseñas. El browser actúa de intermediario entre la app y el sensor biométrico del dispositivo (huella, Face ID, Windows Hello).

**Dos flujos separados:**

```
REGISTRO (una vez por dispositivo):
  app → /api/webauthn/register-options → browser → sensor biométrico
  browser → respuesta firmada → /api/webauthn/register-verify → guarda en DB

AUTENTICACIÓN (cada vez que accede):
  app → /api/webauthn/auth-options → browser → sensor biométrico
  browser → firma → /api/webauthn/auth-verify → verifica con clave pública de DB
```

La clave privada **nunca sale del dispositivo**. El server solo guarda la clave pública y un contador anti-replay.

**Librería usada:** `@simplewebauthn/browser` (cliente) + `@simplewebauthn/server` (servidor).

**RP ID (Relying Party ID):** debe ser el dominio de la app.
- Desarrollo: `"localhost"`
- Producción: `"airbnb-quito-ranker.vercel.app"` (configurar en `NEXT_PUBLIC_APP_DOMAIN`)
- Si el RP ID no coincide con el origen del browser → WebAuthn falla con error de origen.

### 2. Challenge como cookie httpOnly — patrón para autenticación stateless

WebAuthn requiere que el servidor "recuerde" el challenge que generó para verificar que la respuesta del browser corresponde a ese challenge exacto (previene replay attacks).

Opciones de almacenamiento del challenge:
- **DB**: escala, pero requiere tabla temporal + limpieza
- **Redis**: rápido pero dependencia extra
- **Cookie httpOnly** ✅ — elegida: stateless, el browser la envía automáticamente, expira sola

```ts
// En register-options: generar challenge y guardarlo en cookie
cookieStore.set('_wac_reg', options.challenge, { httpOnly: true, maxAge: 300 })

// En register-verify: leer el challenge, verificar, borrar
const expectedChallenge = cookieStore.get('_wac_reg')?.value
cookieStore.delete('_wac_reg')
```

La cookie es `httpOnly` → JavaScript del cliente no puede leerla (protege contra XSS).
La cookie es `sameSite: 'strict'` → no se envía en requests cross-site (protege contra CSRF).

### 3. Sesión de desbloqueo con cookie httpOnly — Server Component puede leerla

Para el ConfigLock, se necesita saber si el usuario ya se autenticó en los últimos 30 min.

**Por qué cookie y no sessionStorage:**
- `sessionStorage` solo existe en el cliente → el Server Component no puede leerla → habría flash de overlay incluso si el usuario ya está desbloqueado.
- Cookie httpOnly → el Server Component del layout de `/configuracion/*` la lee directamente → si es válida, ni siquiera renderiza `<ConfigLock>` → sin flash.

```ts
// En /api/verificar-pin (y auth-verify): setear cookie de desbloqueo
cookieStore.set('config_unlocked', String(Date.now()), { httpOnly: true, maxAge: 30 * 60 })

// En configuracion/layout.tsx (Server Component): leer la cookie
const cookieStore = await cookies()
const unlockedAt = cookieStore.get('config_unlocked')?.value
const isUnlocked = unlockedAt && (Date.now() - Number(unlockedAt)) < 30 * 60 * 1000
```

### 4. Layout anidado para proteger un grupo de rutas

`src/app/(app)/configuracion/layout.tsx` es un nuevo layout que solo afecta a las rutas bajo `/configuracion/*`. Next.js anida layouts automáticamente:

```
(app)/layout.tsx              → aplica a todas las rutas de la app
(app)/configuracion/layout.tsx → aplica solo a /configuracion y sus sub-rutas
(app)/configuracion/page.tsx  → recibe ambos layouts anidados
```

Agregar un layout anidado es la forma limpia de proteger un grupo de rutas sin tocar cada `page.tsx` individualmente. El Server Component del layout puede hacer fetch y pasar props al `<ConfigLock>` Client Component.

### 5. React Context en App Router — patrón AppProviders

El `(app)/layout.tsx` es un Server Component → no puede montar contextos de React.

Solución: `AppProviders.tsx` es un Client Component mínimo que solo existe para proveer el contexto:

```tsx
// AppProviders.tsx ('use client')
export function AppProviders({ children }) {
  return <PrivacyProvider>{children}</PrivacyProvider>
}

// (app)/layout.tsx (Server Component)
return (
  <AppProviders>
    <Nav />
    <main>{children}</main>
  </AppProviders>
)
```

Los `children` del Server Component (que son otros Server Components) se pasan a través del Client Component sin "contaminarlos" — esto es válido en Next.js App Router.

### 6. Menú lateral (sidebar) + bottom tab bar — patrón combinado

Para apps mobile-first con también uso en desktop:
- `md:hidden` oculta el bottom bar en desktop
- `hidden md:flex` oculta el sidebar en móvil
- `md:ml-56` desplaza el contenido a la derecha del sidebar (256px = w-56)

El componente `Nav.tsx` es un Client Component porque necesita `usePathname()` para resaltar el ítem activo. El resto del layout puede ser Server Component.

### 7. Long-press en React — hook personalizado con setTimeout

Para el botón de privacidad, long-press de 1 seg activa el modo (útil en móvil sin hover):

```ts
function useLongPress(onLongPress, onClick, ms = 1000) {
  const timerRef = useRef(null)
  const longPressedRef = useRef(false)

  // onMouseDown / onTouchStart: iniciar timer
  // onMouseUp / onTouchEnd: cancelar si no expiró, o ejecutar click si no fue long-press
}
```

`longPressedRef` (no estado) evita un re-render innecesario y previene que el `onClick` se dispare después de un long-press.

### Estructura de archivos creados en Fase Seguridad

```
src/
├── contexts/
│   └── PrivacyContext.tsx        ← Context global + hook usePrivacy
├── components/
│   ├── AppProviders.tsx          ← Wrapper Client para PrivacyContext en Server layout
│   ├── ConfigLock.tsx            ← Overlay de bloqueo (PIN pad + WebAuthn)
│   ├── MontoPrivado.tsx          ← Renderiza número o ••••
│   └── Nav.tsx                   ← Actualizado: link Seguridad + botón 👁
└── app/
    ├── (app)/
    │   ├── layout.tsx            ← Actualizado: AppProviders + PrivacyButton en header móvil
    │   └── configuracion/
    │       ├── layout.tsx        ← NUEVO: Server Component, lee cookie + envuelve con ConfigLock
    │       └── seguridad/
    │           ├── page.tsx      ← Server Component: fetcha estado + credenciales
    │           ├── SeguridadForm.tsx ← Client Component: formularios PIN + WebAuthn
    │           └── actions.ts    ← Server Actions: guardarPIN, desactivarPIN, eliminarCredencial
    └── api/
        ├── verificar-pin/route.ts
        └── webauthn/
            ├── register-options/route.ts
            ├── register-verify/route.ts
            ├── auth-options/route.ts
            └── auth-verify/route.ts

supabase/
└── fase_seguridad.sql            ← ALTER TABLE configuracion + CREATE TABLE webauthn_credentials
```

### 8. Re-lock al salir de un grupo de rutas — detectar cambio de pathname en Nav

Para re-bloquear /configuracion/* al salir, `Nav.tsx` (ya Client Component con `usePathname`) compara el pathname anterior con el actual usando un `useRef`:

```ts
const prevPathname = useRef(pathname)

useEffect(() => {
  const wasInConfig = prevPathname.current.startsWith('/configuracion')
  const isInConfig  = pathname.startsWith('/configuracion')

  if (wasInConfig && !isInConfig) {
    fetch('/api/limpiar-config-lock', { method: 'DELETE' }) // fire-and-forget
  }

  prevPathname.current = pathname
}, [pathname])
```

**Por qué `useRef` y no `useState`:** el valor anterior del pathname es solo una referencia de comparación — no necesita causar un re-render. `useRef` persiste entre renders sin provocarlos.

**Fire-and-forget:** no hacemos `await` del fetch porque el usuario ya navegó. Si falla (red, error), en el peor caso el usuario entra a config sin PIN — riesgo mínimo y se recupera en el siguiente intento.

**Por qué está en Nav y no en un componente separado:** Nav ya importa `usePathname` y está presente en todas las rutas de la app. Añadir el efecto aquí evita crear un componente adicional solo para este propósito.

### 9. Bug real: useCallback después de early return — violación de Reglas de Hooks

**Síntoma:** "Rendered fewer hooks than expected. This may be caused by an accidental early return statement." al entrar el PIN correcto en ConfigLock.

**Causa:** `useCallback` estaba definido DESPUÉS de dos early returns:
```tsx
// INCORRECTO — useCallback está después de los early returns
if (!pinHabilitado && !webauthnHabilitado) return <>{children}</>  // early return
if (unlocked) return <>{children}</>                               // early return

const verificarPIN = useCallback(...)  // ← hook después del return → crash
```

Cuando `unlocked` pasa a `true` (PIN correcto), React ejecuta el segundo early return y nunca llega al `useCallback`. En el render anterior tenía 7 hooks (6 useState + 1 useCallback), en este render solo tiene 6 → crash.

**Fix:** Todos los hooks y callbacks siempre ANTES de cualquier `return` condicional:
```tsx
// CORRECTO — todos los hooks primero, early returns al final
const [unlocked, setUnlocked] = useState(false)
// ... más useState
const verificarPIN = useCallback(...)  // ← hook definido antes de cualquier return

// Early returns DESPUÉS de todos los hooks
if (!pinHabilitado && !webauthnHabilitado) return <>{children}</>
if (unlocked) return <>{children}</>

return <overlay>
```

**Regla:** En React, los hooks deben llamarse **siempre el mismo número de veces** en cada render. Nunca poner `if (...) return` antes de un `useState`, `useEffect` o `useCallback`. El linter de React (`eslint-plugin-react-hooks`) detecta esto en tiempo de desarrollo.

### Bug potencial a tener en cuenta

**WebAuthn y localhost en producción:** si Vercel asigna una URL de preview diferente a la de producción, el RP ID almacenado en las credenciales registradas no coincidirá con el nuevo origen → error de verificación. Registrar el dispositivo una vez por dominio (dev vs prod son distintos registros).

## Fase 4 — Dashboard y Ranking
*(se llenará al completar la fase)*

## Fase 5 — Detalle de Unidad
*(se llenará al completar la fase)*

## Fase 6 — Comparador
*(se llenará al completar la fase)*

## Fase 7 — Mapa
*(se llenará al completar la fase)*
