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

## Fase 4 — Dashboard y Ranking (2026-03-31)

### Patrón Server Component → Client Component (el más importante de App Router)

El dashboard usa el patrón fundamental de Next.js App Router:

```
page.tsx (Server Component)          RankingDashboard.tsx (Client Component)
  ↓ fetch desde Supabase                ↓ useState para filtros
  ↓ datos como props          →→→→→→    ↓ filtra/ordena en memoria del browser
  ↓ sin JavaScript en cliente           ↓ re-renders instantáneos sin round-trip
```

**Por qué esta separación:**
- Server Component: puede leer la DB directamente, corre en el servidor, no tiene `useState`
- Client Component: tiene `useState` / `useMemo`, pero no puede leer la DB
- La separación es obligatoria — mezclar rompe el build

**Cuándo filtrar en cliente vs servidor:**
Para ~20 proyectos, filtrar client-side es más rápido (0 latencia) y más simple.
Si hubiera miles de filas, usaríamos URL query params (`?sector=Quicentro`) para
que el Server Component filtre en la query de Supabase.

### `select()` explícito vs `select('*')`

```typescript
// ✓ Solo los campos que necesita el dashboard (~15 campos)
const { data } = await supabase.from('proyectos').select('id, nombre, score_total, ...')

// ✗ Envía todos los ~50 campos incluyendo notas, análisis IA, etc.
const { data } = await supabase.from('proyectos').select('*')
```

Para una app personal la diferencia es mínima, pero es buena práctica ser explícito.

### Cast doble `as unknown as T[]`

Cuando le pasas un string dinámico a `.select()`, Supabase TypeScript no puede inferir
el tipo resultado — lo tipifica como `GenericStringError[]`. Para convertirlo al tipo
propio, se necesita el doble cast:

```typescript
const proyectos = (data ?? []) as unknown as ProyectoRanking[]
// El cast directo `as ProyectoRanking[]` falla: los tipos no se superponen.
// `as unknown` primero "borra" el tipo → luego `as ProyectoRanking[]` lo reasigna.
```

Alternativa más robusta (para fases futuras): usar los tipos generados por
`supabase gen types typescript` — pero requiere setup adicional.

### `useMemo` para filtros sobre arrays

```typescript
const filasFiltradas = useMemo(() => {
  // pipeline de filtros...
}, [proyectos, filtros])
```

Sin `useMemo`, React recalcularía el pipeline completo en cada keystroke de
cualquier input de la página. Con `useMemo`, solo recalcula cuando cambian
`proyectos` (datos de Supabase) o `filtros` (estado del usuario).

### Fase 4.a — Enmascarar inputs de formulario con privacyMode

El modo privacidad (`usePrivacy()`) ya ocultaba montos en el ranking con `<MontoPrivado>`.
Para los inputs editables de `ConfiguracionForm` la técnica es diferente:

```tsx
// Cuando privacyMode=true:
<input type="hidden" name={name} defaultValue={valorReal} />   // valor real → form lo enviará
<div className="...">••••</div>                                  // solo display visual

// Cuando privacyMode=false: input numérico normal
<input type="number" name={name} defaultValue={valorReal} />
```

**Por qué no simplemente `type="password"`:**
`type="password"` en inputs numéricos no es HTML estándar — algunos browsers
ignoran `min`/`max`/`step`. El patrón hidden + div es más predecible.

**Implicación de UX:** en modo privacidad los campos no son editables (están
enmascarados). Para editar, el usuario desactiva el modo privacidad primero.
Esto es intencional — si estás en modo "hay alguien mirando", no deberías editar.

## Fase 5 — Detalle de Unidad (2026-03-31)

### Server Actions con `.bind()` para pasar el ID

Cuando un Server Action necesita parámetros fijos (como el ID de un proyecto),
se usa `.bind()` antes de pasarlo a `useActionState`:

```tsx
// En el componente
const accion = miServerAction.bind(null, proyectoId)
const [state, formAction] = useActionState(accion, null)
```

El Server Action recibe el ID como primer argumento, antes de `_prev` y `formData`:
```ts
export async function guardarEdicion(
  id: string,           // viene del bind
  _prev: ActionState,   // estado anterior
  formData: FormData    // datos del form
) { ... }
```

### Sub-tabs en formulario con campos siempre en el DOM

Para no perder datos al cambiar de sub-tab (Identificación / Unidad / Pago / Airbnb),
los tabs usan `className={subTab === 'X' ? '' : 'hidden'}` — todos están en el DOM.
Si usaras renderizado condicional (`&&`) los inputs desaparecerían del DOM y no
se incluirían en el `FormData` al hacer submit.

```tsx
<div className={subTab === 'pago' ? '' : 'hidden'}>
  <input name="porcentaje_entrada" ... />
</div>
```

### Supabase Storage — URLs firmadas (signed URLs)

Los archivos en un bucket privado no son accesibles con URL directa. Para mostrarlos,
se genera una URL firmada con TTL (tiempo de vida):

```ts
const { data } = await supabase.storage
  .from('adjuntos-proyectos')
  .createSignedUrl(path, 60 * 60 * 24)  // válida 24 horas
```

Las URLs firmadas se generan en el Server Component al cargar la página — no en el cliente.

### Múltiples archivos con FormData.getAll()

Un `<input type="file" multiple name="archivo">` envía varios archivos con la misma clave.
El Server Action debe iterar con `getAll()`, no `get()`:

```ts
const archivos = formData.getAll('archivo') as File[]
for (const archivo of archivos) { ... }
```

En el cliente, `DataTransfer` permite sincronizar archivos drag & drop con el input nativo:
```ts
const dt = new DataTransfer()
archivos.forEach(f => dt.items.add(f))
fileInputRef.current.files = dt.files
```

### `bodySizeLimit` para Server Actions

