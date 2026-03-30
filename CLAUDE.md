@AGENTS.md

# Airbnb Quito — Comparador de Proyectos Inmobiliarios

## Contexto del Proyecto

Web app **personal y privada** para comparar y rankear proyectos inmobiliarios en el
norte de Quito, Ecuador, con foco en inversión para alquiler de corta estadía (Airbnb).

**Objetivo:** Ingresar proyectos rápidamente (voz, manual o adjuntos) y obtener un
ranking automático con análisis de rentabilidad, para tomar decisiones de inversión.

**Usuario:** Una sola persona (propietario). La app es privada — requiere autenticación.

**Contexto de aprendizaje:** El desarrollador está aprendiendo Next.js con este proyecto.
El código debe ser claro, bien estructurado y con comentarios en decisiones no obvias.

---

## Stack Tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | Next.js 14 + TypeScript + Tailwind | Rápido, desplegable en Vercel gratis |
| Base de datos | Supabase (PostgreSQL) | Gratis, Realtime, Auth + RLS + Storage incluidos |
| Auth | Supabase Auth (email + password) | Auth real dentro del stack, sin dependencias extra |
| Archivos | Supabase Storage | PDFs, imágenes, renders — sube el usuario manualmente |
| IA | Claude API (claude-sonnet-4-20250514) | SOLO análisis narrativo final por proyecto |
| Audio | MediaRecorder API (browser nativo) | Grabación sin dependencias |
| Deploy | Vercel | CI/CD automático desde GitHub |

---

## Principio Fundamental de Arquitectura

> **Todo cálculo = TypeScript puro. IA = solo el análisis narrativo final.**

- ROI, flujo mensual, cuota, scores, proyecciones, semáforos → TypeScript
- Recálculo masivo al cambiar pesos o config global → Server Action → SQL/TS → sin IA
- IA se invoca **únicamente** cuando el usuario presiona "Analizar con IA" en un proyecto
- Esto mantiene los costos de API bajos y la app rápida

---

## Seguridad

La app contiene información financiera personal sensible:

1. **Supabase Auth** — login con email + contraseña. Sin registro público (single-user).
2. **Row Level Security (RLS)** en **todas** las tablas — datos inaccesibles sin sesión.
3. **Middleware de Next.js** (`middleware.ts`) — redirige a `/login` sin sesión válida.
4. **Server Actions / Route Handlers** — ninguna API key se expone al cliente.
5. `.env.local` **nunca** se commitea.
6. **`SUPABASE_SERVICE_ROLE_KEY`** solo se usa en servidor — nunca llega al cliente.
7. **Security headers** en `next.config.js` — CSP, HSTS, X-Frame-Options (protege contra XSS y clickjacking).
8. **No guardar datos sensibles en localStorage** — solo estado de UI (preferencias visuales).

### Seguridad avanzada (Fase de Seguridad — implementar antes de tener datos reales)

Ver checklist completo en **Fase de Seguridad** del MVP checklist.

---

## Estructura del Proyecto

```
airbnb-quito-ranker/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                  # Layout protegido
│   │   ├── page.tsx                    # Dashboard / ranking
│   │   ├── nuevo/page.tsx              # Ingreso de proyecto (form + voz)
│   │   ├── proyecto/[id]/page.tsx      # Detalle + análisis IA + adjuntos
│   │   ├── comparar/page.tsx           # Comparador lado a lado (2-3 proyectos)
│   │   └── configuracion/
│   │       ├── page.tsx                # Config global (sueldo, banco, tasa)
│   │       ├── scoring/page.tsx        # Pesos del scoring (editables)
│   │       └── seguridad/page.tsx      # 2FA, timeout de sesión, PIN
│   └── api/
│       ├── transcribir/route.ts        # Audio → Claude → JSON
│       ├── analizar-foto/route.ts      # Imagen → Claude Vision → JSON (misma estructura que voz)
│       ├── analizar/route.ts           # Proyecto → Claude → análisis narrativo
│       └── recalcular/route.ts         # Recalcular scores de todos los proyectos
├── components/
│   ├── RankingTable.tsx
│   ├── ProyectoCard.tsx
│   ├── FormularioProyecto.tsx
│   ├── CalculadoraPago.tsx             # Modal/panel por unidad: cronograma de pagos editable
│   ├── GrabadorVoz.tsx
│   ├── ScoreBar.tsx
│   ├── SemaforoROI.tsx
│   ├── MetricasFinancieras.tsx
│   ├── AdjuntosPanel.tsx               # Upload y listado de archivos
│   ├── ComparadorTabla.tsx
│   ├── CamaraCaptura.tsx               # Captura foto → envía a /api/analizar-foto
│   ├── TotpChallenge.tsx               # Pantalla de código TOTP post-login
│   ├── InactivityLock.tsx              # Overlay de bloqueo por inactividad
│   └── MontoPrivado.tsx                # Renderiza número o •••• según privacyMode
├── lib/
│   ├── calculos.ts                     # Todas las fórmulas financieras
│   ├── scoring.ts                      # Motor de ranking (lee pesos de DB)
│   ├── recalcular.ts                   # Recálculo masivo de todos los proyectos
│   ├── claude.ts                       # Integración Claude API
│   └── supabase.ts                     # Clientes Supabase (browser + server)
├── middleware.ts
├── types/
│   └── proyecto.ts
├── CLAUDE.md
└── .env.local
```

---

## Modelo de Datos — Supabase

### Tabla `configuracion` (1 sola fila — valores globales)

