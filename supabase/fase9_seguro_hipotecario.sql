-- Fase 9.4 — Costo fijo de seguro hipotecario
-- Ejecutar en Supabase ANTES de desplegar los cambios de código.
--
-- Agrega un campo de seguro mensual obligatorio para préstamos hipotecarios.
-- El seguro se suma a la obligación mensual (cuota banco + alícuota + amoblado + seguro).
-- Valor por defecto: $40 (configurable globalmente y por proyecto).

-- 1. Default global en configuracion
alter table configuracion
  add column if not exists seguro_mensual_default numeric not null default 40;

-- 2. Campo por proyecto (null = usa el default de configuracion)
alter table proyectos
  add column if not exists seguro_mensual numeric;