Por defecto, el cuerpo de un Server Action está limitado a 1 MB. Para subir archivos:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
}
```

### Claude API — el modelo a veces ignora "no markdown"

Aunque el prompt diga "devuelve solo JSON sin markdown", Claude a veces envuelve
la respuesta en ` ```json ``` `. Hay que limpiar antes de `JSON.parse()`:

```ts
const limpio = texto
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```\s*$/i, '')
  .trim()
const data = JSON.parse(limpio)
```

### Windows env vars anulan .env.local

Next.js carga variables de entorno en este orden (mayor prioridad primero):
1. Variables del proceso (sistema operativo / shell)
2. `.env.local`
3. `.env`

Si existe una variable de sistema (`setx ANTHROPIC_API_KEY=xxx` en Windows), sobrescribe
lo que hay en `.env.local` aunque ese archivo tenga el valor correcto.

Para eliminarla en PowerShell (no `unset` — ese es bash):
```powershell
Remove-Item Env:ANTHROPIC_API_KEY
```

Además: VSCode hereda el entorno del proceso con el que fue abierto. Si la variable
existía cuando se abrió VSCode, los terminales dentro del IDE la heredan aunque la
elimines del sistema operativo. Hay que reiniciar VSCode.

---

## Post-Fase 5 — Mejoras al motor de negocio (2026-04-01)

### Problema con normalización min-max de ROI con pocos proyectos

El motor normaliza `score_roi` entre el mínimo y máximo del conjunto actual:

```ts
score_roi = ((roi - roi_min) / (roi_max - roi_min)) * 100
```

Con 2-3 proyectos, el que tiene menor ROI **siempre** obtiene 0 aunque su ROI sea excelente.
Con Haiku (11.14%) y Lucie (14.25%), Haiku recibía score_roi=0 por tener el ROI más bajo.

**Consecuencia:** Un proyecto sólido parece malo porque el modelo lo compara relativamente,
no contra un estándar de mercado absoluto.

**Pendiente de implementar:** Reemplazar por escala absoluta de mercado:
```ts
score_roi = Math.min(100, Math.max(0, (roi_anual / 16) * 100))
// 8% → 50, 12% → 75, 16%+ → 100
```

### Nuevo criterio de scoring — patrón de extensión

Para agregar un nuevo criterio al motor:
1. **SQL:** `INSERT INTO criterios_scoring` + ajustar `peso` de otros criterios (suma = 1.00)
2. **SQL:** `ALTER TABLE proyectos ADD COLUMN score_X numeric`
3. **Tipos:** agregar a `InputScoring` y `ScoresCalculados`
4. **scoring.ts:** nueva función `scoreX()` + incluir en `calcularScores()` + return
5. **Actions:** pasar nuevos campos en `buildInputScoring()` y `metricasUpdate()`
6. **UI:** agregar a `SCORE_KEY_MAP` en DetalleProyecto.tsx + al tipo `ProyectoDetalle`

### Regla de negocio en el modelo financiero vs penalización de score

Cuando hay una restricción real (ej: "no tengo dinero para amoblar al momento de entrega"),
es mejor modelarla financieramente que penalizar el score artificialmente.

**Mal enfoque:** `amoblado_con_prestamo = true → score -= 15`
- El número de penalización es arbitrario
- No muestra el impacto real en flujo/ROI

**Buen enfoque:** agregar campos `amoblado_financiado`, `tasa_prestamo_amoblado`, `meses_prestamo_amoblado`
- La cuota del préstamo reduce `flujo_con_airbnb` y `cobertura_con_airbnb`
- Los intereses reducen `ganancia_neta` → el ROI baja orgánicamente
- El score refleja números reales, no una penalización manual

### Estado condicional en formularios de Server Actions

Para mostrar/ocultar campos dependiendo de un checkbox, necesitas React state
incluso en un formulario que usa Server Actions:

```tsx
const [amobladoFinanciado, setAmobladoFinanciado] = useState(p.amoblado_financiado)

<input
  type="checkbox"
  name="amoblado_financiado"
  defaultChecked={p.amoblado_financiado}
  onChange={e => setAmobladoFinanciado(e.target.checked)}
/>
{amobladoFinanciado && (
  <input name="tasa_prestamo_amoblado" ... />
)}
```

El `name="amoblado_financiado"` garantiza que el valor llegue al Server Action.
El `onChange` actualiza el estado local para mostrar/ocultar los campos dependientes.

## Cierre de Fase 5 — Corrección sector como combobox en formulario de edición (2026-04-01)

### Inconsistencia entre formulario rápido y formulario de edición

Al implementar el formulario de edición completo en `/proyecto/[id]`, el campo Sector
se dejó como `<input type="text">` libre. Esto creó dos problemas:

1. **Integridad de datos**: el usuario podía escribir "González Suárez" con acento
   distinto al que tiene en `sectores_scoring`, lo que causaba que `score_ubicacion`
   devolviera 0 silenciosamente (lookup fallido en el mapa de scores).
2. **Inconsistencia UX**: el formulario rápido (`/nuevo`) ya tenía combobox dinámico
   desde Fase 3b, pero el formulario completo no.

**Solución**: propagar el mismo patrón de FormularioRapido al formulario de edición.

### Cómo propagar datos de Server Component a un sub-componente de Client Component

El patrón del proyecto es: Server Component fetcha datos → Client Component los recibe como props.
Cuando el Client Component delega a una función interna (`TabEditar`), los datos se pasan
hacia abajo por props, no con un fetch nuevo.

```
page.tsx (Server Component)
  → fetcha sectores_scoring en el mismo Promise.all
  → pasa sectores como prop a <DetalleProyecto>

DetalleProyecto.tsx (Client Component)
  → recibe sectores en Props interface
  → pasa sectores a <TabEditar sectores={sectores} />

TabEditar (función interna del mismo archivo)
  → tiene su propio useState para sectorSelect / sectorNuevo / sectorActivo
  → renderiza el combobox con la misma lógica que FormularioRapido
```

