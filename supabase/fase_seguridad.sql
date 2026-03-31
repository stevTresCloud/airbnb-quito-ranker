-- ============================================================
-- Fase de Seguridad — Bloqueo de Configuración + WebAuthn
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Columnas nuevas en la tabla configuracion
-- (la tabla ya existe desde Fase 1, solo agregamos campos)

ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS pin_habilitado      boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin_hash            text,         -- hash bcrypt del PIN de 6 dígitos
  ADD COLUMN IF NOT EXISTS webauthn_habilitado boolean  DEFAULT false;

-- 2. Tabla para credenciales WebAuthn (huella / Face ID / Windows Hello)
-- Una fila por dispositivo registrado
-- En esta app single-user habrá pocas filas (1 por dispositivo del propietario)

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id           text        PRIMARY KEY,     -- credential ID en formato base64url (viene del browser)
  public_key   text        NOT NULL,        -- clave pública en base64 (guardada en servidor para verificar)
  counter      bigint      NOT NULL DEFAULT 0, -- contador anti-replay (se incrementa en cada autenticación)
  device_name  text        NOT NULL DEFAULT 'Mi dispositivo', -- nombre amigable para mostrar en UI
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo autenticado"
  ON webauthn_credentials
  USING (auth.role() = 'authenticated');