```sql
create table configuracion (
  id                      integer primary key default 1,
  sueldo_neto             numeric default 1400,
  porcentaje_ahorro       numeric default 40,    -- % sueldo disponible para cuota
  porcentaje_gastos_airbnb numeric default 30,   -- gastos operativos Airbnb (si no hay gestora incluida)
  banco_default           text    default 'BIESS',
  tasa_default            numeric default 6.0,   -- % anual
  anos_credito_default    integer default 6,
  anos_proyeccion         integer default 5,
  costo_amoblado_default  numeric default 6000,  -- inversión estimada para amueblar el depto antes de operar

  -- Estructura de pago por defecto (aplica a todos los proyectos salvo override)
  reserva_default                         numeric default 2000,  -- monto fijo de separación
  porcentaje_entrada_default              numeric default 10,    -- % del precio total
  porcentaje_durante_construccion_default numeric default 20,    -- % pagado en cuotas durante obra
  num_cuotas_construccion_default         integer  default 30,   -- cuotas mensuales durante construcción
  porcentaje_contra_entrega_default       numeric default 70,    -- % que financia el banco
  -- Validación: entrada + durante_construccion + contra_entrega siempre = 100%

  updated_at              timestamptz default now()
);

alter table configuracion enable row level security;
create policy "solo autenticado" on configuracion using (auth.role() = 'authenticated');
```

---

### Tabla `criterios_scoring` (pesos editables por el usuario)

```sql
create table criterios_scoring (
  id          uuid primary key default gen_random_uuid(),
  clave       text unique not null,  -- 'roi' | 'ubicacion' | 'constructora' | etc.
  nombre      text not null,         -- label visible en UI
  descripcion text,
  peso        numeric not null,      -- 0.00 a 1.00 (suma total debe ser 1.00)
  activo      boolean default true,
  orden       integer,               -- orden de visualización
  updated_at  timestamptz default now()
);

alter table criterios_scoring enable row level security;
create policy "solo autenticado" on criterios_scoring using (auth.role() = 'authenticated');

-- Valores iniciales
insert into criterios_scoring (clave, nombre, descripcion, peso, orden) values
  ('roi',          'Rentabilidad (ROI)',       'ROI anual proyectado',                        0.30, 1),
  ('ubicacion',    'Ubicación',                'Sector, piso y orientación',                  0.20, 2),
  ('constructora', 'Constructora',             'Fiabilidad, experiencia y track record',       0.15, 3),
  ('entrega',      'Entrega',                  'Fecha y meses de espera',                     0.15, 4),
  ('precio_m2',    'Precio por m²',            'vs promedio del sector',                      0.10, 5),
  ('calidad',      'Calidad',                  'Materiales y amenidades del edificio',        0.07, 6),
  ('confianza',    'Factor confianza',         'Sensación subjetiva del proyecto/vendedor',   0.03, 7);
```

> **Importante:** Cuando el usuario edite los pesos, el sistema valida que sumen 1.00
> y dispara el recálculo masivo de `score_total` para todos los proyectos.

---

### Tabla `proyectos`

