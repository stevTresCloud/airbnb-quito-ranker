-- ============================================================
-- FASE 1 — Tablas, RLS y Seeds
-- Ejecutar completo en el SQL Editor de Supabase
-- ============================================================


-- ============================================================
-- 1. TABLA: configuracion
-- Una sola fila con los valores globales de la app.
-- ============================================================
create table if not exists configuracion (
  id                                      integer primary key default 1,
  sueldo_neto                             numeric default 1400,
  porcentaje_ahorro                       numeric default 40,
  porcentaje_gastos_airbnb                numeric default 30,
  banco_default                           text    default 'BIESS',
  tasa_default                            numeric default 6.0,
  anos_credito_default                    integer default 6,
  anos_proyeccion                         integer default 5,
  costo_amoblado_default                  numeric default 6000,

  reserva_default                         numeric  default 2000,
  porcentaje_entrada_default              numeric  default 10,
  porcentaje_durante_construccion_default numeric  default 20,
  num_cuotas_construccion_default         integer  default 30,
  porcentaje_contra_entrega_default       numeric  default 70,

  updated_at                              timestamptz default now()
);

alter table configuracion enable row level security;

create policy "solo autenticado"
  on configuracion
  using (auth.role() = 'authenticated');


-- ============================================================
-- 2. TABLA: criterios_scoring
-- Pesos editables para el motor de ranking.
-- ============================================================
create table if not exists criterios_scoring (
  id          uuid primary key default gen_random_uuid(),
  clave       text unique not null,
  nombre      text not null,
  descripcion text,
  peso        numeric not null,
  activo      boolean default true,
  orden       integer,
  updated_at  timestamptz default now()
);

alter table criterios_scoring enable row level security;

create policy "solo autenticado"
  on criterios_scoring
  using (auth.role() = 'authenticated');


-- ============================================================
-- 3. TABLA: proyectos
-- Una fila por unidad evaluada (proyecto + tipo de unidad).
-- ============================================================
create table if not exists proyectos (
  id uuid primary key default gen_random_uuid(),

  -- Estado
  estado                text default 'en_análisis',
  fecha_cotizacion      date,

  -- Identificación
  nombre                text not null,
  constructora          text,
  anos_constructora     integer,
  proyectos_entregados  integer,
  fiabilidad_constructora text,
  contacto_nombre       text,
  contacto_telefono     text,

  -- Ubicación
  direccion             text,
  sector                text not null,
  latitud               numeric,
  longitud              numeric,

  -- Unidad
  tipo                  text,
  area_interna_m2       numeric not null,
  area_balcon_m2        numeric default 0,
  area_total_m2         numeric,
  dormitorios           integer default 1,
  numero_banos          numeric default 1,
  piso                  integer,
  pisos_totales         integer,
  unidades_totales_edificio integer,
  orientacion           text,
  materiales            text,
  tipo_cocina           text,
  tiene_balcon          boolean default false,
  tiene_parqueadero     boolean default false,
  costo_parqueadero     numeric default 0,
  tiene_bodega          boolean default false,
  tiene_zona_lavanderia boolean default false,
  tiene_puerta_seguridad boolean default false,
  amenidades            text[],
  unidades_disponibles  integer,
  preferencia           text,
  reconocimientos_constructora text,

  -- Factor subjetivo
  confianza_subjetiva   integer,
  confianza_notas       text,

  -- Precio
  precio_base           numeric not null,

  -- Estructura de pago
  reserva                         numeric,
  porcentaje_entrada              numeric,
  monto_entrada                   numeric,
  porcentaje_durante_construccion numeric,
  monto_durante_construccion      numeric,
  num_cuotas_construccion         integer,
  porcentaje_contra_entrega       numeric,
  monto_contra_entrega            numeric,

  -- Financiamiento bancario
  banco                 text,
  tasa_anual            numeric,
  anos_credito          integer,

  -- Calculados de financiamiento
  precio_total          numeric,
  monto_financiar       numeric,
  cuota_mensual         numeric,
  total_intereses       numeric,
  total_pagado_credito  numeric,

  -- Amoblamiento
  viene_amoblado        boolean default false,
  costo_amoblado        numeric,

  -- Airbnb
  permite_airbnb                        boolean default true,
  tiene_administracion_airbnb_incluida  boolean default false,
  porcentaje_gestion_airbnb             numeric,

  -- Costos fijos
  alicuota_mensual      numeric default 0,

  -- Estado de obra
  avance_obra_porcentaje numeric default 0,

  -- Ingresos Airbnb
  precio_noche_estimado numeric,
  ocupacion_estimada    numeric default 70,

  -- Timeline
  fecha_entrega         text,
  meses_espera          integer,

  -- Apreciación
  plusvalia_anual       numeric default 5,

  -- Métricas calculadas
  precio_m2                 numeric,
  ingreso_bruto_mensual     numeric,
  gastos_operativos         numeric,
  ingreso_neto_mensual      numeric,
  sueldo_disponible         numeric,
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

  -- Scores de ranking
  score_roi           numeric,
  score_ubicacion     numeric,
  score_constructora  numeric,
  score_entrega       numeric,
  score_precio_m2     numeric,
  score_calidad       numeric,
  score_confianza     numeric,
  score_total         numeric,

  -- Análisis IA
  analisis_ia_generado  boolean default false,
  fortaleza_ia          text,
  riesgo_ia             text,
  recomendacion_ia      text,
  alerta_ia             text,
  que_preguntar         text[],
  datos_faltantes       text[],

  notas       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table proyectos enable row level security;

create policy "solo autenticado"
  on proyectos
  using (auth.role() = 'authenticated');


-- ============================================================
-- 4. TABLA: adjuntos
-- Archivos y links asociados a un proyecto.
-- ============================================================
create table if not exists adjuntos (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  tipo        text not null,
  nombre      text not null,
  storage_path text,
  url_externa  text,
  descripcion  text,
  created_at  timestamptz default now()
);

alter table adjuntos enable row level security;

create policy "solo autenticado"
  on adjuntos
  using (auth.role() = 'authenticated');


-- ============================================================
-- 5. STORAGE BUCKET: adjuntos-proyectos (privado)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adjuntos-proyectos',
  'adjuntos-proyectos',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4'
  ]
)
on conflict (id) do nothing;