La clave: `page.tsx` ya hacía un `Promise.all` con 4 queries — agregar el quinto
(sectores) no agrega latencia porque corren en paralelo.

### El Server Action también debe actualizarse cuando cambia el formulario

Al reemplazar `<input name="sector">` por `<input type="hidden" name="sector_select">`,
el Server Action `guardarEdicion` dejó de recibir el campo que esperaba. El build
TypeScript no detecta esto porque `formData.get('sector')` devuelve `null` sin error.

**Lección**: cada vez que se cambia el `name` de un campo en un formulario vinculado
a un Server Action, hay que actualizar el action en paralelo. El comportamiento silencioso
(`null` en lugar de error) hace que sea fácil pasarlo por alto.

La corrección: `guardarEdicion` ahora lee `sector_select` y `sector_nuevo` con la
misma lógica de resolución que `guardarProyecto` en `/nuevo/actions.ts`, incluyendo
la creación del sector en `sectores_scoring` si es nuevo (anti-duplicado con `ilike`).

### Hint enriquecido en el combobox de sector (edición)

El hint muestra tanto el rango Airbnb como el `perfil` del sector si existe:

```tsx
{sectorActivo.airbnb_noche_max > 0 ? (
  <p>Airbnb: ${min}–${max}/noche{perfil ? ` · ${perfil}` : ''}</p>
) : (
  <p>Afecta el score de ubicación y los precios Airbnb estimados.</p>
)}
```

El campo `perfil` está en `sectores_scoring` y describe la tipología del sector
(ej: "ejecutivos internacionales", "turistas culturales"). Lo carga el Server
Component junto a los otros campos del sector.

## Fase 6 — Comparador (2026-04-01)

### 1. `searchParams` es una Promise en Next.js 16

En Next.js 14, `searchParams` en un Server Component era un objeto síncrono:

```ts
// Next.js 14 (viejo — NO hagas esto)
export default function Page({ searchParams }: { searchParams: { ids?: string } }) {
  const ids = searchParams.ids  // síncrono, funcionaba
}
```

En Next.js 15+ (y 16), tanto `params` como `searchParams` son `Promise`:

```ts
// Next.js 16 (correcto)
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  const { ids } = await searchParams  // obligatorio hacer await
}
```

Esto es un **breaking change documentado** — el compilador no lo detecta si no
tienes los tipos bien definidos. Siempre hacer `await searchParams` antes de
leer sus propiedades.

### 2. `redirect()` de Next.js lanza una excepción especial

`redirect('/')` de `next/navigation` no es un `return` — lanza una excepción
interna que Next.js captura para hacer la redirección. Por eso **no puede usarse
dentro de un bloque `try/catch`**: el catch capturaría la excepción y la redirección
no ocurriría.

```ts
// MAL — el catch atrapa la "excepción" de redirect y la redirección falla
try {
  redirect('/')
} catch (e) {
  // aquí llega el control inesperadamente
}

// BIEN — redirect fuera del try/catch, o antes de él
if (ids.length < 2) redirect('/')

const { data, error } = await supabase.from(...)
if (error) redirect('/')
```

### 3. El cast `as unknown as T[]` para resultados de Supabase

El cliente de Supabase TypeScript infiere el tipo de retorno a partir del string
que pasas a `.select()`. Cuando ese string es una variable o una constante
construida dinámicamente, TypeScript no puede inferir las columnas correctas y
genera un tipo genérico que no solapa con tu interfaz propia.

La solución estándar en este proyecto es hacer el cast via `unknown`:

```ts
// Sin este cast: error TS2352 "types don't sufficiently overlap"
const proyectos = data as ProyectoComparar[]       // error

// Con cast via unknown: TypeScript acepta la conversión
const proyectos = data as unknown as ProyectoComparar[]  // ok
```

Esto es seguro porque el campo `select()` ya garantiza qué columnas devuelve;
solo le estamos diciendo a TypeScript que confíe en nosotros.

### 4. Botón flotante `position: fixed` en tablas con `overflow-x-auto`

Si pones un botón dentro de un contenedor con `overflow: hidden` (como la tabla
con scroll horizontal), el botón queda recortado cuando el usuario hace scroll.
La solución es sacar el botón **fuera del contenedor** de la tabla y usar `fixed`:

```tsx
{/* DENTRO del div con overflow-x-auto — INCORRECTO, queda tapado */}
<div className="overflow-x-auto">
  <table>...</table>
  <button className="fixed bottom-6 right-6">Comparar</button>  {/* MAL */}
</div>

{/* FUERA del contenedor — CORRECTO */}
<div className="overflow-x-auto">
  <table>...</table>
</div>
{seleccionados.size >= 2 && (
  <div className="fixed bottom-6 right-6 z-50">  {/* BIEN */}
    <button>Comparar ({seleccionados.size})</button>
  </div>
)}
```

`z-50` asegura que el botón quede sobre otros elementos (navbar, cards).

### 5. Resaltado del "ganador" por fila — dirección importa

Para resaltar la mejor celda de cada fila hay que saber si "mayor es mejor"
o "menor es mejor" según la métrica:

| Métrica | Dirección | Motivo |
|---|---|---|
| ROI anual, cobertura, flujo, ingreso, ganancia, score | Mayor = mejor | Más rentabilidad es mejor |
| Precio total, cuota mensual, aporte propio, precio/m² | Menor = mejor | Menor gasto de bolsillo |

La función `idxGanador(valores, mayor)` calcula esto y devuelve -1 si todos
los valores son iguales (no resaltar en ese caso).

### 6. `onClick` en `<tr>` vs checkbox dentro de la celda

Cuando el `<tr>` tiene un `onClick` para toggle de selección y dentro hay un
`<input type="checkbox">` también con un handler, se produce doble disparo.

La solución: `e.stopPropagation()` en el `onClick` de la celda que contiene
el checkbox, para que el click en el checkbox no suba al `<tr>`:

```tsx
<td onClick={e => e.stopPropagation()}>
  <input type="checkbox" onChange={() => onToggle(p.id)} ... />
</td>
```

Lo mismo aplica al botón "Ver →" dentro de la misma fila.

## Cierre Fase 6 — UX global (2026-04-01)

### 7. Llamar un Server Action desde un Client Component con `useTransition`

Server Actions (`'use server'`) pueden importarse y llamarse directamente desde
Client Components (`'use client'`). El truco es usar `useTransition` para tener
estado "pending" sin bloquear la UI, y `router.refresh()` para que el Server
Component recargue los datos tras completar:

```tsx
// Client Component
import { recalcularRanking } from '@/app/(app)/configuracion/actions'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

const [isPending, startTransition] = useTransition()
const router = useRouter()

function handleClick() {
  startTransition(async () => {
    const res = await recalcularRanking(null, new FormData())
    if (res?.ok) router.refresh()  // invalida caché del Server Component
  })
}
```

`useTransition` marca `isPending=true` durante el async — útil para spinners/disabled.
`router.refresh()` re-fetcha los datos del Server Component sin recargar la página.

### 8. Modo claro con CSS filter (sin tocar componentes)

Para implementar light mode en una app 100% dark sin modificar todos los componentes:

```css
/* globals.css */
html.light {
  filter: invert(1) hue-rotate(180deg);
}
/* Re-invertir imágenes para que no queden con colores extraños */
html.light img, html.light video {
  filter: invert(1) hue-rotate(180deg);
}
```

`invert(1)` convierte negro→blanco y viceversa. `hue-rotate(180deg)` corrige
el desplazamiento de color que produce el invert (ej: azul no queda naranja).
El resultado es una paleta clara que mantiene la legibilidad.

Toggle desde un Client Component:
```tsx
document.documentElement.classList.add('light')    // activar
document.documentElement.classList.remove('light') // desactivar
localStorage.setItem('theme', 'light')             // persistir
```

Para leer la preferencia al montar (antes de primer render no se puede — estamos
en SSR y `localStorage` no existe en el servidor):
```tsx
useEffect(() => {
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.add('light')
  }
}, [])  // [] = solo al montar en el cliente
```

### 9. Tailwind v4 y especificidad CSS — usar inline style para garantizar aplicación

**Síntoma:** El botón de modo claro no tenía efecto aunque la clase `light` se añadía
correctamente a `<html>`. El CSS `html.light { filter: ... }` en `globals.css` existía
pero el browser no lo aplicaba.

**Causa probable:** Tailwind v4 (que usa `@import "tailwindcss"`) puede procesar el CSS
de manera que las reglas en `globals.css` no sobrescriben las reglas `filter` que pueda
tener el elemento raíz, o la especificidad queda por debajo de algún reset.

**Fix:** Aplicar el filtro directamente como `style` inline via JS — los inline styles
tienen la mayor especificidad posible (superan cualquier regla CSS):

```ts
function applyLightMode(on: boolean) {
  if (on) {
    document.documentElement.style.setProperty('filter', 'invert(1) hue-rotate(180deg)')
    document.documentElement.classList.add('light')    // para re-invertir imágenes via CSS
  } else {
    document.documentElement.style.removeProperty('filter')
    document.documentElement.classList.remove('light')
  }
}
```

La clase `light` sigue añadiéndose porque la re-inversión de imágenes
(`html.light img { filter: invert(1) hue-rotate(180deg) }`) sí funciona via CSS —
solo el `filter` del elemento raíz necesita el enfoque inline.

**Regla:** cuando un CSS aplicado a `<html>` no surte efecto en Tailwind v4,
usar `element.style.setProperty()` como alternativa segura.

## Fase 7 — Mapa de Proyectos (2026-04-01)

### Leaflet no puede ejecutarse en el servidor (SSR)

Leaflet accede a `window` y `document` al importarse. En Next.js, los Server
Components y el pre-render de Client Components ocurren en Node.js, donde esas
APIs no existen. Si importas Leaflet directamente, el build falla con
`window is not defined`.

**Solución:** `dynamic()` con `ssr: false` — Next.js omite ese módulo durante
el render de servidor y solo lo carga en el browser:

```ts
// En el Client Component que necesita el mapa
const MapaProyectos = dynamic(() => import('@/components/MapaProyectos'), {
  ssr: false,
  loading: () => <div>Cargando mapa...</div>,
})
```

El componente `MapaProyectos.tsx` en sí mismo sigue siendo un Client Component
(`'use client'`) — `dynamic` solo controla *cuándo* se carga.

### CircleMarker en lugar de Marker (el bug clásico de Leaflet + Webpack)

El `Marker` por defecto de Leaflet usa archivos `.png` para los iconos
(`marker-icon.png`, `marker-shadow.png`). Webpack no puede resolver esas URLs
automáticamente y los pines aparecen como íconos rotos.

**Fix más simple:** usar `CircleMarker` en su lugar. Es un SVG puro generado
por Leaflet — sin archivos externos. Además permite controlar el color con
`pathOptions`, que es exactamente lo que necesitamos para el semáforo de score:

```tsx
<CircleMarker
  center={[lat, lng]}
  radius={11}
  pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}
>
  <Popup>...</Popup>
</CircleMarker>
```

### Tailwind no aplica bien dentro de popups de Leaflet

Los popups de Leaflet se insertan en un portal DOM separado. Las clases de
Tailwind pueden no funcionar correctamente ahí porque el CSS global sí se
aplica, pero en la práctica los estilos de `@layer utilities` a veces no llegan.

**Solución pragmática:** usar `style={{}}` inline para los elementos dentro del
popup. Así el estilo viaja con el componente, independiente de dónde Leaflet
lo monte en el DOM.

### El CSS de Leaflet debe importarse en el componente

```ts
import 'leaflet/dist/leaflet.css'
```

Esto va al principio del componente cargado dinámicamente (`MapaProyectos.tsx`).
Next.js lo procesa y lo incluye en el bundle del cliente.