```sql
create table proyectos (
  id uuid primary key default gen_random_uuid(),

  -- Estado y seguimiento
  estado          text default 'en_análisis',
  -- valores: 'en_análisis' | 'visitado' | 'cotización_recibida' |
  --          'en_negociación' | 'descartado' | 'elegido'
  fecha_cotizacion date,   -- cuándo se recibió el precio (las cotizaciones vencen)

  -- Identificación
  nombre          text not null,
  constructora    text,
  anos_constructora    integer,           -- años de experiencia de la constructora
  proyectos_entregados integer,           -- nro de proyectos terminados
  fiabilidad_constructora text,
  -- valores: 'desconocida' | 'conocida_sin_retrasos' |
  --          'conocida_con_retrasos' | 'reputada'
  contacto_nombre  text,                  -- nombre del vendedor o contacto principal
  contacto_telefono text,                 -- teléfono/WhatsApp del contacto

  -- Ubicación
  direccion       text,                   -- ej: "Telégrafo y Últimas Noticias"
  sector          text not null,          -- ver enum abajo
  latitud         numeric,
  longitud        numeric,

  -- Unidad
  tipo            text,
  -- valores: 'estudio' | 'minisuite' | 'suite' | '1 dormitorio' | '2 dormitorios'
  area_interna_m2 numeric not null,      -- área habitable real (sin balcón) — usar para precio/m²
  area_balcon_m2  numeric default 0,     -- área de balcón/terraza (separada)
  area_total_m2   numeric,               -- calculado: area_interna_m2 + area_balcon_m2
  dormitorios     integer default 1,
  numero_banos    numeric default 1,     -- permite 1.5 (baño completo + medio baño)
  piso            integer,               -- piso de la unidad
  pisos_totales   integer,               -- total de pisos del edificio
  unidades_totales_edificio integer,     -- total unidades residenciales (menos = más exclusivo)
  orientacion     text,                  -- 'norte' | 'sur' | 'este' | 'oeste'
  materiales      text,
  -- valores: 'básico' | 'estándar' | 'premium' | 'lujo'
  tipo_cocina     text,                  -- 'americana' | 'independiente'
  tiene_balcon    boolean default false,
  tiene_parqueadero boolean default false,
  costo_parqueadero numeric default 0,
  tiene_bodega    boolean default false,
  tiene_zona_lavanderia boolean default false,  -- zona de máquinas dentro de la unidad
  tiene_puerta_seguridad boolean default false,
  amenidades      text[],                -- amenidades del edificio: ['spa', 'gimnasio', 'bbq', ...]
  unidades_disponibles integer,          -- unidades de este tipo aún disponibles para venta (NULL = desconocido)
  preferencia         text,              -- 'primera_opcion' | 'alternativa' | null (sin clasificar)
  -- una fila = un (proyecto + tipo de unidad) a evaluar; si un proyecto tiene estudios y suites
  -- se crean dos filas. preferencia permite filtrar el ranking a "solo mi apuesta real"
  reconocimientos_constructora text,     -- ej: "Mención al Ornato Quito 2021"

  -- Factor subjetivo
  confianza_subjetiva integer,           -- 1 a 5
  confianza_notas text,                  -- por qué: "el arquitecto mostró planos reales"

  -- Precio
  precio_base     numeric not null,      -- precio dpto sin parqueadero

  -- Estructura de pago (monto y porcentaje son bidireccionales; suma entrada+durante+contra = 100%)
  -- si son null, toman los defaults de configuracion
  reserva                         numeric,   -- monto fijo de separación (null = usa reserva_default)
  porcentaje_entrada              numeric,   -- % del precio_total (null = usa porcentaje_entrada_default)
  monto_entrada                   numeric,   -- calculado: precio_total * porcentaje_entrada / 100
  porcentaje_durante_construccion numeric,   -- % en cuotas durante obra (null = usa default)
  monto_durante_construccion      numeric,   -- calculado: precio_total * porcentaje_durante / 100
  num_cuotas_construccion         integer,   -- cuántas cuotas mensuales (null = usa default)
  porcentaje_contra_entrega       numeric,   -- % que financia el banco (null = usa default)
  monto_contra_entrega            numeric,   -- = monto_financiar; calculado: precio_total * pct_contra / 100

  -- Financiamiento bancario (si null, toma defaults de configuracion)
  banco           text,
  tasa_anual      numeric,
  anos_credito    integer,
  -- Calculados de financiamiento:
  precio_total          numeric,         -- precio_base + costo_parqueadero
  monto_financiar       numeric,         -- = monto_contra_entrega (lo que financia el banco)
  cuota_mensual         numeric,
  total_intereses       numeric,
  total_pagado_credito  numeric,

  -- Amoblamiento
  viene_amoblado        boolean default false,   -- si true, costo_amoblado = 0
  costo_amoblado        numeric,                 -- si null, toma costo_amoblado_default de configuracion

  -- Airbnb: gestión y restricciones
  permite_airbnb        boolean default true,    -- si false → alerta roja automática (reglamento lo prohíbe)
  tiene_administracion_airbnb_incluida boolean default false,
  porcentaje_gestion_airbnb numeric,             -- si null y tiene_administracion=true, pedir al vendedor
  -- nota: si tiene_administracion_airbnb_incluida=true, este % reemplaza porcentaje_gastos_airbnb de config

  -- Costos fijos mensuales del edificio
  alicuota_mensual      numeric default 0,       -- cuota de mantenimiento mensual (sale del flujo siempre)

  -- Estado de construcción
  avance_obra_porcentaje numeric default 0,      -- 0=planos, 100=entregado. Afecta score de riesgo.

  -- Ingresos Airbnb
  precio_noche_estimado numeric,
  ocupacion_estimada    numeric default 70,

  -- Timeline
  fecha_entrega         text,
  meses_espera          integer,         -- meses desde hoy hasta entrega

  -- Apreciación
  plusvalia_anual       numeric default 5,

  -- Métricas calculadas (actualizadas automáticamente al guardar)
  precio_m2                 numeric,    -- precio_base / area_interna_m2 (NO incluye balcón)
  ingreso_bruto_mensual     numeric,
  gastos_operativos         numeric,
  ingreso_neto_mensual      numeric,
  sueldo_disponible         numeric,     -- snapshot de config al momento del cálculo
  flujo_sin_airbnb          numeric,
  flujo_con_airbnb          numeric,
  cobertura_sin_airbnb      numeric,
  cobertura_con_airbnb      numeric,
  meses_productivos         integer,
  airbnb_acumulado          numeric,
  plusvalia_acumulada        numeric,
  ganancia_bruta            numeric,
  ganancia_neta             numeric,
  roi_anual                 numeric,
  roi_aporte_propio         numeric,

  -- Scores de ranking (0-100 cada uno, calculados con pesos de criterios_scoring)
  score_roi           numeric,
  score_ubicacion     numeric,
  score_constructora  numeric,
  score_entrega       numeric,
  score_precio_m2     numeric,
  score_calidad       numeric,
  score_confianza     numeric,
  score_total         numeric,           -- suma ponderada según criterios_scoring

  -- Análisis IA (solo se llena cuando el usuario lo solicita explícitamente)
  analisis_ia_generado boolean default false,
  fortaleza_ia    text,
  riesgo_ia       text,
  recomendacion_ia text,
  alerta_ia       text,
  que_preguntar   text[],
  datos_faltantes text[],

  notas           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table proyectos enable row level security;
create policy "solo autenticado" on proyectos using (auth.role() = 'authenticated');
```

**Enum de sectores** (score de ubicación base para Airbnb):
```
Quicentro           95  (Rep. Salvador / Naciones Unidas — prime, máxima demanda)
González Suárez     90  (ejecutivos, turistas internacionales)
La Coruña           88  (zona alta, segura, vistas)
Benalcázar          87  (Austria e Irlanda — barrio consolidado, cerca La Carolina)
Quito Tenis         85  (residencial premium)
Granda Centeno      82  (Granda Centeno y M. Andrade — bien conectado, creciendo)
Bellavista          80  (seguro, consolidado)
Iñaquito            78  (Telégrafo y Últimas Noticias — cerca CC Iñaquito)
El Batán            76
La Pradera          74  (La Pradera y San Salvador — residencial tranquilo)
La Floresta         74  (bohemio, turistas culturales)
Guangüiltagua       70
Otro                60
```

---

### Tabla `adjuntos`

```sql
create table adjuntos (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  tipo        text not null,
  -- valores: 'brochure_pdf' | 'plano_pdf' | 'foto' | 'render' | 'link_video' | 'otro'
  nombre      text not null,             -- nombre visible
  storage_path text,                     -- path en Supabase Storage (si es archivo)
  url_externa  text,                     -- si es un link externo
  descripcion  text,
  created_at  timestamptz default now()
);

alter table adjuntos enable row level security;
create policy "solo autenticado" on adjuntos using (auth.role() = 'authenticated');

-- Bucket en Supabase Storage: 'adjuntos-proyectos' (privado)
```

---

## Fórmulas de Rentabilidad