-- RLS para el bucket (solo usuarios autenticados)
create policy "acceso autenticado a adjuntos"
  on storage.objects
  for all
  using (
    bucket_id = 'adjuntos-proyectos'
    and auth.role() = 'authenticated'
  );


-- ============================================================
-- 6. SEED: criterios_scoring
-- Los 7 criterios del motor de ranking con sus pesos.
-- Suma total: 0.30+0.20+0.15+0.15+0.10+0.07+0.03 = 1.00
-- ============================================================
insert into criterios_scoring (clave, nombre, descripcion, peso, orden)
values
  ('roi',          'Rentabilidad (ROI)',  'ROI anual proyectado',                       0.30, 1),
  ('ubicacion',    'Ubicación',           'Sector, piso y orientación',                 0.20, 2),
  ('constructora', 'Constructora',        'Fiabilidad, experiencia y track record',      0.15, 3),
  ('entrega',      'Entrega',             'Fecha y meses de espera',                    0.15, 4),
  ('precio_m2',    'Precio por m²',       'vs promedio del sector',                     0.10, 5),
  ('calidad',      'Calidad',             'Materiales y amenidades del edificio',       0.07, 6),
  ('confianza',    'Factor confianza',    'Sensación subjetiva del proyecto/vendedor',  0.03, 7)
on conflict (clave) do nothing;


-- ============================================================
-- 7. SEED: configuracion
-- Fila única con los valores por defecto de la app.
-- La constraint "id = 1" garantiza que siempre haya una sola fila.
-- ============================================================
insert into configuracion (id) values (1)
on conflict (id) do nothing;


-- ============================================================
-- Verificación rápida
-- ============================================================
select 'configuracion' as tabla, count(*) from configuracion
union all
select 'criterios_scoring', count(*) from criterios_scoring
union all
select 'proyectos', count(*) from proyectos
union all
select 'adjuntos', count(*) from adjuntos;