### MapContainer necesita `height` explícito

Leaflet necesita que el contenedor tenga altura definida para renderizar el
mapa. Tailwind `h-[500px]` funciona, pero `style={{ height: 500 }}` es más
seguro para garantizar que el valor llegue antes de que Leaflet calcule el
tamaño del mapa:

```tsx
<MapContainer style={{ height: 500, borderRadius: 12 }} ...>
```

### Bug: tiles de OpenStreetMap bloqueados por la CSP

Los tiles del mapa (imágenes del callejero) se pedían a `*.tile.openstreetmap.org`
pero la CSP de Fase 1 solo tenía en lista blanca `*.supabase.co`. El browser
bloqueaba silenciosamente las peticiones y el mapa aparecía gris.

**Fix en `next.config.ts`:**
```ts
// img-src: añadir el dominio de tiles
"img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
// connect-src: ídem para las peticiones HTTP fetch de los tiles
"connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org",
```

**Regla:** al agregar cualquier recurso externo (fuente, imagen, API), buscar primero
en `next.config.ts` si la CSP lo bloquearía. Los fallos de CSP no lanzan errores
en consola evidentes — solo "net::ERR_BLOCKED_BY_CSP" en la pestaña Network.

### Coordenadas del centro del mapa

El centro inicial `[-0.12, -78.48]` apuntaba demasiado al norte (sector Cotocollao),
dejando los pins fuera del encuadre inicial. El centro correcto para la zona de
mayor concentración de proyectos es **Parque La Carolina**:

```ts
const center: [number, number] = [-0.183, -78.487]  // Parque La Carolina
```

zoom 14 (nivel barrio) en lugar de 13.

**Regla:** verificar visualmente el mapa al arrancar — los pins deben aparecer
sin necesidad de desplazar el mapa.

### Archivos modificados / creados

- `src/components/MapaProyectos.tsx` — componente mapa (nuevo); centro → La Carolina, zoom 14
- `src/app/(app)/RankingDashboard.tsx` — dynamic import + estado `vista` + toggle Lista|Mapa
- `src/app/(app)/page.tsx` — `latitud`, `longitud` añadidos a CAMPOS_SELECT
- `next.config.ts` — CSP ampliada con `*.tile.openstreetmap.org` en img-src y connect-src
- `package.json` — `react-leaflet`, `leaflet`, `@types/leaflet`

---

## Cierre MVP — Limpieza y consolidación (2026-04-01)

### Schema SQL consolidado

Todos los SQL de todas las fases se unificaron en `supabase/schema_completo.sql`.
El archivo está ordenado para ejecutarse de cero en un Supabase limpio:

1. `configuracion` (incluye columnas de seguridad)
2. `criterios_scoring` + seed 8 criterios definitivos
3. `proyectos` (incluye campos de Fase 5: préstamo amoblado, score_equipamiento)
4. `adjuntos` + Storage bucket
5. `sectores_scoring` + 29 sectores
6. `webauthn_credentials`

Los archivos individuales (`fase1.sql`, `fase_seguridad.sql`, etc.) se conservan
como historial de qué cambió en cada fase.

### Archivos basura eliminados

En el commit de Fase 6 quedaron archivos con nombres que eran fragmentos de texto
(probablemente del prompt de esa sesión). Se eliminaron 8 archivos de la raíz.

---

## Fase 8 — Fixes Móvil (2026-04-01)

### Hover no existe en pantallas táctiles

`opacity-0 group-hover:opacity-100` es un patrón útil en desktop para revelar
acciones al pasar el mouse. En móvil, ese elemento nunca es visible porque no
hay evento `hover` en touch. La solución estándar en Tailwind es usar prefijos
responsivos para que el comportamiento sea distinto por breakpoint:

```tsx
// Antes: invisible en móvil
className="opacity-0 group-hover:opacity-100"

// Después: visible siempre en móvil, hover-only en desktop (md+)
className="md:opacity-0 md:group-hover:opacity-100"
```

También se puede agregar estilos solo en móvil con el patrón inverso:
`bg-zinc-700 md:bg-transparent` — fondo gris en móvil, transparente en desktop.

### viewport meta tag en Next.js

Next.js inyecta automáticamente `<meta name="viewport" content="width=device-width, initial-scale=1">`.
Sin embargo, si el contenido de la página desborda el ancho del viewport (por ejemplo,
un `flex` sin `flex-wrap` que es más ancho que la pantalla), el navegador móvil
puede reducir el zoom automáticamente para que todo quepa — lo cual hace todo pequeño.

La doble solución:
1. **CSS:** `flex-wrap` en contenedores que pueden desbordar en pantallas pequeñas.
2. **Explícito:** Declarar `export const viewport = { width: 'device-width', initialScale: 1 }`
   en `app/layout.tsx` para asegurarse de que Next.js siempre lo incluya.

```ts
// app/layout.tsx
export const viewport = {
  width: 'device-width',
  initialScale: 1,
}
```

### Exportar componentes de un archivo que ya exporta otros

`Nav.tsx` tenía varios botones ya exportados (`PrivacyButton`, `RecalcularButton`,
`ThemeButton`). Para agregar el nuevo `LogoutButton` al header móvil sin duplicar
el Server Action, simplemente se crea el componente en el mismo archivo y se exporta:

```ts
// Nav.tsx — agregar al final del grupo de exports
export { LogoutButton }
```

```ts
// layout.tsx — importar junto a los demás
import { Nav, PrivacyButton, RecalcularButton, ThemeButton, LogoutButton } from '@/components/Nav'
```

El patrón "un archivo de componentes de nav que exporta varios botones" es común
en apps Next.js — evita crear un archivo por cada botón pequeño.

### accent-color en checkboxes

La propiedad CSS `accent-color` (que Tailwind expone como `accent-{color}`) controla
el color del checkbox nativo del sistema operativo cuando está marcado.