```typescript
// lib/calculos.ts — todo cálculo es TypeScript puro, sin IA

// 1. Precio y área
area_total_m2   = area_interna_m2 + area_balcon_m2
precio_total    = precio_base + costo_parqueadero
precio_m2       = precio_base / area_interna_m2   // SIEMPRE sobre área interna, nunca total

// 1a. Estructura de pago (con fallback a defaults de configuracion)
reserva_efectiva = reserva ?? reserva_default
pct_entrada      = porcentaje_entrada ?? porcentaje_entrada_default                         // default 10
pct_durante      = porcentaje_durante_construccion ?? porcentaje_durante_construccion_default // default 20
pct_contra       = porcentaje_contra_entrega ?? porcentaje_contra_entrega_default           // default 70
num_cuotas       = num_cuotas_construccion ?? num_cuotas_construccion_default               // default 30
// Validación: pct_entrada + pct_durante + pct_contra === 100 (siempre, o error de formulario)
// Casos especiales (sin cambio de schema):
//   reserva = 0 (explícito) → entrada pagada en un solo monto, sin separata previa
//   null → usa reserva_default ($2,000)
// pct_durante = 0 / num_cuotas = 0 → proyecto ya entregado o sin fase de construcción

monto_entrada_total      = precio_total * pct_entrada / 100
monto_durante_total      = precio_total * pct_durante / 100
monto_financiar          = precio_total * pct_contra / 100     // lo que financia el banco (o paga directo si tasa=0)
pago_entrada_neto        = monto_entrada_total - reserva_efectiva // pagas esto al firmar (reserva ya abonada)
cuota_construccion       = num_cuotas > 0 ? monto_durante_total / num_cuotas : 0

// Financiamiento directo sin intereses (ej: Legacy): tasa_anual = 0
// PMT con tasa=0 → cuota_mensual = monto_financiar / (anos_credito * 12)
// Cuando banco = null y tasa = 0 → no hay cuota mensual bancaria post-entrega

// UI — Calculadora de pagos: bidireccional
// si se edita porcentaje → monto = precio_total * pct / 100
// si se edita monto     → porcentaje = monto / precio_total * 100
// siempre re-validar que pct_entrada + pct_durante + pct_contra === 100

// 1b. Amoblamiento
costo_amoblado_efectivo = viene_amoblado ? 0 : (costo_amoblado ?? costo_amoblado_default)

// 2. Cuota mensual bancaria (fórmula PMT estándar, sobre la contra entrega)
tasa_mensual  = tasa_anual / 100 / 12
meses_credito = anos_credito * 12
cuota_mensual = monto_financiar * tasa_mensual / (1 - (1 + tasa_mensual)^(-meses_credito))
total_pagado_credito = cuota_mensual * meses_credito
total_intereses      = total_pagado_credito - monto_financiar

// 3. Ingresos Airbnb
// si tiene_administracion_airbnb_incluida=true, usar porcentaje_gestion_airbnb del proyecto
// si no, usar porcentaje_gastos_airbnb de configuracion
pct_gastos_efectivo   = tiene_administracion_airbnb_incluida
                          ? (porcentaje_gestion_airbnb ?? porcentaje_gastos_airbnb)
                          : porcentaje_gastos_airbnb
ingreso_bruto_mensual = precio_noche_estimado * 30 * (ocupacion_estimada / 100)
gastos_operativos     = ingreso_bruto_mensual * (pct_gastos_efectivo / 100)
ingreso_neto_mensual  = ingreso_bruto_mensual - gastos_operativos

// 4. Flujo mensual (alicuota se descuenta siempre, independiente de Airbnb)
sueldo_disponible    = sueldo_neto * (porcentaje_ahorro / 100)
flujo_sin_airbnb     = sueldo_disponible - cuota_mensual - alicuota_mensual
flujo_con_airbnb     = sueldo_disponible + ingreso_neto_mensual - cuota_mensual - alicuota_mensual
cobertura_sin_airbnb = (sueldo_disponible / (cuota_mensual + alicuota_mensual)) * 100
cobertura_con_airbnb = ((sueldo_disponible + ingreso_neto_mensual) / (cuota_mensual + alicuota_mensual)) * 100

// 5. Proyección a N años
meses_productivos    = (anos_proyeccion * 12) - meses_espera
airbnb_acumulado     = ingreso_neto_mensual * meses_productivos
plusvalia_acumulada  = precio_base * ((1 + plusvalia_anual/100)^anos_proyeccion - 1)
ganancia_bruta       = plusvalia_acumulada + airbnb_acumulado
ganancia_neta        = ganancia_bruta - total_intereses

// 6. ROI
// aporte_propio = todo el dinero propio antes de operar (sin doble contar la reserva)
// monto_entrada_total ya incluye la reserva (reserva se abona a la entrada)
aporte_propio_total = monto_entrada_total + monto_durante_total + costo_amoblado_efectivo
roi_anual           = ((ganancia_neta / precio_total) / anos_proyeccion) * 100
roi_aporte_propio   = (ganancia_neta / aporte_propio_total) * 100

// Semáforo ROI anual:     Verde >= 8% | Amarillo 5-8% | Rojo < 5%
// Semáforo cobertura c/A: Verde >= 120% | Amarillo 100-120% | Rojo < 100%
// ALERTA ROJA AUTOMÁTICA: permite_airbnb = false → proyecto inviable para Airbnb
```

---

## Motor de Scoring

