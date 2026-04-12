-- Fase 9.7 — Walk Score subjetivo
-- Ejecutar en Supabase ANTES de desplegar los cambios de código.
--
-- Campo manual 1-5 que mide qué tan caminable es la zona del proyecto.
-- Se suma como bonus a score_ubicacion (walkability × 3, max +15 pts).
-- null = sin evaluar (no afecta el score).

alter table proyectos
  add column if not exists walkability integer;
