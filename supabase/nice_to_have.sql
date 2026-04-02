-- nice_to_have.sql — Migraciones para features nice-to-have
-- Ejecutar en Supabase SQL Editor (una vez en producción, una vez en desarrollo).
-- Idempotente: usa IF NOT EXISTS y ON CONFLICT DO NOTHING donde aplica.

-- ─────────────────────────────────────────────────────────────────────────────
-- FEATURE 2: Historial de cambios de precio
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists precio_historial (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references proyectos(id) on delete cascade,
  precio_base  numeric not null,       -- nuevo precio registrado en ese momento
  precio_anterior numeric,             -- precio previo (null si es el primero)
  notas        text,                   -- contexto opcional ("subió tras visita")
  created_at   timestamptz default now()
);

alter table precio_historial enable row level security;

-- Solo el usuario autenticado puede leer/escribir
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'precio_historial' and policyname = 'solo autenticado'
  ) then
    create policy "solo autenticado" on precio_historial
      using (auth.role() = 'authenticated');
  end if;
end $$;

create index if not exists precio_historial_proyecto_id_idx
  on precio_historial (proyecto_id, created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- FEATURE 1: Sub-criterios de scoring por sector
--
-- Desglosa score_ubicacion en 5 dimensiones con pesos fijos:
--   Renta     30 pts  (demanda Airbnb, precio por noche alcanzable)
--   Seguridad 25 pts  (índice de seguridad del barrio)
--   Plusvalía 20 pts  (apreciación histórica de la zona)
--   Acceso    15 pts  (movilidad, transporte, distancia a hitos)
--   Servicios 10 pts  (comercio, restaurantes, entretenimiento)
--   Total     100 pts (= score_base cuando sub-criterios están activos)
--
-- Si todos son 0 (default), la lógica de scoring usa score_base como fallback.
-- ─────────────────────────────────────────────────────────────────────────────

alter table sectores_scoring
  add column if not exists sc_renta     integer not null default 0 check (sc_renta     between 0 and 30),
  add column if not exists sc_seguridad integer not null default 0 check (sc_seguridad between 0 and 25),
  add column if not exists sc_plusvalia integer not null default 0 check (sc_plusvalia between 0 and 20),
  add column if not exists sc_acceso    integer not null default 0 check (sc_acceso    between 0 and 15),
  add column if not exists sc_servicios integer not null default 0 check (sc_servicios between 0 and 10);

-- Poblar con valores estimados para los sectores originales (ajustables desde la UI)
-- Estrategia: score_base ≈ sc_renta + sc_seguridad + sc_plusvalia + sc_acceso + sc_servicios
update sectores_scoring set
  sc_renta=28, sc_seguridad=23, sc_plusvalia=18, sc_acceso=14, sc_servicios=10
  where nombre ilike 'Quicentro';

update sectores_scoring set
  sc_renta=27, sc_seguridad=22, sc_plusvalia=18, sc_acceso=13, sc_servicios=10
  where nombre ilike 'González Suárez';

update sectores_scoring set
  sc_renta=26, sc_seguridad=22, sc_plusvalia=17, sc_acceso=13, sc_servicios=10
  where nombre ilike 'La Coruña';

update sectores_scoring set
  sc_renta=25, sc_seguridad=22, sc_plusvalia=17, sc_acceso=13, sc_servicios=10
  where nombre ilike 'Benalcázar';

update sectores_scoring set
  sc_renta=25, sc_seguridad=21, sc_plusvalia=16, sc_acceso=13, sc_servicios=10
  where nombre ilike 'Quito Tenis';

update sectores_scoring set
  sc_renta=24, sc_seguridad=20, sc_plusvalia=16, sc_acceso=13, sc_servicios=9
  where nombre ilike 'Granda Centeno';

update sectores_scoring set
  sc_renta=23, sc_seguridad=20, sc_plusvalia=15, sc_acceso=13, sc_servicios=9
  where nombre ilike 'Bellavista';

update sectores_scoring set
  sc_renta=22, sc_seguridad=19, sc_plusvalia=15, sc_acceso=13, sc_servicios=9
  where nombre ilike 'Iñaquito';

update sectores_scoring set
  sc_renta=21, sc_seguridad=18, sc_plusvalia=15, sc_acceso=13, sc_servicios=9
  where nombre ilike 'El Batán';

update sectores_scoring set
  sc_renta=20, sc_seguridad=18, sc_plusvalia=14, sc_acceso=13, sc_servicios=9
  where nombre ilike 'La Pradera';

update sectores_scoring set
  sc_renta=20, sc_seguridad=17, sc_plusvalia=14, sc_acceso=13, sc_servicios=10
  where nombre ilike 'La Floresta';

update sectores_scoring set
  sc_renta=18, sc_seguridad=16, sc_plusvalia=14, sc_acceso=12, sc_servicios=10
  where nombre ilike 'Guangüiltagua';