```typescript
// lib/scoring.ts — lee pesos dinámicamente de criterios_scoring en DB

// Los scores individuales (0-100) se calculan así:
score_roi          → normalizado entre el min y max ROI del conjunto de proyectos
score_ubicacion    → score base del sector
                     + bonus piso alto (piso >= 8: +5pts, piso >= 12: +10pts)
                     + bonus orientación (norte/este: +5pts)
score_constructora → fiabilidad: reputada=80 | conocida_sin_retrasos=60 |
                                  desconocida=40 | conocida_con_retrasos=20
                     + bonus años (>20 años: +10pts, >10 años: +5pts)
                     + bonus proyectos entregados (>10: +5pts)
                     + bonus reconocimientos (+5pts si tiene)
score_entrega      → inverso de meses_espera (0 meses=100, 48+ meses=0)
score_precio_m2    → inverso normalizado sobre area_interna_m2 (NO el área total con balcón)
score_calidad      → materiales (lujo=40, premium=30, estándar=20, básico=10)
                     + bonus amenidades premium (spa/piscina: +15, gimnasio: +8,
                       coworking: +7, bbq/rooftop: +6, jacuzzi: +5, sauna/turco: +5,
                       otros: +2 c/u)
                     + bonus unidad (balcón: +5, cocina americana: +3,
                       1.5+ baños: +5, zona lavandería: +3, puerta seguridad: +2)
                     + bonus viene_amoblado: +8pts (listo para operar inmediatamente)
                     + bonus tiene_administracion_airbnb_incluida: +5pts
                     + penalización edificio grande (>60 unidades: -5pts)
                     + penalización avance_obra_porcentaje < 30%: -5pts (riesgo alto)
score_confianza    → confianza_subjetiva * 20  (1→20, 2→40 ... 5→100)

// REGLA ESPECIAL: permite_airbnb = false → score_total = 0 y alerta roja inamovible
// No tiene sentido rankear un proyecto que no permite Airbnb.

// BADGE DE ESCASEZ (no afecta score, es solo señal de urgencia en UI):
// unidades_disponibles <= 3  → badge rojo    "¡Últimas!"
// unidades_disponibles <= 10 → badge naranja "Pocas"
// unidades_disponibles > 10  → sin badge
// unidades_disponibles = null → "?" (dato pendiente — recordatorio visual)
//
// BADGE DE PREFERENCIA (visible en ranking, permite filtro):
// preferencia = 'primera_opcion' → ★ (estrella) junto al nombre
// preferencia = 'alternativa'    → texto gris, sin estrella
// preferencia = null             → sin distinción
// Dashboard toggle: "Solo primera opción" filtra filas donde preferencia = 'primera_opcion'

// Score total
score_total = Σ (score_criterio * peso_criterio)
// donde los pesos vienen de la tabla criterios_scoring
```

### Recálculo — dos niveles

**Por unidad** (flujo cotidiano):
- Automático al guardar cualquier cambio en una unidad
- Botón manual "Recalcular esta unidad" en la vista de detalle
- Solo afecta esa fila

**Masivo** (solo cuando cambia config global o pesos de scoring):
- Botón "Recalcular todo el ranking" en `/configuracion`
- Server Action lee todas las unidades + config actual + pesos actuales
- Recalcula métricas financieras + scores para cada unidad en batch
- Upsert masivo a Supabase
- Supabase Realtime actualiza el ranking en pantalla automáticamente

> Nota de terminología: la tabla se llama `proyectos` internamente, pero cada fila
> representa **una unidad a evaluar** (ej: "Legacy · Suite", "Legacy · Estudio").
> En la UI se usan los términos "unidad" o el nombre+tipo para evitar confusión.

---

## Integración con Claude API

### Prompt 1: Transcripción de Nota de Voz

```typescript
// app/api/transcribir/route.ts

const SYSTEM_PROMPT_VOZ = `
Eres un asistente experto en inversión inmobiliaria en Quito, Ecuador.
El usuario grabó una nota de voz en una feria de vivienda.

Devuelve ÚNICAMENTE un JSON válido sin markdown con estos campos:
{
  "nombre": "", "constructora": "", "direccion": "", "sector": "",
  "tipo": "", "area_m2": 0, "dormitorios": 1, "piso": null,
  "tiene_parqueadero": false, "costo_parqueadero": 0, "tiene_bodega": false,
  "precio_base": 0, "reserva": 0, "entrada": 0,
  "banco": "", "tasa_anual": 0, "anos_credito": 0,
  "precio_noche_estimado": 0, "ocupacion_estimada": 70,
  "fecha_entrega": "", "meses_espera": 0, "plusvalia_anual": 5,
  "amenidades": [], "forma_pago": "", "notas": "",
  "unidades_disponibles": null,
  "preferencia": null,
  "datos_faltantes": [],
  "que_preguntar": ["...", "..."],
  "alerta": ""
}

Sectores válidos: Quicentro | González Suárez | La Coruña | Quito Tenis |
Granda Centeno | Bellavista | Iñaquito | El Batán | La Floresta | Guangüiltagua | Otro
`;
```

### Prompt 2: Extracción desde Foto (Claude Vision)

```typescript
// app/api/analizar-foto/route.ts
// Recibe imagen base64, devuelve el mismo JSON que la transcripción de voz
// + campo extra confianza_baja[] para resaltar campos dudosos en el formulario

const SYSTEM_PROMPT_FOTO = `
Eres un asistente experto en inversión inmobiliaria en Quito, Ecuador.
El usuario tomó una foto de una cotización, brochure o tabla de precios.

Extrae toda la información visible y devuelve ÚNICAMENTE un JSON válido sin markdown
con exactamente los mismos campos que el prompt de voz, más este campo adicional:
  "confianza_baja": ["campo1", "campo2"]  -- campos que no pudiste leer con claridad
                                             (texto borroso, manuscrito ilegible, dato ambiguo)

Si un campo no aparece en la imagen, usa null (números) o "" (texto).
No inventes datos que no estén visibles.

Sectores válidos: Quicentro | González Suárez | La Coruña | Quito Tenis |
Granda Centeno | Bellavista | Iñaquito | El Batán | La Floresta | Guangüiltagua | Otro
`;
// Nota: el frontend resalta en amarillo los campos listados en confianza_baja[]
// para que el usuario los verifique antes de guardar.
```

### Prompt 3: Análisis Narrativo por Proyecto

```typescript
// app/api/analizar/route.ts
// Se llama SOLO cuando el usuario presiona "Analizar con IA"

const SYSTEM_PROMPT_ANALISIS = `
Eres un experto en inversión inmobiliaria en Quito, Ecuador, especializado en
rentabilidad Airbnb para el sector norte de la ciudad.