- `accent-zinc-300` (gris claro): difícil de ver en modo oscuro, invisible en modo claro (filter invert).
- `accent-indigo-500` (azul-violeta): contraste bueno en fondo oscuro y sobrevive el `filter: invert(1) hue-rotate(180deg)` del modo claro de esta app.

```tsx
// Antes
className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-zinc-300"

// Después
className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500"
```

### Grid responsive para listas de ítems

Cambiar una lista vertical (`space-y-2`) a cuadrícula responsive es un cambio de
una línea que mejora mucho la densidad de información en pantallas grandes:

```tsx
// Antes: lista vertical
<ul className="space-y-2">

// Después: cuadrícula 1→2→3 columnas según pantalla
<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
```

Los ítems del grid deben ser compactos: texto con `truncate` o `line-clamp-1`,
tamaños de fuente reducidos (`text-xs` → `text-[11px]`), padding reducido.
**Causa probable:** output de un comando copiado como nombre de archivo en el shell.

---

## Nice-to-haves complejos (2026-04-01)

### Reglas de Hooks de React en componentes con listas

`useActionState` (y todos los hooks) deben llamarse siempre en el **nivel raíz** de
un componente — nunca dentro de un `.map()`, un `if`, o un loop. Esto es una regla
fundamental de React.

Cuando necesitas un formulario con Server Action por cada ítem de una lista (ej: un
toggle por cada criterio de scoring), la solución es extraer un componente separado:

```tsx
// ❌ Incorrecto — hook dentro del map
criterios.map(c => {
  const [state, action] = useActionState(toggleCriterio, null)  // viola Reglas de Hooks
  return <button key={c.id} ...>
})

// ✅ Correcto — cada criterio tiene su propio componente
function ToggleActivoForm({ criterio }) {
  const [, action] = useActionState(toggleCriterio, null)  // hook en nivel raíz ✓
  return <form action={action}>...</form>
}

// En el render:
criterios.map(c => <ToggleActivoForm key={c.id} criterio={c} />)
```

Cada componente tiene su propio "slot" de hook — React los identifica por orden de
llamada, no por identidad. Extraer componentes es la forma idiomática de usar hooks
con colecciones.

### Exportar PDF sin librerías — `window.print()` + Tailwind `print:`

El navegador ya tiene un motor de impresión que puede "imprimir a PDF". No hace falta
jsPDF ni html2canvas para casos simples.

Flujo:
1. Botón llama `window.print()`
2. El navegador abre el diálogo de impresión
3. El usuario elige "Guardar como PDF" como destino

Control de layout en impresión con Tailwind:
```tsx
// Ocultar en impresión
<div className="print:hidden">...</div>

// Ajustar márgenes
<div className="md:ml-56 print:ml-0">...</div>

// En layout.tsx: quitar el sidebar
<div className="print:hidden">
  <Nav ... />
</div>
```

`print:` es un variante de Tailwind que aplica clases solo cuando `@media print` está activo.

### Historial inmutable con detección de cambio en el servidor

Para auditoría (precio_historial), el patrón correcto en Next.js es:

1. Antes del UPDATE, leer el valor actual
2. Si cambió, INSERT en la tabla de historial
3. El historial es solo INSERT — nunca se borra ni actualiza

```typescript
// Leer precio actual
const { data: actual } = await supabase.from('proyectos').select('precio_base').eq('id', id).single()

// UPDATE normal
await supabase.from('proyectos').update({ precio_base: nuevoPrecio }).eq('id', id)

// Log solo si cambió
if (actual && actual.precio_base !== nuevoPrecio) {
  await supabase.from('precio_historial').insert({
    proyecto_id: id,
    precio_base: nuevoPrecio,
    precio_anterior: actual.precio_base,
  })
}
```

### Sub-criterios sin nueva tabla — columnas en tabla existente

Cuando los sub-criterios son un desglose fijo del score principal (no dinámico),
agregar columnas a la tabla existente es más simple que crear una tabla separada:

```sql
alter table sectores_scoring
  add column if not exists sc_renta     integer not null default 0,
  add column if not exists sc_seguridad integer not null default 0,
  ...
```

Ventajas vs tabla separada:
- Sin JOINs extra
- Una sola fila = toda la info del sector
- El fallback (sub=0 → usar score_base) es trivial en el servidor:

```typescript
const subTotal = (s.sc_renta ?? 0) + (s.sc_seguridad ?? 0) + ...
scores_sectores[s.nombre] = subTotal > 0 ? subTotal : s.score_base
```

La nueva tabla tiene sentido si los sub-criterios fueran dinámicos (creados por el
usuario). Para una estructura fija de 5 dimensiones, las columnas son la opción correcta.

---

## Cierre de sesión — verificación de completitud (2026-04-02)

### Por qué revisar la sesión anterior antes de cerrar

Al retomar trabajo entre sesiones, es normal que código quede incompleto:
la IA genera archivos en orden, y si la sesión se corta (contexto lleno, tiempo,
redirección) algunos archivos pueden estar a medias.

**Checklist mínimo al cerrar cualquier sesión:**

```bash
# 1. TypeScript — detecta errores de tipo sin compilar
npx tsc --noEmit

# 2. Build completo — lo que TypeScript no ve
npm run build

# 3. Grep de las claves nuevas — verifica que el código llegó a todos los callers
grep -r "nueva_funcion\|nueva_tabla" src/
```

En este caso, el SQL `nice_to_have.sql` estaba creado pero los 4 archivos de código
que debían usar las nuevas columnas (`SectoresForm.tsx`, `sectores/actions.ts`,
`sectores/page.tsx`, `leerContextoScoring`) no habían sido modificados todavía.

El build pasó verde de todas formas (las columnas eran opcionalmente seleccionadas),
pero la feature no funcionaba. El grep fue el indicador definitivo.

### Columnas nullable vs columnas con DEFAULT en SQL

