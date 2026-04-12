-- Fase 9.5 — Descuento sobre precio base
-- Ejecutar en Supabase ANTES de desplegar los cambios de código.
--
-- Permite registrar un descuento en dólares o porcentaje que se aplica al precio_base
-- antes de cualquier cálculo financiero. El precio_base original se preserva intacto.

-- Campo de valor del descuento (null o 0 = sin descuento)
alter table proyectos
  add column if not exists descuento_valor numeric default 0;

-- Tipo de descuento: 'monto' (USD fijo) o 'porcentaje' (% del precio_base)
alter table proyectos
  add column if not exists descuento_tipo text default 'monto';