Se te proporcionan todas las métricas ya calculadas de un proyecto.
Genera en español:
1. fortaleza: La fortaleza clave para uso Airbnb (1 oración)
2. riesgo: El riesgo principal (1 oración)
3. recomendacion: Recomendación de inversión (1-2 oraciones)
4. alerta: Alerta crítica si aplica (vacío si no hay)

Alertar si: ROI < 5% | cobertura con Airbnb < 100% | meses_espera > 24 |
precio/m² muy sobre promedio | constructora con retrasos | datos críticos faltantes

Devuelve ÚNICAMENTE JSON válido sin markdown.
`;
```

---

## Referencias de Mercado — Quito Norte (estimados 2025)

| Sector | Dirección referencia | Precio noche est. | Ocupación est. | Precio m² ref. |
|---|---|---|---|---|
| Quicentro | Rep. Salvador y Naciones Unidas | $70-90 | 75-85% | $2.200-2.800/m² |
| González Suárez | Av. González Suárez | $70-90 | 70-80% | $2.200-2.800/m² |
| La Coruña | Sector La Coruña | $60-80 | 65-75% | $1.900-2.400/m² |
| Quito Tenis | Av. de los Shyris | $55-75 | 65-75% | $1.800-2.200/m² |
| Granda Centeno | Granda Centeno y M. Andrade | $50-70 | 60-72% | $1.700-2.100/m² |
| Bellavista | Sector Bellavista | $50-70 | 60-70% | $1.700-2.100/m² |
| Iñaquito | Telégrafo y Últimas Noticias (-0.1738, -78.4811) | $45-65 | 58-70% | $1.600-2.000/m² |
| El Batán | Sector El Batán | $45-65 | 58-68% | $1.600-2.000/m² |
| La Floresta | Sector La Floresta | $40-60 | 55-65% | $1.500-1.900/m² |

---

## Variables de Entorno — `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...     # solo server-side, nunca al cliente

ANTHROPIC_API_KEY=sk-ant-xxx...         # solo Server Actions / Route Handlers

NEXT_PUBLIC_APP_NAME="Airbnb Quito Ranker"
```

> `.env.local` nunca se commitea. Las mismas variables se ingresan manualmente
> en el dashboard de Vercel antes del primer deploy.

---

## Deploy — Vercel

### Setup inicial (una sola vez)

1. **Repositorio GitHub** — sube el proyecto: `git init → git push`
2. **Cuenta Vercel** — registrarse en vercel.com con la cuenta de GitHub
3. **Conectar repo** — "Add New Project" → seleccionar el repositorio → Vercel detecta Next.js automáticamente
4. **Variables de entorno** — en el dashboard de Vercel, antes del primer deploy, ingresar las 5 variables de `.env.local`
5. **Deploy** — presionar "Deploy". En 2-3 minutos la app está publicada en `https://airbnb-quito-ranker.vercel.app`

### Flujo cotidiano

```
editar código → git add . → git commit -m "..." → git push
→ Vercel detecta el push → redespliega automáticamente en ~1 min
→ la URL sigue siendo la misma
```

### Acceso desde celular

La URL de Vercel funciona directo en el navegador del celular. No requiere instalar nada.
Para acceso rápido: agregar la URL a la pantalla de inicio del celular (PWA-like).

### Costos

- **Vercel Free** — suficiente para uso personal. Sin límite de deploys ni de tiempo.
- Solo pagarías ($20/mes Pro) si necesitaras dominio personalizado con configuración avanzada
  o múltiples usuarios — no aplica para esta app.

### Requisitos en la máquina de desarrollo

- Node.js 18+ (para correr `npm run dev` localmente)
- Git
- El CLI de Vercel (`npm i -g vercel`) es opcional — todo se puede hacer desde la web

---

## Perfil de Inversión

- **Presupuesto:** $80.000 – $130.000 USD
- **Tipologías:** Estudios, suites, minisuites, 1 dormitorio
- **Zonas:** Norte de Quito
- **Financiamiento preferido:** BIESS, 6% anual, 6 años (configurable por proyecto)
- **Huésped objetivo:** Ejecutivos, turistas internacionales

## Proyectos Actuales (datos reales a ingresar en Fase 3)

Los 3 proyectos concretos que el usuario ya tiene cotizados y serán los primeros en cargarse:

- **Magnus** — proyecto en análisis
- **Aventino** — proyecto en análisis
- **Haiku** — proyecto en análisis
- **Oziel** — Grupo Baluarte, Rumipamba y Av. Amazonas (junto al Parque La Carolina), 20 pisos, estudios desde 25m² y suites desde 40m²
- **Imperia Celestia** — Imperia Construcciones Sostenibles, El Batán (Fernando Ayarza / José Bosmediano), 6 pisos + PB, mini suites desde 34m², tiene gestión Airbnb incluida
- **Omega Living** — Jauregui & Gaibor Constructores, La Pradera y San Salvador (sector La Pradera), estudios 26m², suites 1 dorm 45-55m², deptos 2 dorm 85m²
- **Legacy** — PROINCARSA, Av. El Vengador y El Zurriago (sector Quicentro / La Carolina), ~15 pisos, estudios desde $57,000, suites desde $112,000, deptos 2 dorm (m² no publicados en brochure), entrega dic 2027. Forma de pago: 30% inicial + 40% durante construcción + 30% contra entrega, **financiamiento directo sin intereses** (sin banco → tasa_anual=0, cuota_mensual=0). Amenidades premium: Infinity Pool, Spa, BBQ, Fire Pit, Gym + Crossfit Circuit, Yoga, Bar, Play Room (billar/gaming), Entertainment Zone, Coworking, Pet Zone.

---

## Reglas del Asistente (para Claude Code)