Cuando se añaden columnas a una tabla existente con `ALTER TABLE ... ADD COLUMN`,
usar `NOT NULL DEFAULT 0` es seguro porque PostgreSQL rellenará automáticamente
las filas existentes con 0. Sin default, habría que hacer un UPDATE manual primero.

```sql
-- ✅ Seguro en tabla existente con datos
alter table sectores_scoring
  add column if not exists sc_renta integer not null default 0;

-- ❌ Fallaría en tabla con datos existentes
alter table sectores_scoring
  add column if not exists sc_renta integer not null;
-- ERROR: column "sc_renta" of relation contains null values
```

`IF NOT EXISTS` hace el script idempotente — se puede ejecutar dos veces sin error,
útil para migraciones aplicadas manualmente en Supabase.

---

## Fase 9.1 — Nuevas amenidades (2026-04-11)

### Amenidades "conocidas" vs "extras" en el scoring

El motor de scoring (`scoring.ts`) distingue dos tipos de amenidades:

1. **Conocidas**: tienen puntuación explícita (ej: spa/piscina +15, gym +8, bbq +6).
   Se listan en un `Set` llamado `conocidas` para no contarlas doble.
2. **Extras**: cualquier amenidad que no esté en el set `conocidas` suma +2 pts c/u
   (máx 10 pts = 5 extras).

Al agregar una amenidad nueva, decidir si merece puntuación propia o si se queda
como "extra" genérico:
- **Premium/social** (club_house, skybar): +6 pts → agregar al bloque explícito Y al set `conocidas`
- **Comodidad estándar** (media_room, grill_house, comfort_lounge): dejar como extras (+2 c/u)

Si no se agrega al set `conocidas`, la amenidad se cuenta como extra Y se podría
contar doble si coincide con una regla explícita. Siempre mantener sincronizados
ambos lugares.

---

## Fase 9.2 — Valores iguales en verde en comparador (2026-04-11)

### Cambiar tipo de retorno de helper de ganador: `number` → `Set<number>`

El comparador usaba `idxGanador()` que retornaba un solo índice (`number`).
Cuando dos valores eran iguales y ambos eran el mejor, retornaba `-1` (nadie gana)
porque la condición `numericos.every(v => v === referencia)` descartaba empates.

**Fix:** Cambiar a `idxGanadores()` que retorna `Set<number>`. Ahora si 2 de 3
proyectos tienen el mismo mejor valor, ambos se pintan verde.

**Impacto en cascada:** Al cambiar el tipo de retorno del helper, hay que actualizar
todos los consumidores — componentes `Fila` y `FilaScore` (prop `ganador: number` →
`ganadores: Set<number>`), y todas las filas manuales que usaban `g === idx` →
`g.has(idx)`. El refactor es mecánico pero toca ~20 puntos del archivo.

**Lección:** Cuando un helper retorna un tipo diferente (`number` → `Set`), primero
cambiar el helper, después hacer find-and-replace de la prop en los componentes
genéricos, y finalmente actualizar las filas manuales (inline JSX). Verificar con
grep que no quede ninguna referencia al nombre viejo.

---

## Fase 9.3 — Endeudamiento amoblado en comparador (2026-04-11)

### Calcular valores derivados en cliente vs persistir en DB

Cuando un dato calculado no se persiste en la tabla (como `cuota_prestamo_amoblado`),
hay dos opciones para mostrarlo en el comparador:

1. **Traer campos base + recalcular en cliente** — consistente con el patrón existente
   (`aportePreEntrega` se calcula como `monto_entrada + monto_durante`).
2. **Agregar columna calculada a la DB** — requiere SQL migration, más mantenimiento.

Para el comparador se eligió la opción 1: traer `amoblado_financiado`, `costo_amoblado`,
`tasa_prestamo_amoblado`, `meses_prestamo_amoblado` y calcular la cuota PMT en el
componente. La fórmula PMT es idéntica a la de `calculos.ts` — duplicación mínima
aceptable para evitar un cambio de schema.

### Filas condicionales en el comparador

Usar `{condicion && (<tr>...</tr>)}` para ocultar filas irrelevantes. La fila
"Cuota amoblado" solo aparece si al menos un proyecto tiene `amoblado_financiado=true`
y una cuota calculable. Esto evita mostrar filas vacías ("—" en todas las columnas).

---

## Fase 9.4 — Seguro hipotecario mensual (2026-04-11)

### Agregar un costo fijo al modelo financiero (flujo completo)

Agregar un campo que se suma a la obligación mensual requiere tocar toda la cadena:

1. **SQL migration** — columna en `configuracion` (default global) y `proyectos` (override)
2. **Tipos** — `InputCalculos` (input: campo + default) y `MetricasCalculadas` (output: valor efectivo)
3. **calculos.ts** — resolver null → default, sumar a `obligacion_mensual`, afecta flujo/cobertura
4. **Tests** — agregar al `BASE` y `CONFIG_DEFAULTS`, tests específicos del nuevo campo
5. **UI config** — campo en `ConfiguracionForm.tsx`, update en `configuracion/actions.ts`
6. **UI detalle** — campo en `DetalleProyecto.tsx` (editar + resumen), update en `proyecto/actions.ts`
7. **UI nuevo** — agregar al `InputCalculos` en `nuevo/actions.ts` (null = usa default)
8. **Comparador** — campo en tipo, query, y fila en tabla
9. **CLAUDE.md** — schema + fórmulas

El patrón es idéntico al de `alicuota_mensual` o `costo_amoblado`: `null` en el
proyecto → usa default de config. Este patrón se repite para todo campo financiero
configurable.

### Placeholders con config en componentes que no reciben config

`TabResumen` no recibe `config` como prop (solo `TabEditar` lo necesita para los
placeholders del formulario). Para mostrar el valor del seguro en Resumen cuando es
null, se usa un fallback textual `"usa config (default)"` en vez de acceder a
`config.seguro_mensual_default`. Alternativa: pasar config a TabResumen — pero viola
el principio de mínimo prop-drilling del proyecto.

