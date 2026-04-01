-- ─── Migración: Equipamiento scoring + Préstamo amoblado ──────────────────────
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Cambios:
--   1. Nuevo criterio de scoring: 'equipamiento' (parqueadero + bodega)
--   2. Nuevas columnas en proyectos para modelar el préstamo de amoblado
--   3. Nueva columna score_equipamiento en proyectos
--   4. Ajuste de pesos y orden para hacer sitio al nuevo criterio

-- ── 1. Nuevo criterio 'equipamiento' ──────────────────────────────────────────
-- Se inserta en posición 5 (antes de precio_m2).
-- Peso inicial: 0.07 — se toma de precio_m2 (baja de 0.10 → 0.03).
-- El usuario puede ajustar en /configuracion/scoring.
INSERT INTO criterios_scoring (clave, nombre, descripcion, peso, orden) VALUES
  ('equipamiento', 'Equipamiento', 'Parqueadero y bodega de la unidad', 0.07, 5);

-- Reasignar orden y peso de los criterios desplazados
UPDATE criterios_scoring SET peso = 0.03, orden = 6 WHERE clave = 'precio_m2';
UPDATE criterios_scoring SET            orden = 7 WHERE clave = 'calidad';
UPDATE criterios_scoring SET            orden = 8 WHERE clave = 'confianza';

-- ── 2. Nueva columna score_equipamiento en proyectos ─────────────────────────
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS score_equipamiento numeric;

-- ── 3. Nuevas columnas para préstamo de amoblado ──────────────────────────────
-- amoblado_financiado: true = el amoblado no se paga en efectivo, se financia con préstamo
-- tasa_prestamo_amoblado: tasa anual del préstamo (ej: 12%)
-- meses_prestamo_amoblado: plazo del préstamo en meses (ej: 24)
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS amoblado_financiado        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tasa_prestamo_amoblado     numeric DEFAULT 12,
  ADD COLUMN IF NOT EXISTS meses_prestamo_amoblado    integer DEFAULT 24;

-- ── 4. Recalcular score_total de proyectos existentes ─────────────────────────
-- Los proyectos existentes tendrán score_equipamiento = NULL hasta que se recalculen.
-- Usar el botón "Recalcular todo el ranking" en /configuracion para actualizarlos.
-- (El recálculo masivo se hace desde la app, no desde SQL, para usar la lógica de TS)