1. **TypeScript siempre** — nunca JavaScript plano
2. **Componentes funcionales** con hooks de React
3. **Tailwind para estilos** — no CSS separado
4. **Server Actions / Route Handlers** para todo lo que toque APIs o datos sensibles
5. **Supabase Realtime** para el ranking en vivo
6. **Diseño en español** — labels, mensajes y textos en español
7. **Mobile-first** — se usa desde el celular en ferias
8. **Modo oscuro** por defecto
9. **Sin librerías pesadas** innecesarias
10. **Comentarios cortos** en decisiones no obvias (el dev está aprendiendo Next.js)
11. **Validar sesión en el servidor** en toda operación de lectura/escritura
12. **Cálculos = TypeScript puro** — nunca delegar matemáticas a la IA

---

## Checklist MVP

### Fase 1 — Base y Auth
- [ ] Supabase: tablas, RLS, Auth, Storage bucket
- [ ] Seed de `criterios_scoring` con los 7 criterios
- [ ] Seed de `configuracion` con valores default
- [ ] Middleware de Next.js (protección de rutas)
- [ ] Pantalla de login (email + contraseña)
- [ ] Security headers en `next.config.js` (CSP, HSTS, X-Frame-Options)

### Fase de Seguridad — implementar tras Fase 2, antes de cargar datos reales

> Prioridad alta: esta app tiene información financiera personal. Implementar antes de usarla en producción.

#### 2FA — TOTP (Google Authenticator / Authy)
- [ ] Habilitar MFA/TOTP en Supabase Auth (desde el dashboard de Supabase)
- [ ] Flujo post-login: si el usuario tiene 2FA activado, mostrar pantalla de código TOTP
- [ ] En `/configuracion/seguridad`: botón "Activar autenticación de dos factores"
      → genera QR para escanear con la app autenticadora → pide código de confirmación → activa
- [ ] Botón "Desactivar 2FA" con confirmación por contraseña
- [ ] Componente `TotpChallenge.tsx` — campo de 6 dígitos con auto-submit al completar

#### Timeout de sesión e inactivity lock
- [ ] En `configuracion` (tabla DB): añadir campos:
  ```sql
  session_timeout_minutes  integer default 60,    -- expiración JWT: 15|30|60|240|nunca
  inactivity_lock_minutes  integer default 15,    -- bloqueo por inactividad: 5|15|30|nunca
  pin_habilitado           boolean default false,
  pin_hash                 text,                  -- bcrypt del PIN de 4 dígitos
  ```
- [ ] Hook `useInactivityLock` — detecta inactividad (mousemove/keydown/touchstart),
      tras N minutos muestra pantalla de bloqueo sin cerrar sesión
- [ ] Pantalla de bloqueo: si `pin_habilitado` → pide PIN de 4 dígitos; si no → pide contraseña
- [ ] En `/configuracion/seguridad`: slider de timeout + configuración de PIN
- [ ] PIN de 4 dígitos: se guarda como hash (bcrypt) en `configuracion`, nunca en plano

#### Modo privacidad
- [ ] Botón de ojo 👁 en el header global (siempre visible)
- [ ] Estado `privacyMode: boolean` en React context (localStorage para persistir entre páginas)
- [ ] Cuando activo: todos los montos y porcentajes se muestran como `••••` en toda la app
      (precio_base, cuota_mensual, roi_anual, scores numéricos — nombres de proyectos visibles)
- [ ] Componente `<MontoPrivado value={x} />` — renderiza el número o `••••` según contexto
- [ ] Atajo rápido: mantener presionado el botón 1 segundo activa/desactiva (para móvil)

### Fase 2 — Configuración Global
- [ ] Pantalla `/configuracion` — sueldo, banco, tasa, años, % proyección
- [ ] Pantalla `/configuracion/scoring` — editar pesos, validar que sumen 100%
- [ ] Botón "Recalcular todo el ranking" (solo necesario tras cambiar config o pesos)

### Fase 3 — Ingreso de Proyectos

#### Principio de ingreso rápido
El formulario tiene **dos modos** para no perder oportunidades en ferias:

**Modo rápido** ("Guardar ya") — solo estos campos obligatorios:
`nombre`, `sector`, `tipo`, `precio_base`, `area_interna_m2`, `meses_espera`, `unidades_disponibles`, `preferencia`
→ Con eso ya hay ranking, score parcial, badge de escasez, badge de preferencia y métricas básicas.

**Modo completo** — todos los campos del modelo, se accede desde el detalle del proyecto.
Los campos vacíos se muestran como "pendiente" en el detalle, no bloquean el guardado.

Los tres métodos de ingreso rápido se muestran como tabs en `/nuevo`:
**[ 📷 Foto ] [ 🎤 Voz ] [ ✏️ Manual ]**

- [ ] **Ingreso por foto** (`CamaraCaptura.tsx` + `/api/analizar-foto`): tomar foto de cotización,
      brochure o tabla de precios → Claude Vision extrae JSON → pre-llena formulario para revisión.
      - Captura con `<input type="file" accept="image/*" capture="environment">` (sin librerías, funciona en todo móvil)
      - Claude devuelve campo `confianza_baja: string[]` con los campos que no pudo leer bien → se resaltan en amarillo
      - Si ya existe una unidad con nombre similar → alerta "¿Es el mismo proyecto X ya registrado?"
      - **Nunca auto-guarda** — siempre revisión obligatoria antes de confirmar
      - Funciona con: cotizaciones impresas, pantallas, tablas de precios. Menos confiable con manuscritos o fotos borrosas.

- [ ] **Ingreso por voz** (`GrabadorVoz.tsx` + `/api/transcribir`): grabar nota de voz en feria →
      Claude extrae JSON → prellenar formulario → usuario revisa y guarda (modo rápido por defecto).
      Es la vía más rápida: hablar 30 segundos captura los 8 campos mínimos.