---

## Fase 9.5 — Descuento en vivo (2026-04-11)

### Aplicar transformaciones al inicio del pipeline de cálculo

Un descuento sobre el precio base debe aplicarse **antes** de cualquier cálculo
porque `precio_base` es la raíz de la cascada: precio_total, precio_m2, montos de
pago, cuota bancaria, plusvalía, ROI — todo depende de él.

En `calculos.ts`, el descuento se resuelve en el paso 0 (antes de todo):
```ts
const precio_base_efectivo = descuento_valor > 0
  ? (descuento_tipo === 'porcentaje'
      ? precio_base * (1 - descuento_valor / 100)
      : precio_base - descuento_valor)
  : precio_base
```

Luego se reemplaza `p.precio_base` por `precio_base_efectivo` en las 3 líneas donde
se usaba: `precio_total`, `precio_m2`, y `plusvalia_acumulada`.

El `precio_base` original se preserva en DB (nunca se sobreescribe) y se muestra en
la UI de Resumen. Esto permite ver el precio original y el descuento lado a lado.

### Campos con default `0` vs `null`

`descuento_valor` usa default 0 (no null) porque la ausencia de descuento es un valor
definido (0), no un "no sé". A diferencia de `seguro_mensual` donde null = "usar el
default de config", aquí 0 = "sin descuento" y no existe un default global.
La distinción importa para el patrón de resolución en `calculos.ts`.

---

## Fase 9.7 — Walk Score subjetivo (2026-04-11)

### Bonus en un score existente vs nuevo criterio de scoring

Para el walk score se eligió **bonus en `score_ubicacion`** en vez de crear un
9º criterio de scoring. Razones:

1. **Evita tocar pesos**: un nuevo criterio requiere redistribuir los 8 pesos
   existentes (y que el usuario los re-configure). Un bonus es transparente.
2. **Coherencia conceptual**: la walkability ES parte de la ubicación — es la
   granularidad dentro del sector, no un eje independiente.
3. **Proporcionalidad**: +3 pts por nivel (max +15) permite diferenciar dentro
   del mismo sector sin dominar el score total. El sector aporta 0-95 base,
   el walkability fino-ajusta.

El patrón es el mismo que piso (+5/+10) y orientación (+5): bonus aditivos
en `scoreUbicacion()` con `Math.min(100, score)` como techo.

### Campos subjetivos: null vs 0

`walkability` usa `null` (no 0) como default porque "no evaluado" es distinto
de "score 0" (aislado). En la fórmula: `if (p.walkability !== null && p.walkability > 0)`.
Esto evita que proyectos recién ingresados pierdan puntos antes de ser evaluados.

---

## Fase 9 Paso A — Auditoría de realismo en análisis IA individual (2026-04-11)

### Enriquecer prompts de IA con datos de la DB en vez de hardcodear tablas

El prompt original tenía una tabla hardcoded de referencia de mercado por sector.
El nuevo prompt elimina esa tabla y en su lugar recibe `benchmark_sector` como parte
de los datos del proyecto — un objeto con los valores reales de `sectores_scoring`
(airbnb_min/max, plusvalía_estimada, perfil, score_base).

**Ventaja:** Si el usuario edita los benchmarks de un sector en `/configuracion/sectores`,
el análisis IA los usa automáticamente. Con la tabla hardcoded, había que actualizar
el prompt cada vez que cambiaban los datos.

### Priorización de ubicación: coordenadas > dirección > sector

El prompt recibe los tres niveles de ubicación disponibles. Claude usa el más
específico para contextualizar la auditoría:
- lat/lng: "estas coordenadas están cerca de [landmark]"
- dirección: "esta calle está en zona comercial/residencial"
- sector: fallback genérico

Esto no es magia — Claude razona sobre su conocimiento de Quito, no consulta
APIs externas. Pero aporta más contexto que solo el nombre del sector.

### Agregar campos al output de un prompt existente

Al agregar `auditoria` al JSON de respuesta, se necesita actualizar:
1. El prompt (instrucciones + JSON de ejemplo)
2. El tipo TypeScript del `analisis` parsed
3. El UPDATE a Supabase (nueva columna)
4. El tipo `ProyectoDetalle` en el componente
5. La UI que muestra el campo

Todo en la misma función `analizarConIA`. No hay API route separada — es un
Server Action que llama directo a la API de Anthropic.

---

## Fase 9.6 — Análisis IA comparativo (2026-04-11)

### Server Actions con bind para pasar parámetros extra

`useActionState` espera un action con firma `(prevState, formData)`. Para pasar
los IDs de los proyectos, se usa `.bind(null, ids)` que fija el primer argumento:

```ts
const analizarConIds = analizarComparacion.bind(null, ids)
const [state, action, pending] = useActionState(analizarConIds, null)
```

La firma real del Server Action es `(ids: string[], prev, formData)`. El bind
convierte esto en `(prev, formData)` que es lo que useActionState espera.

### Análisis IA sin persistencia vs con persistencia

El análisis individual se persiste en DB (`fortaleza_ia`, `riesgo_ia`, etc.)
porque es específico de una unidad y se quiere ver sin regenerar.

El análisis comparativo NO se persiste porque:
1. Los datos de los proyectos pueden cambiar entre análisis
2. La combinación de proyectos comparados varía (A vs B, A vs C, etc.)
3. No tiene sentido guardar un análisis que compara datos obsoletos

Se retorna directamente en el `ActionState` y se muestra en el componente.
Si el usuario recarga la página, se pierde — debe presionar el botón de nuevo.

### Tipo de respuesta del Server Action como vehículo de datos

En vez de guardar en DB y releer, el Server Action retorna los datos directamente:
```ts
return { ok: true, analisis: { auditoria, comparacion, veredicto } }
```
El componente lee `iaState.analisis` para renderizar. Esto es válido para datos
transitorios que no necesitan persistencia.
