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

### Seguridad avanzada ✅ FASE BÁSICA COMPLETADA (2026-03-30)

- **Bloqueo de configuración**: `/configuracion/*` protegido con PIN de 6 dígitos (bcrypt) o biométrico (WebAuthn). Cookie httpOnly de 30 min gestiona la sesión de desbloqueo.
- **Modo privacidad**: botón 👁 oculta todos los montos con `<MontoPrivado>`. Estado en localStorage.
- **Pendiente (Fase Seguridad Avanzada)**: 2FA TOTP, inactivity lock, timeout de sesión.

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

-- Valores iniciales (8 criterios tras migración fase5_equipamiento_amoblado.sql)
insert into criterios_scoring (clave, nombre, descripcion, peso, orden) values
  ('roi',           'Rentabilidad (ROI)',       'ROI anual proyectado',                        0.30, 1),
  ('ubicacion',     'Ubicación',                'Sector, piso y orientación',                  0.20, 2),
  ('constructora',  'Constructora',             'Fiabilidad, experiencia y track record',       0.15, 3),
  ('entrega',       'Entrega',                  'Fecha y meses de espera',                     0.15, 4),
  ('equipamiento',  'Equipamiento',             'Parqueadero y bodega de la unidad',           0.07, 5),
  ('precio_m2',     'Precio por m²',            'vs promedio del sector',                      0.03, 6),
  ('calidad',       'Calidad',                  'Materiales y amenidades del edificio',        0.07, 7),
  ('confianza',     'Factor confianza',         'Sensación subjetiva del proyecto/vendedor',   0.03, 8);
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
  -- Préstamo de amoblado (cuando no se puede pagar en efectivo al momento de la entrega)
  amoblado_financiado        boolean default false,  -- si true, modela el amoblado como préstamo personal
  tasa_prestamo_amoblado     numeric default 12,     -- tasa anual del préstamo (%)
  meses_prestamo_amoblado    integer default 24,     -- plazo del préstamo en meses

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
  score_equipamiento  numeric,   -- parqueadero + bodega (criterio #5, peso 0.07)
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

// 1c. Préstamo de amoblado (si amoblado_financiado=true y viene_amoblado=false)
// Modela el caso en que no se tiene el efectivo disponible al momento de la entrega.
// Usa PMT estándar igual que el crédito hipotecario.
cuota_prestamo_amoblado     = PMT(tasa_prestamo_amoblado/12, meses_prestamo_amoblado, costo_amoblado_efectivo)
intereses_prestamo_amoblado = (cuota × meses) - costo_amoblado_efectivo
// Si amoblado_financiado=false → cuota=0, intereses=0 (sin efecto)

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

// 4. Flujo mensual (alícuota + cuota banco + cuota préstamo amoblado si aplica) (alicuota se descuenta siempre, independiente de Airbnb)
sueldo_disponible    = sueldo_neto * (porcentaje_ahorro / 100)
flujo_sin_airbnb     = sueldo_disponible - cuota_mensual - alicuota_mensual - cuota_prestamo_amoblado
flujo_con_airbnb     = sueldo_disponible + ingreso_neto_mensual - cuota_mensual - alicuota_mensual - cuota_prestamo_amoblado
obligacion_mensual   = cuota_mensual + alicuota_mensual + cuota_prestamo_amoblado
cobertura_sin_airbnb = (sueldo_disponible / obligacion_mensual) * 100
cobertura_con_airbnb = ((sueldo_disponible + ingreso_neto_mensual) / obligacion_mensual) * 100

// 5. Proyección a N años
meses_productivos    = (anos_proyeccion * 12) - meses_espera
airbnb_acumulado     = ingreso_neto_mensual * meses_productivos
plusvalia_acumulada  = precio_base * ((1 + plusvalia_anual/100)^anos_proyeccion - 1)
ganancia_bruta       = plusvalia_acumulada + airbnb_acumulado
ganancia_neta        = ganancia_bruta - total_intereses - intereses_prestamo_amoblado

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
score_roi          → escala absoluta: Math.min(100, round(roi_anual / 16 * 100))
                     16% ROI = 100 pts. NO usa min-max (eso hacía que el peor siempre fuera 0).
                     calcularScores() ya NO recibe todos_los_roi — parámetro eliminado.
score_ubicacion    → score base del sector
                     + bonus piso alto (piso >= 8: +5pts, piso >= 12: +10pts)
                     + bonus orientación (norte/este: +5pts)
score_constructora → fiabilidad: reputada=80 | conocida_sin_retrasos=60 |
                                  desconocida=40 | conocida_con_retrasos=20
                     + bonus años (>20 años: +10pts, >10 años: +5pts)
                     + bonus proyectos entregados (>10: +5pts)
                     + bonus reconocimientos (+5pts si tiene)
score_entrega      → inverso de meses_espera (0 meses=100, 48+ meses=0)
score_equipamiento → parqueadero=+50, bodega=+30, ambos=+20 bonus (máx 100)
                     Refleja el valor diferencial de la unidad para Airbnb y reventa.
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

NEXT_PUBLIC_APP_DOMAIN=localhost   # en Vercel: cambiar al dominio real (ej: airbnb-quito-ranker.vercel.app)
                                   # Usado por WebAuthn como RP ID — debe coincidir con el origen del browser
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

## Proceso de verificación al final de cada fase

### Paso 1 — Build de producción (obligatorio, siempre)
```bash
npm run build
```
El build de Next.js atrapa cosas que TypeScript no ve:
- Rutas en conflicto (ej: dos `page.tsx` para la misma URL)
- Módulos o variables de entorno faltantes en producción
- Errores en Server Components que solo aparecen al compilar
- Si el build pasa limpio → el código está listo para Vercel

### Paso 2 — Actualizar LEARNINGS.md
Agregar a `LEARNINGS.md` la sección de la fase recién completada con:
- Conceptos nuevos de Next.js usados
- Decisiones de arquitectura y por qué
- Bugs reales encontrados y cómo se resolvieron
- Estructura de archivos creados

### Paso 3 — Actualizar memoria del proyecto y CLAUDE.md
Hacer siempre al final de cada fase, en este orden:

1. **Memoria** (`memory/project_phase_status.md`):
   - Marcar la fase como `✅ COMPLETADA (fecha)`
   - Listar los entregables reales (no los planificados)
   - Anotar decisiones o limitaciones técnicas descubiertas
   - Actualizar "SIGUIENTE" al nombre de la siguiente fase

2. **CLAUDE.md — Checklist MVP**:
   - Marcar `[x]` los ítems completados en la sección de la fase
   - Agregar nota `✅ COMPLETADA (fecha)` al encabezado de la fase

3. **CLAUDE.md — Smoke tests**:
   - Reemplazar `*(completar al implementar)*` por la lista real de pruebas de browser
   - Las pruebas deben ser concretas y verificables paso a paso

### Paso 4 — Smoke test por fase (verificar en el browser)

**Fase 1 — Auth**
- [ ] `localhost:3000` sin sesión → redirige a `/login`
- [ ] `/login` muestra formulario en modo oscuro
- [ ] Login con credenciales incorrectas → error en español
- [ ] Login con credenciales correctas → redirige al dashboard
- [ ] Dashboard muestra el email en el header
- [ ] Botón "Salir" → cierra sesión y redirige a `/login`
- [ ] Después de salir, `localhost:3000` → vuelve a redirigir a `/login`

**Fase 2 — Configuración**
- [ ] `/configuracion` carga con los valores actuales de la DB (sueldo, banco, tasa, etc.)
- [ ] Editar el sueldo neto → "Guardar cambios" → recargar la página → el valor nuevo persiste
- [ ] `/configuracion/scoring` muestra los 7 criterios con sus pesos sumando 100%
- [ ] Editar un peso para que la suma sea ≠ 100% → botón deshabilitado y contador en rojo
- [ ] Editar pesos que sumen exactamente 100% → "Guardar pesos" activo → guarda sin error
- [ ] Botón "Recalcular todo el ranking" → aparece mensaje de confirmación (aunque no haya proyectos aún)

**Fase 3 — Ingreso**
- [ ] `npm run test` pasa en verde (13 tests Vitest: calculos + scoring)
- [ ] `/nuevo` carga y muestra tres tabs: Foto, Voz, Manual
- [ ] **Tab Manual**: llenar los 8 campos obligatorios → "Guardar ya" → redirige al dashboard `/`
- [ ] Volver a `/nuevo` → Tab Manual con campos vacíos que se confirma la navegación a `/`
- [ ] Intentar guardar sin nombre → aparece error "El nombre es obligatorio"
- [ ] Intentar guardar con precio_base = 0 → aparece error de validación
- [ ] **Tab Voz** (requiere Chrome): presionar "Iniciar grabación" → browser pide permiso de micrófono
- [ ] Dictar ~20 segundos ("Proyecto Legacy, sector Quicentro, precio 80000, 40 metros...") → "Detener"
- [ ] Aparece el transcript de texto, editable → "Extraer datos con IA" → el formulario se pre-llena
- [ ] **Tab Foto**: presionar "Tomar foto" → abre cámara (móvil) o explorador de archivos (desktop)
- [ ] Seleccionar una foto de cotización → "Analizando con Claude Vision..." → formulario pre-llenado
- [ ] Los campos con baja confianza aparecen con borde amarillo y aviso "⚠ verificar"
- [ ] Verificar en Supabase (Table Editor → proyectos) que la fila guardada tiene `score_total` > 0
- [ ] Verificar que `roi_anual`, `cuota_mensual`, `precio_m2` tienen valores calculados (no null)

**Fase Seguridad — Bloqueo de Configuración + Privacidad**
- [ ] Sin PIN ni WebAuthn activos: `/configuracion` abre directamente (sin overlay)
- [ ] `/configuracion/seguridad` → "Activar PIN" → ingresar y confirmar 6 dígitos → mensaje de éxito
- [ ] Ir a `/configuracion` → aparece overlay con teclado PIN de 6 dígitos
- [ ] Ingresar PIN correcto → acceso concedido → se puede navegar libremente por toda la sección config
- [ ] Dentro de config: `/configuracion` → `/configuracion/scoring` → `/configuracion/sectores` → sin PIN
- [ ] Salir de config: navegar a `/` (Ranking) → volver a `/configuracion` → pide PIN de nuevo
- [ ] Salir de config: navegar a `/nuevo` → volver a `/configuracion` → pide PIN de nuevo
- [ ] Recargar dentro de config → accede directo (cookie sigue vigente mientras no salgas)
- [ ] `/configuracion/seguridad` → "Registrar huella / Face ID" → browser pide confirmación biométrica → "Dispositivo registrado"
- [ ] Ir a `/configuracion` → overlay muestra botón "Usar huella / Face ID" + teclado PIN debajo
- [ ] Usar huella → acceso concedido
- [ ] Botón 👁 en sidebar (desktop) o header (móvil) → los números muestran `••••`
- [ ] Recargar la página → el modo privacidad persiste (localStorage)
- [ ] Long-press 1 seg en 👁 → también activa/desactiva
- [ ] Botón 👁 nuevamente → vuelven los números reales

**Fase 4 — Dashboard**
- [ ] `/` carga la tabla de ranking con los proyectos ingresados
- [ ] Tabla ordenada por score_total descendente (mayor score arriba)
- [ ] ScoreBar muestra barra verde/amarilla/roja según score
- [ ] Semáforos de ROI y cobertura muestran color correcto (verde/amarillo/rojo)
- [ ] Badge "¡Últimas!" (rojo) en filas con unidades_disponibles ≤ 3
- [ ] Badge "Pocas" (naranja) en filas con unidades_disponibles ≤ 10
- [ ] Badge "?" en filas con unidades_disponibles = null
- [ ] Símbolo ★ junto al nombre en proyectos con preferencia = 'primera_opcion'
- [ ] Panel resumen: "Mejor score", "Mejor ROI" y "Urgencia" muestran la unidad correcta
- [ ] Toggle "★ Primera opción" oculta los proyectos sin esa preferencia
- [ ] Toggle "Mejor / proyecto" colapsa varias unidades del mismo proyecto a la de mayor score
- [ ] Filtro por tipo filtra correctamente
- [ ] Filtro por sector filtra correctamente
- [ ] "Top 5" y "Top 10" limitan la tabla
- [ ] Filtro "Descartados" muestra solo proyectos con estado=descartado
- [ ] Modo privacidad: botón 👁 → los precios y cuotas muestran "••••"
- [ ] Hover sobre una fila → aparece enlace "Ver →" (futuro Fase 5)

**Fase 4.a — Privacidad en Configuración**
- [ ] Botón 👁 activo → ir a `/configuracion` → todos los campos muestran "••••"
- [ ] Con campos enmascarados → "Guardar configuración" → guarda los valores reales sin error
- [ ] Desactivar 👁 → los campos vuelven a mostrar los valores reales

**Fase 5 — Detalle**
- [x] `/proyecto/[id]` carga con tabs Resumen / Editar / Adjuntos / IA
- [x] Tab Resumen muestra todas las métricas financieras y desglose de scoring (7 barras)
- [x] Botón "Recalcular esta unidad" recalcula solo esa fila
- [x] Tab Editar: formulario completo (~50 campos) organizado en secciones con defaults de config en placeholders
- [x] Botón "Eliminar unidad" → confirm → redirect a ranking
- [x] Botón WhatsApp junto al teléfono del contacto
- [x] Botón "Analizar con IA" genera análisis narrativo (fortaleza, riesgo, recomendación, alerta)
- [x] Sección "Qué preguntar al vendedor" con lista de preguntas y datos faltantes
- [x] Upload de adjuntos sube al bucket Supabase Storage con URL firmada (24h)
- [x] Hints de ayuda en formulario de edición y en FormularioRapido

**Fase 6 — Comparador** ✅ COMPLETADA (2026-04-01)
- [x] Seleccionar 2-3 proyectos y ver tabla lado a lado
- [x] Tabla lado a lado: Financiero, Airbnb, Unidad, Scoring
- [x] Ganador resaltado por fila (bg-emerald-900/30)
- [x] Amenidades con pills + ganador por conteo
- [x] Aporte pre-entrega calculado (entrada + durante construcción)
- [x] Botón flotante "Comparar (N)" en ranking — aparece con 2-3 seleccionados

**Fase 7 — Mapa** ✅ COMPLETADA (2026-04-01)
- [x] Pins aparecen en el mapa con el color correcto según score
- [x] Click en pin abre popup con datos del proyecto

---

## Checklist pre-producción

### Antes del primer deploy a Vercel (hacer una sola vez)

- [x] **Unificar scripts de Supabase** — `supabase/schema_completo.sql` creado (2026-04-01).
      Incluye todas las fases en orden: tablas, RLS, seeds, WebAuthn, equipamiento, préstamo.
      Archivos individuales conservados como referencia histórica.

- [ ] Configurar `NEXT_PUBLIC_APP_DOMAIN` en Vercel (dominio real, para WebAuthn RP ID)
- [ ] Verificar variables de entorno en Vercel dashboard (las 6 de `.env.local`)
- [ ] Ejecutar `schema.sql` unificado en el Supabase de producción
- [ ] Registrar huella/Face ID desde el dominio de producción (las credenciales WebAuthn
      son por dominio — las registradas en localhost NO funcionan en producción)

---

## Checklist MVP

### Fase 1 — Base y Auth ✅ COMPLETADA (2026-03-29)
- [x] Supabase: tablas, RLS, Auth, Storage bucket
- [x] Seed de `criterios_scoring` con los 7 criterios
- [x] Seed de `configuracion` con valores default
- [x] `proxy.ts` — protección de rutas (Next.js 16: `middleware.ts` → `proxy.ts`)
- [x] Pantalla de login (email + contraseña)
- [x] Security headers en `next.config.ts` (CSP, HSTS, X-Frame-Options)

### Fase de Seguridad — Bloqueo de Configuración + Privacidad ✅ COMPLETADA (2026-03-30)

> Implementada antes de Fase 4 — los datos financieros reales ya están en la app.
> Alcance: bloqueo biométrico/PIN para `/configuracion/*` + modo privacidad.
> TOTP, inactivity lock y timeout de sesión → Fase de Seguridad Avanzada (post-MVP).

#### Bloqueo de configuración (WebAuthn primario + PIN fallback)
- [x] Nueva tabla `webauthn_credentials` en Supabase (SQL en `supabase/fase_seguridad.sql`)
- [x] Columnas nuevas en `configuracion`: `pin_hash text`, `pin_habilitado bool`, `webauthn_habilitado bool`
- [x] `(app)/configuracion/layout.tsx` — Server Component que envuelve `/configuracion/*` con `<ConfigLock>`
      Lee cookie `config_unlocked` → si válida omite ConfigLock, renderiza directo
- [x] `ConfigLock.tsx` — overlay con teclado PIN de 6 dígitos + botón "Usar huella / Face ID"
      Sin PIN ni WebAuthn activos → sin overlay (no bloquea hasta que el usuario configure algo)
      Tras autenticación exitosa → API setea cookie `config_unlocked` (httpOnly) + setState
- [x] `/api/webauthn/register-options` + `/api/webauthn/register-verify` — registro biométrico
- [x] `/api/webauthn/auth-options` + `/api/webauthn/auth-verify` — autenticación biométrica
- [x] `/api/verificar-pin` — verifica PIN de 6 dígitos con bcryptjs
- [x] `/api/limpiar-config-lock` — borra cookie al salir de /configuracion/*
- [x] Re-lock automático al salir de `/configuracion/*`: `useEffect` en `Nav.tsx` detecta cambio de ruta
      y llama DELETE /api/limpiar-config-lock (fire-and-forget, no bloquea la navegación)
      Dentro del grupo /configuracion/* la navegación es libre (scoring → sectores → etc.)
- [x] `/configuracion/seguridad` — activar PIN, registrar huella/Face ID, desactivar métodos
- [x] Bug fix: `useCallback` en ConfigLock.tsx movido antes de los early returns
      (violación de Reglas de Hooks — React exige mismo número de hooks en cada render)
- [x] Dependencias: `@simplewebauthn/browser`, `@simplewebauthn/server`, `bcryptjs`
- [x] Variable de entorno: `NEXT_PUBLIC_APP_DOMAIN` (WebAuthn RP ID: "localhost" en dev, dominio en prod)

#### Modo privacidad
- [x] `PrivacyContext.tsx` — React Context global con `privacyMode`, persistido en localStorage
- [x] `AppProviders.tsx` — wrapper Client Component que provee el contexto en `(app)/layout.tsx`
- [x] Botón 👁 en sidebar (desktop) y header móvil — long-press 1 seg activa/desactiva
- [x] `MontoPrivado.tsx` — renderiza número formateado o `••••` según `privacyMode`

#### Pendiente para Fase de Seguridad Avanzada (post-MVP)
- [ ] 2FA TOTP (Google Authenticator) — flujo post-login con Supabase MFA
- [ ] Inactivity lock — bloqueo por inactividad (hook `useInactivityLock`)
- [ ] Timeout de sesión configurable (JWT expiration + refresh)

### Fase 2 — Configuración Global ✅ COMPLETADA (2026-03-29)
- [x] Pantalla `/configuracion` — sueldo, banco, tasa, años, % proyección + estructura de pago defaults
- [x] Pantalla `/configuracion/scoring` — editar pesos, validar que sumen 100%, barra visual por criterio
- [x] Botón "Recalcular todo el ranking" (lógica pendiente — se completa en Fase 3)

### Fase 3 — Ingreso de Proyectos ✅ COMPLETADA (2026-03-29)

#### Principio de ingreso rápido
El formulario tiene **dos modos** para no perder oportunidades en ferias:

**Modo rápido** ("Guardar ya") — solo estos campos obligatorios:
`nombre`, `sector`, `tipo`, `precio_base`, `area_interna_m2`, `meses_espera`, `unidades_disponibles`, `preferencia`
→ Con eso ya hay ranking, score parcial, badge de escasez, badge de preferencia y métricas básicas.

**Modo completo** — todos los campos del modelo, se accede desde el detalle del proyecto.
Los campos vacíos se muestran como "pendiente" en el detalle, no bloquean el guardado.

Los tres métodos de ingreso rápido se muestran como tabs en `/nuevo`:
**[ 📷 Foto ] [ 🎤 Voz ] [ ✏️ Manual ]**

- [x] **Ingreso por foto** (`CamaraCaptura.tsx` + `/api/analizar-foto`): tomar foto de cotización,
      brochure o tabla de precios → Claude Vision extrae JSON → pre-llena formulario para revisión.
      - Captura con `<input type="file" accept="image/*" capture="environment">` (sin librerías, funciona en todo móvil)
      - Claude devuelve campo `confianza_baja: string[]` con los campos que no pudo leer bien → se resaltan en amarillo
      - **Nunca auto-guarda** — siempre revisión obligatoria antes de confirmar

- [x] **Ingreso por voz** (`GrabadorVoz.tsx` + `/api/transcribir`): Web Speech API transcribe en browser
      → transcript de texto enviado a Claude para extraer JSON → prellenar formulario → usuario revisa y guarda.
      Nota: Claude API no acepta audio binario → la transcripción ocurre en el browser con Web Speech API.

- [x] Formulario manual modo rápido (8 campos, 1 pantalla, botón "Guardar ya")
- [ ] Formulario manual modo completo (pendiente para Fase 5 — Detalle de Unidad)
- [x] Campos de financiamiento con defaults de configuración (vía calcularMetricas con config de DB)
- [ ] **Calculadora de pagos** (`CalculadoraPago.tsx`) — pendiente para Fase 5
- [x] Cálculo automático de todas las métricas al guardar (`lib/calculos.ts`)
- [x] Cálculo automático de todos los scores al guardar (`lib/scoring.ts`)

#### Tests unitarios (Vitest) — escribir junto con las librerías
> Solo `lib/calculos.ts` y `lib/scoring.ts`. Sin tests de UI ni de Server Actions.
> Las funciones son puras (input → number), los valores esperados se verifican a mano.

```
lib/__tests__/calculos.test.ts  (11 tests)
  ✓ precio_m2 usa area_interna_m2, nunca area_total_m2
  ✓ reserva=null → reserva_efectiva = reserva_default ($2,000)
  ✓ reserva=0 → pago_entrada_neto = monto_entrada_total (sin descuento)
  ✓ tasa_anual=0 → cuota_mensual = monto_financiar / (anos_credito × 12)
  ✓ pct_durante=0 → cuota_construccion = 0
  ✓ pct_entrada + pct_durante + pct_contra = 100 (validación)
  ✓ viene_amoblado=true → costo_amoblado_efectivo = 0
  ✓ amoblado_financiado=false → cuota_prestamo_amoblado = 0, intereses = 0
  ✓ amoblado_financiado=true → genera cuota e intereses que reducen ganancia_neta y flujo
  ✓ amoblado_financiado=true + viene_amoblado=true → sin préstamo (no hay costo)
  ✓ aporte_propio_total no cuenta la reserva dos veces

lib/__tests__/scoring.test.ts  (6 tests)
  ✓ permite_airbnb=false → score_total = 0 (regla absoluta)
  ✓ score_total = suma ponderada correcta con 8 criterios
  ✓ score_equipamiento: ninguno=0, solo parqueadero=50, solo bodega=30, ambos=100
  ✓ score_constructora: reputada=80, con_retrasos=20
  ✓ score_entrega: 0 meses=100, 48+ meses=0
  ✓ score_confianza: confianza_subjetiva × 20
```

- [x] Instalar Vitest (`npm install -D vitest`)
- [x] `vitest.config.ts` — configuración mínima para TypeScript puro (sin DOM)
- [x] Implementar los 13 tests listados arriba
- [x] `npm run test` pasa en verde (13/13)

### Fase 3b — Sectores Dinámicos ✅ COMPLETADA (2026-03-30)
- [x] Tabla `sectores_scoring` en Supabase con 29 sectores seeds (25 del CSV + 4 originales)
- [x] `lib/scoring.ts` elimina hardcode — recibe `scores_sectores: Record<string, number>` como parámetro
- [x] `data.ts` separado para constantes compartidas (TIPOS, PREFERENCIAS) — fix del bug `'use server'`
- [x] `/nuevo` fetcha sectores desde DB — select dinámico ordenado por score desc
- [x] Hint de precio Airbnb al seleccionar sector ("Airbnb estimado: $28–$45/noche")
- [x] Opción "➕ Agregar nuevo sector" — crea en `sectores_scoring` con score=0 si no existe
- [x] Validación anti-duplicado con `ilike` (case-insensitive)
- [x] `/configuracion/sectores` — lista editable de todos los sectores (score + rango Airbnb)
- [x] `/configuracion/sectores` — formulario para agregar nuevos sectores
- [x] Link "Sectores →" en `/configuracion` junto a "Pesos del scoring →"
- [x] Tests actualizados — 13/13 passing con nuevo parámetro `scores_sectores`

**Smoke tests — Fase 3b:**
- [ ] `/nuevo` → Tab Manual → dropdown Sector muestra 29 sectores ordenados por score
- [ ] Seleccionar "González Suárez" → aparece hint "$50–$90/noche" debajo del select
- [ ] Seleccionar "➕ Agregar nuevo sector" → aparece campo de texto
- [ ] Escribir "Rumipamba" → llenar resto de campos → "Guardar ya" → redirige a `/`
- [ ] `/configuracion/sectores` → aparece "Rumipamba" al final con badge "⚠ sin score"
- [ ] Editar score de "Rumipamba" a 72 + airbnb_min=25 + airbnb_max=40 → "Guardar cambios" → recarga y persiste
- [ ] Volver a `/nuevo` → seleccionar "Rumipamba" → hint muestra "$25–$40/noche"
- [ ] Intentar agregar sector con nombre existente → error "Ya existe un sector con ese nombre"
- [ ] `/configuracion` → aparece botón "Sectores →" junto a "Pesos del scoring →"
- [ ] `npm run test` → 13/13 en verde

### Fase 4 — Dashboard y Ranking ✅ COMPLETADA (2026-03-31)

**Panel resumen** (encabezado del dashboard, 3 tarjetas):
- [x] "Mejor score" → nombre+tipo + score_total + ROI de la unidad líder
- [x] "Mejor ROI" → puede ser distinta unidad (nombre+tipo + roi_anual)
- [x] "Urgencia" → unidad con unidades_disponibles más bajas (si hay ≤10), con badge rojo/naranja

**Tabla de ranking:**
- [x] Filas ordenadas por score_total descendente
- [x] Score visual (ScoreBar) + semáforos ROI y cobertura por fila
- [x] Badge de escasez por fila (≤3 rojo, ≤10 naranja, null = "?")
- [x] Badge de preferencia por fila (★ primera opción, gris alternativa)

**Filtros y vistas:**
- [x] Toggle "Solo primera opción" — filtra a `preferencia = 'primera_opcion'`
- [x] Toggle "Mejor de cada proyecto" — agrupa por nombre del proyecto, muestra solo la unidad de mayor score_total por grupo; pasa de ver N unidades a ver N proyectos
- [x] Filtro por tipo (`estudio / suite / minisuite / 1 dorm / 2 dorm`)
- [x] Filtro por sector
- [x] Filtro "Top N" (mostrar solo los 5 o 10 mejores)
- [x] Filtro por estado (activos / descartados / todos)

#### Fase 4.a — Privacidad en Configuración Global ✅ COMPLETADA (2026-03-31)
- [x] `ConfiguracionForm.tsx` lee `usePrivacy()` y pasa `privacyMode` a cada campo
- [x] `CampoNumerico` y `CampoTexto`: cuando `privacyMode=true` → muestra `••••` visual
      + mantiene `<input type="hidden">` con el valor real para que el form siga guardando
- [x] Cubre los 13 campos del formulario: sueldo, % ahorro, gastos Airbnb, banco, tasa,
      años crédito, años proyección, costo amoblado, reserva, % entrada, % durante,
      cuotas construcción, % contra entrega

#### Alcance ampliado Fase 4 (2026-03-31) ✅ COMPLETADO
- [x] `fecha_entrega` cambiado de `text` a `date` — `meses_espera` se calcula automáticamente
      desde la fecha (Math.round de días / 30.44); si no hay fecha, se acepta ingreso manual de meses
- [x] `recalcularUnidad` también recalcula `meses_espera` desde `fecha_entrega` cuando existe,
      para que los meses no queden "vencidos" con el tiempo
- [x] Columna `plusvalia_anual_estimada numeric DEFAULT 5` añadida a `sectores_scoring`
      con valores reales del CSV por cada sector (González Suárez 6.5%, La Carolina 6.0%, etc.)
      → al crear un proyecto se copia automáticamente a `proyectos.plusvalia_anual`
- [x] Valores por defecto de config se copian al registro al crear (ya no quedan null):
      `reserva`, `porcentaje_entrada`, `porcentaje_durante_construccion`,
      `num_cuotas_construccion`, `porcentaje_contra_entrega`, `tasa_anual`,
      `anos_credito`, `banco`, `costo_amoblado`
- [x] Sub-tabs dentro del formulario "Editar" en `/proyecto/[id]`:
      **Identificación** | **Unidad** | **Pago** | **Airbnb**
      Todas las secciones siguen en el DOM (con `hidden`) para que el guardado incluya todos los campos
- [x] `/configuracion/sectores` muestra y permite editar `plusvalia_anual_estimada` por sector

### Fase 5 — Detalle de Unidad

#### Alcance inicial (2026-03-31)
- [x] Vista completa de métricas financieras de esta unidad (tabs: Resumen, Editar, Adjuntos, IA)
- [x] Formulario de edición con todos los ~50 campos del modelo, organizado en secciones
- [x] Desglose de scoring por criterio (ScoreBar por cada uno de los 7, con peso y contribución)
- [x] Botón "↻ Recalcular esta unidad" → recalcula métricas y scores solo de esta fila
- [x] Panel de adjuntos (upload a Supabase Storage + listado + eliminar, con URLs firmadas 24h)
- [x] Botón "Analizar con IA" → llama a Claude API → guarda fortaleza, riesgo, recomendación, alerta
- [x] Sección "Qué preguntar al vendedor" (desde `que_preguntar[]` y `datos_faltantes[]`)

#### Alcance ampliado (2026-03-31) ✅ COMPLETADO
- [x] Botón "Eliminar unidad" en el header → confirm → DELETE cascade (Storage + DB) → redirect a `/`
- [x] Placeholders en formulario de edición muestran el valor efectivo del default de config
      cuando el campo está vacío (ej: "vacío = usa config (10%)")
      → `page.tsx` fetcha `configuracion` y la pasa como prop a `DetalleProyecto`
- [x] Sección "Contacto" en Tab Resumen: muestra nombre y teléfono del vendedor
- [x] Botón WhatsApp junto a `contacto_telefono` en Resumen y Editar
      → abre `https://wa.me/+593{telefono}` (limpia no-dígitos, quita 0 inicial, agrega 593)
- [x] Hints de ayuda en formulario de edición (texto descriptivo debajo de campos clave:
      área interna vs balcón, pago, financiamiento, Airbnb, permite_airbnb, avance obra)
- [x] Hints de ayuda en FormularioRapido (`/nuevo`) en los 8 campos del modo rápido
- [x] Bug fix: `redirect` en `eliminarProyecto` como import estático (tipo `never` requerido por TS)

#### Mejoras al motor de negocio (2026-04-01) ✅ COMPLETADO
- [x] **Nuevo criterio Equipamiento** (parqueadero + bodega) — 8º criterio, peso 0.07, orden 5
      score_equipamiento: parqueadero=50, bodega=30, ambos=100 (bonus combo +20)
      SQL: `supabase/fase5_equipamiento_amoblado.sql`
      Precio m² baja de 0.10 → 0.03 para mantener suma=1.00
- [x] **Préstamo de amoblado** — regla de negocio central
      Campos: `amoblado_financiado`, `tasa_prestamo_amoblado`, `meses_prestamo_amoblado`
      La cuota reduce flujo mensual + cobertura; los intereses reducen ganancia_neta → ROI baja orgánicamente
      UI: checkbox con campos condicionales (tasa/plazo aparecen al activar)
- [x] 17/17 tests Vitest en verde (11 calculos + 6 scoring)
- [x] **FIX APLICADO en Fase 6:** score_roi cambiado a escala absoluta `Math.min(100, round(roi/16*100))`
      Parámetro `todos_los_roi` eliminado de `calcularScores()`. 17/17 tests en verde.

### Fase 6 — Comparador ✅ COMPLETADA (2026-04-01)
- [x] Seleccionar 2-3 proyectos para comparar (checkboxes en ranking, máx 3)
- [x] Tabla lado a lado con 4 secciones: Financiero / Airbnb / Unidad / Scoring
- [x] Resaltado del ganador por fila (bg-emerald-900/30)
- [x] Amenidades como pills + ganador por conteo de amenidades
- [x] Aporte pre-entrega calculado client-side (monto_entrada + monto_durante_construccion)
- [x] Fix score_roi: escala absoluta `Math.min(100, round(roi/16*100))` — eliminado min-max
- [x] RecalcularButton en sidebar y header móvil (useTransition + router.refresh)
- [x] ThemeButton modo claro/oscuro (inline style en <html> por Tailwind v4 specificity)

### Fase 7 — Mapa de Proyectos ✅ COMPLETADA (2026-04-01)

> Post-MVP. No requiere cambios de schema (`latitud` y `longitud` ya existen en `proyectos`).
> Librería: **React Leaflet + OpenStreetMap** — gratis, sin API key, sin límites.
> `npm install react-leaflet leaflet @types/leaflet`

- [x] Componente `MapaProyectos.tsx` — mapa centrado en Quito Norte con pins por unidad
- [x] Color del pin según score_total: verde (≥70) / amarillo (50-69) / rojo (<50)
- [x] Click en pin → popup con: nombre, tipo, score_total, roi_anual, badge de escasez, botón "Ver detalle"
- [x] Toggle **Lista | Mapa** en el dashboard (mismos filtros aplicados a ambas vistas)
- [x] Mismos filtros del ranking aplicados al mapa (primera opción, tipo, sector, top N)
- [ ] Al ingresar una unidad: lat/lng se obtiene con click derecho en Google Maps → "Copiar coordenadas" *(instrucción de uso, no código)*

**Notas de implementación:**
- `dynamic(..., { ssr: false })` es obligatorio — Leaflet usa `window`/`document` que no existen en Node.js
- `CircleMarker` en lugar de `Marker` para evitar el bug de iconos rotos con Webpack
- Inline styles dentro del `<Popup>` — Tailwind no garantiza aplicar dentro de portales de Leaflet
- `MapContainer` necesita `height` explícito vía `style={{ height: 500 }}`
- CSP en `next.config.ts` debe incluir `*.tile.openstreetmap.org` en `img-src` y `connect-src`
- Centro del mapa: Parque La Carolina `[-0.183, -78.487]`, zoom 14

### Nice-to-have (post-MVP)
- [ ] **Calculadora bidireccional de porcentajes de pago** — en el formulario de edición, al modificar
      `% Entrada`, `% Durante` o `% Contra entrega`, recalcular los otros para que siempre sumen 100%.
      Incluir indicador visual verde/rojo (igual al de pesos de scoring) mostrando la suma actual.
- [ ] **Preview inline de adjuntos** — en el panel de adjuntos, al hacer clic en "Ver" abrir un modal
      ligero dentro de la app: imágenes con `<img>`, PDFs con `<iframe>` o `<embed>`.
      No requiere librería externa (nativo del browser). Usar la URL firmada de 24h ya generada.
- [ ] **Inactivity timer en /configuracion/*** — Opción C de seguridad: re-lock automático si el usuario lleva
      más de N minutos sin actividad dentro de la sección de config (complemento de la Opción A ya implementada).
      Implementar junto con el inactivity lock global de Fase de Seguridad Avanzada.
- [ ] Historial de cambios de precio por proyecto
- [ ] Cálculo de distancia a puntos clave (La Carolina, aeropuerto) — usando lat/lng ya almacenado
- [ ] Exportar comparativa a PDF
- [ ] Claude Vision: leer brochures subidos para extraer datos
- [ ] Criterios de scoring personalizables — permitir crear/eliminar criterios desde `/configuracion/scoring`
- [ ] Sub-criterios de scoring por sector — desglosar `score_ubicacion` en 5 dimensiones del CSV:
      Renta (30pts), Seguridad (25pts), Plusvalía (20pts), Acceso (15pts), Servicios (10pts).
      Requiere tabla `sectores_scoring_subcriterios` y UI en `/configuracion/sectores`.
      (actualmente los 7 criterios son fijos en DB; habría que agregar formulario de alta/baja y
      actualizar lib/scoring.ts para leer dinámicamente cualquier criterio activo)
- [ ] **Explicación de criterios en el desglose de scoring** — en `/proyecto/[id]` tab Resumen,
      agregar tooltip o acordeón expandible junto a cada criterio del desglose que explique
      qué mide, cómo se calcula y qué implica el valor obtenido.
      No requiere cambios de schema ni de lógica — solo UI educativa.
- [ ] **Reordenar criterios de scoring por peso** — en `/configuracion/scoring`, al guardar nuevos pesos,
      reordenar visualmente los criterios de mayor a menor peso (actualizar campo `orden` en DB).
      Actualmente el orden es fijo. Implementar tras el guardado exitoso con un segundo UPDATE.
- [ ] **Columnas ordenables en la tabla de ranking** — presionar el título de una columna ordena
      las filas de mayor a menor (y viceversa con segundo clic). Implementar con `useState` de
      `sortKey` + `sortDir` en `RankingDashboard.tsx`. No requiere cambios de backend.
- [ ] **Selector de columnas en la tabla de ranking** (estilo Odoo) — botón ⚙ que despliega
      un menú con checkboxes para mostrar/ocultar columnas (precio, cuota, área, sector, etc.).
      Estado persistido en `localStorage` para que la preferencia sobreviva recargas.
      No requiere cambios de backend.