- [ ] Formulario manual modo rápido (8 campos, 1 pantalla, botón "Guardar ya")
- [ ] Formulario manual modo completo con todos los campos del modelo
- [ ] Campos de financiamiento con defaults de configuración
- [ ] **Calculadora de pagos** (`CalculadoraPago.tsx`): modal por proyecto que muestra el cronograma completo
      (Reserva → Entrada neta → N cuotas construcción → Contra entrega → Cuota banco mensual).
      Pre-llena desde los datos del proyecto. Permite editar cualquier campo manualmente
      (porcentaje ↔ monto bidireccional, validando que sumen 100%). Botón "Aplicar" guarda en proyecto.
      Casos especiales a manejar en UI: si `reserva=0` ocultar fila Reserva; si `pct_durante=0`
      ocultar fila cuotas construcción; si `tasa_anual=0` mostrar "Sin interés" en lugar de cuota bancaria.
- [ ] Cálculo automático de todas las métricas al guardar
- [ ] Cálculo automático de todos los scores al guardar

#### Tests unitarios (Vitest) — escribir junto con las librerías
> Solo `lib/calculos.ts` y `lib/scoring.ts`. Sin tests de UI ni de Server Actions.
> Las funciones son puras (input → number), los valores esperados se verifican a mano.

```
lib/__tests__/calculos.test.ts
  ✓ precio_m2 usa area_interna_m2, nunca area_total_m2
  ✓ reserva=null → reserva_efectiva = reserva_default ($2,000)
  ✓ reserva=0 → pago_entrada_neto = monto_entrada_total (sin descuento)
  ✓ tasa_anual=0 → cuota_mensual = monto_financiar / (anos_credito × 12)
  ✓ pct_durante=0 → cuota_construccion = 0
  ✓ pct_entrada + pct_durante + pct_contra = 100 (validación)
  ✓ viene_amoblado=true → costo_amoblado_efectivo = 0
  ✓ aporte_propio_total no cuenta la reserva dos veces

lib/__tests__/scoring.test.ts
  ✓ permite_airbnb=false → score_total = 0 (regla absoluta)
  ✓ score_total = suma ponderada correcta con pesos de ejemplo
  ✓ score_constructora: reputada=80, con_retrasos=20
  ✓ score_entrega: 0 meses=100, 48+ meses=0
  ✓ score_confianza: confianza_subjetiva × 20
```

- [ ] Instalar Vitest (`npm install -D vitest`)
- [ ] `vitest.config.ts` — configuración mínima para TypeScript puro (sin DOM)
- [ ] Implementar los 13 tests listados arriba
- [ ] `npm run test` pasa en verde antes de avanzar a Fase 4

### Fase 4 — Dashboard y Ranking

**Panel resumen** (encabezado del dashboard, 3 tarjetas):
- [ ] "Mejor score" → nombre+tipo + score_total + ROI de la unidad líder
- [ ] "Mejor ROI" → puede ser distinta unidad (nombre+tipo + roi_anual)
- [ ] "Urgencia" → unidad con unidades_disponibles más bajas (si hay ≤10), con badge rojo/naranja

**Tabla de ranking:**
- [ ] Filas ordenadas por score_total descendente
- [ ] Score visual (ScoreBar) + semáforos ROI y cobertura por fila
- [ ] Badge de escasez por fila (≤3 rojo, ≤10 naranja, null = "?")
- [ ] Badge de preferencia por fila (★ primera opción, gris alternativa)

**Filtros y vistas:**
- [ ] Toggle "Solo primera opción" — filtra a `preferencia = 'primera_opcion'`
- [ ] Toggle "Mejor de cada proyecto" — agrupa por nombre del proyecto, muestra solo la unidad de mayor score_total por grupo; pasa de ver N unidades a ver N proyectos
- [ ] Filtro por tipo (`estudio / suite / minisuite / 1 dorm / 2 dorm`)
- [ ] Filtro por sector
- [ ] Filtro "Top N" (mostrar solo los 5 o 10 mejores)
- [ ] Filtro por estado (activos / descartados / todos)

### Fase 5 — Detalle de Unidad
- [ ] Vista completa de métricas financieras de esta unidad
- [ ] Desglose de scoring por criterio (barra por cada uno de los 7)
- [ ] Botón "Recalcular esta unidad" → recalcula métricas y scores solo de esta fila
- [ ] Panel de adjuntos (upload + listado)
- [ ] Botón "Analizar con IA" → genera análisis narrativo (fortaleza, riesgo, recomendación)
- [ ] Sección "Qué preguntar al vendedor" (generado por IA o desde `datos_faltantes`)

### Fase 6 — Comparador
- [ ] Seleccionar 2-3 proyectos para comparar
- [ ] Tabla lado a lado con todas las métricas y scores

### Fase 7 — Mapa de Proyectos

> Post-MVP. No requiere cambios de schema (`latitud` y `longitud` ya existen en `proyectos`).
> Librería: **React Leaflet + OpenStreetMap** — gratis, sin API key, sin límites.
> `npm install react-leaflet leaflet @types/leaflet`

- [ ] Componente `MapaProyectos.tsx` — mapa centrado en Quito Norte con pins por unidad
- [ ] Color del pin según score_total: verde (≥70) / amarillo (50-69) / rojo (<50)
- [ ] Click en pin → popup con: nombre, tipo, score_total, roi_anual, badge de escasez, botón "Ver detalle"
- [ ] Toggle **Lista | Mapa** en el dashboard (mismos filtros aplicados a ambas vistas)
- [ ] Mismos filtros del ranking aplicados al mapa (primera opción, tipo, sector, top N)
- [ ] Al ingresar una unidad: lat/lng se obtiene con click derecho en Google Maps → "Copiar coordenadas"

### Nice-to-have (post-MVP)
- [ ] Historial de cambios de precio por proyecto
- [ ] Cálculo de distancia a puntos clave (La Carolina, aeropuerto) — usando lat/lng ya almacenado
- [ ] Exportar comparativa a PDF
- [ ] Claude Vision: leer brochures subidos para extraer datos
