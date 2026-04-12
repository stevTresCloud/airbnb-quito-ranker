-- Fase 9 (Paso A) — Campo de auditoría de realismo en análisis IA
-- Ejecutar en Supabase ANTES de desplegar los cambios de código.
--
-- Almacena el resultado de la auditoría que el AI hace al cruzar los datos
-- ingresados contra los benchmarks del sector y la ubicación real.

alter table proyectos
  add column if not exists auditoria_ia text;
