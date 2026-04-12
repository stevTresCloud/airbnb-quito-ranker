-- ============================================================
-- SCHEMA COMPLETO — Airbnb Quito Ranker
-- Ejecutar completo en el SQL Editor de Supabase (proyecto fresco).
-- Si la DB ya tiene datos, ejecutar solo las secciones que falten.
--
-- Historial:
--   Fase 1         — Tablas base, RLS, seeds (2026-03-29)
--   Fase 3b        — Tabla sectores_scoring + 29 sectores (2026-03-30)
--   Fase Seguridad — WebAuthn + PIN en configuracion (2026-03-30)
--   Fase 5/mejoras — score_equipamiento + préstamo amoblado (2026-04-01)
-- ============================================================


-- ============================================================
-- SECCIÓN 1: TABLA configuracion
-- Una sola fila con los valores globales de la app.
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion (
  id                                      integer PRIMARY KEY DEFAULT 1,
  sueldo_neto                             numeric DEFAULT 1400,
  porcentaje_ahorro                       numeric DEFAULT 40,
  porcentaje_gastos_airbnb                numeric DEFAULT 30,
  banco_default                           text    DEFAULT 'BIESS',
  tasa_default                            numeric DEFAULT 6.0,
  anos_credito_default                    integer DEFAULT 6,
  anos_proyeccion                         integer DEFAULT 5,
  costo_amoblado_default                  numeric DEFAULT 6000,
  seguro_mensual_default                  numeric DEFAULT 40,

  reserva_default                         numeric  DEFAULT 2000,
  porcentaje_entrada_default              numeric  DEFAULT 10,
  porcentaje_durante_construccion_default numeric  DEFAULT 20,
  num_cuotas_construccion_default         integer  DEFAULT 30,
  porcentaje_contra_entrega_default       numeric  DEFAULT 70,

  -- Fase Seguridad
  pin_habilitado      boolean DEFAULT false,
  pin_hash            text,
  webauthn_habilitado boolean DEFAULT false,

  updated_at timestamptz DEFAULT now()
);

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "solo autenticado" ON configuracion
  USING (auth.role() = 'authenticated');

-- Seed: fila única con valores por defecto
INSERT INTO configuracion (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECCIÓN 2: TABLA criterios_scoring
-- Pesos editables para el motor de ranking (8 criterios).
-- ============================================================
CREATE TABLE IF NOT EXISTS criterios_scoring (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave       text UNIQUE NOT NULL,
  nombre      text NOT NULL,
  descripcion text,
  peso        numeric NOT NULL,
  activo      boolean DEFAULT true,
  orden       integer,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE criterios_scoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "solo autenticado" ON criterios_scoring
  USING (auth.role() = 'authenticated');

-- Seed: 8 criterios (incluye 'equipamiento' de Fase 5)
-- Suma de pesos: 0.30+0.20+0.15+0.15+0.07+0.03+0.07+0.03 = 1.00
INSERT INTO criterios_scoring (clave, nombre, descripcion, peso, orden) VALUES
  ('roi',          'Rentabilidad (ROI)',  'ROI anual proyectado',                         0.30, 1),
  ('ubicacion',    'Ubicación',           'Sector, piso y orientación',                   0.20, 2),
  ('constructora', 'Constructora',        'Fiabilidad, experiencia y track record',        0.15, 3),
  ('entrega',      'Entrega',             'Fecha y meses de espera',                      0.15, 4),
  ('equipamiento', 'Equipamiento',        'Parqueadero y bodega de la unidad',            0.07, 5),
  ('precio_m2',    'Precio por m²',       'vs promedio del sector',                       0.03, 6),
  ('calidad',      'Calidad',             'Materiales y amenidades del edificio',         0.07, 7),
  ('confianza',    'Factor confianza',    'Sensación subjetiva del proyecto/vendedor',    0.03, 8)
ON CONFLICT (clave) DO NOTHING;


-- ============================================================
-- SECCIÓN 3: TABLA proyectos
-- Una fila por unidad evaluada (proyecto + tipo de unidad).
-- Incluye todos los campos añadidos hasta Fase 5.
-- ============================================================
CREATE TABLE IF NOT EXISTS proyectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Estado
  estado                text DEFAULT 'en_análisis',
  fecha_cotizacion      date,

  -- Identificación
  nombre                text NOT NULL,
  constructora          text,
  anos_constructora     integer,
  proyectos_entregados  integer,
  fiabilidad_constructora text,
  contacto_nombre       text,
  contacto_telefono     text,

  -- Ubicación
  direccion             text,
  sector                text NOT NULL,
  latitud               numeric,
  longitud              numeric,

  -- Unidad
  tipo                  text,
  area_interna_m2       numeric NOT NULL,
  area_balcon_m2        numeric DEFAULT 0,
  area_total_m2         numeric,
  dormitorios           integer DEFAULT 1,
  numero_banos          numeric DEFAULT 1,
  piso                  integer,
  pisos_totales         integer,
  unidades_totales_edificio integer,
  orientacion           text,
  materiales            text,
  tipo_cocina           text,
  tiene_balcon          boolean DEFAULT false,
  tiene_parqueadero     boolean DEFAULT false,
  costo_parqueadero     numeric DEFAULT 0,
  tiene_bodega          boolean DEFAULT false,
  tiene_zona_lavanderia boolean DEFAULT false,
  tiene_puerta_seguridad boolean DEFAULT false,
  amenidades            text[],
  unidades_disponibles  integer,
  preferencia           text,
  reconocimientos_constructora text,

  -- Factor subjetivo
  confianza_subjetiva   integer,
  walkability           integer,
  confianza_notas       text,

  -- Precio
  precio_base           numeric NOT NULL,
  descuento_valor       numeric DEFAULT 0,
  descuento_tipo        text DEFAULT 'monto',

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
  viene_amoblado        boolean DEFAULT false,
  costo_amoblado        numeric,

  -- Préstamo de amoblado (Fase 5)
  amoblado_financiado        boolean DEFAULT false,
  tasa_prestamo_amoblado     numeric DEFAULT 12,
  meses_prestamo_amoblado    integer DEFAULT 24,

  -- Airbnb
  permite_airbnb                        boolean DEFAULT true,
  tiene_administracion_airbnb_incluida  boolean DEFAULT false,
  porcentaje_gestion_airbnb             numeric,

  -- Costos fijos
  alicuota_mensual      numeric DEFAULT 0,
  seguro_mensual        numeric,

  -- Estado de obra
  avance_obra_porcentaje numeric DEFAULT 0,

  -- Ingresos Airbnb
  precio_noche_estimado numeric,
  ocupacion_estimada    numeric DEFAULT 70,

  -- Timeline
  fecha_entrega         text,
  meses_espera          integer,

  -- Apreciación
  plusvalia_anual       numeric DEFAULT 5,

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

  -- Scores de ranking (incluye score_equipamiento de Fase 5)
  score_roi           numeric,
  score_ubicacion     numeric,
  score_constructora  numeric,
  score_entrega       numeric,
  score_equipamiento  numeric,
  score_precio_m2     numeric,
  score_calidad       numeric,
  score_confianza     numeric,
  score_total         numeric,

  -- Análisis IA
  analisis_ia_generado  boolean DEFAULT false,
  auditoria_ia          text,
  fortaleza_ia          text,
  riesgo_ia             text,
  recomendacion_ia      text,
  alerta_ia             text,
  que_preguntar         text[],
  datos_faltantes       text[],

  notas       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "solo autenticado" ON proyectos
  USING (auth.role() = 'authenticated');


-- ============================================================
-- SECCIÓN 4: TABLA adjuntos
-- Archivos y links asociados a un proyecto.
-- ============================================================
CREATE TABLE IF NOT EXISTS adjuntos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid REFERENCES proyectos(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  nombre      text NOT NULL,
  storage_path text,
  url_externa  text,
  descripcion  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE adjuntos ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "solo autenticado" ON adjuntos
  USING (auth.role() = 'authenticated');


-- ============================================================
-- SECCIÓN 5: STORAGE BUCKET adjuntos-proyectos (privado)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
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
ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "acceso autenticado a adjuntos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'adjuntos-proyectos' AND auth.role() = 'authenticated');


-- ============================================================
-- SECCIÓN 6: TABLA sectores_scoring + 29 sectores (Fase 3b)
-- ============================================================
CREATE TABLE IF NOT EXISTS sectores_scoring (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text UNIQUE NOT NULL,
  zona        text,
  score_base  numeric NOT NULL DEFAULT 0,
  grado       text,
  airbnb_noche_min  numeric DEFAULT 0,
  airbnb_noche_max  numeric DEFAULT 0,
  arriendo_lp_min   numeric DEFAULT 0,
  arriendo_lp_max   numeric DEFAULT 0,
  perfil      text,
  activo      boolean DEFAULT true,
  orden       integer,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE sectores_scoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "solo autenticado" ON sectores_scoring
  USING (auth.role() = 'authenticated');

-- Seed: 29 sectores de Quito Norte ordenados por score_base
INSERT INTO sectores_scoring (nombre, zona, score_base, grado, airbnb_noche_min, airbnb_noche_max, arriendo_lp_min, arriendo_lp_max, perfil, orden) VALUES
  ('Quicentro',                 'Centro-Norte', 95, 'A', 50, 90,  800, 2500, 'Rep. Salvador / Naciones Unidas — prime, máxima demanda Airbnb ejecutiva.', 1),
  ('La Carolina / Iñaquito',    'Centro-Norte', 91, 'A', 38, 55,  600, 1400, 'Zona financiera y corporativa. Máxima conectividad. Parque La Carolina. Mejor acceso de todo el corredor.', 2),
  ('González Suárez',           'Centro-Norte', 90, 'A', 50, 90,  800, 2500, 'Edificios premium con vistas al valle de Guápulo. Perfil de huésped más exclusivo del corredor.', 3),
  ('La Coruña',                 'Centro-Norte', 88, 'A', 45, 75,  700, 1800, 'Zona alta, segura, vistas. Perfil ejecutivo y turistas internacionales.', 4),
  ('Benalcázar',                'Centro-Norte', 87, 'A', 40, 70,  650, 1600, 'Austria e Irlanda — barrio consolidado, cerca La Carolina.', 5),
  ('El Batán Alto',             'Norte Medio',  84, 'A', 35, 60,  700, 1600, 'Casas exclusivas con jardín. Quietud residencial. Alta plusvalía histórica.', 6),
  ('Bellavista',                'Norte Medio',  78, 'B', 35, 65,  600, 1400, 'Capilla del Hombre, vistas panorámicas. Tranquilo. Requiere vehículo propio.', 7),
  ('La Floresta',               'Centro-Norte', 78, 'B', 30, 50,  450,  900, 'Bohemio, gastronómico, cultural. Alta demanda Airbnb turístico. Crecimiento constante de plusvalía.', 8),
  ('Quito Tenis',               'Norte Medio',  76, 'B', 35, 58,  600, 1500, 'Urbanizaciones exclusivas. Mucha vegetación. Requiere vehículo. Alta demanda ejecutiva.', 9),
  ('El Batán Bajo',             'Norte Medio',  75, 'B', 28, 45,  450,  900, 'Departamentos y conjuntos habitacionales. Más accesible que el Alto. Buena conectividad.', 10),
  ('Granda Centeno',            'Norte Medio',  72, 'B', 28, 45,  450,  900, 'Barrio tranquilo en crecimiento. Entre Quito Tenis y El Inca. Precio/calidad en mejora.', 11),
  ('Guangüiltagua',             'Norte Medio',  70, 'B', 25, 40,  350,  700, 'Sector residencial. Acceso a parques. Menor demanda Airbnb que el centro-norte.', 12),
  ('Quito Norte (sector)',      'Norte Medio',  69, 'B', 28, 48,  500, 1100, 'Casas grandes con arquitectura exclusiva. Embajada EEUU cercana. Sin buses en todo el sector.', 13),
  ('La Mariscal',               'Centro-Norte', 68, 'B', 25, 45,  300,  700, 'Máxima demanda turística pero ruido e inseguridad nocturna. Ideal corto plazo, no para vivir.', 14),
  ('Jipijapa',                  'Norte Medio',  67, 'B', 22, 38,  380,  750, 'Sector en mejora continua. Bien conectado. Buen punto de entrada para inversión moderada.', 15),
  ('El Inca',                   'Norte Medio',  66, 'B', 22, 38,  380,  750, 'Clase media-alta. Tranquilo. Balanceo precio/calidad muy competitivo.', 16),
  ('El Condado',                'Norte Medio',  66, 'B', 22, 40,  400,  900, 'Urbanizaciones de clase media-alta desde los 90s. Golf Club. Lejos del centro pero exclusivo.', 17),
  ('Kennedy / La Luz',          'Norte Medio',  66, 'B', 20, 35,  350,  700, 'Clase media. Alta densidad de servicios. Sector más rentable del centro de Quito según Tamayo.', 18),
  ('Guápulo',                   'Norte Medio',  60, 'C', 25, 45,  350,  700, 'Bohemio y artístico. Acceso difícil. Nicho turístico alternativo. Poca oferta inmobiliaria nueva.', 19),
  ('La Concepción / El Labrador','Norte Lejano', 62, 'C', 18, 30,  300,  600, 'Terminal norte del metro. Sector en valorización acelerada desde apertura del metro. A vigilar.', 20),
  ('Ponciano Alto',             'Norte Lejano', 61, 'C', 18, 30,  280,  580, 'Más residencial y tranquilo que el Bajo. Urbanizaciones cerradas. Precio accesible.', 21),
  ('San Carlos',                'Norte Lejano', 59, 'C', 18, 30,  300,  600, 'Conjuntos habitacionales coloridos. Clase media. Hospital del Adulto Mayor. Parque Inglés.', 22),
  ('Las Casas / Cochapamba',    'Norte Lejano', 58, 'C', 15, 28,  280,  550, 'Barrio de casas, clase media. Tranquilo. Acceso a Av. Occidental. Poca oferta Airbnb.', 23),
  ('Carcelén Alto',             'Norte Lejano', 57, 'C', 15, 26,  260,  520, 'Concepción original ordenada. Clase media. Hospital San Francisco, Colegio Americano.', 24),
  ('Ponciano Bajo',             'Norte Lejano', 56, 'C', 14, 24,  250,  480, 'Más comercial y denso que el Alto. Acceso a la Prensa. Precio bajo pero menor exclusividad.', 25),
  ('Cotocollao',                'Norte Lejano', 53, 'C', 13, 22,  220,  430, 'Barrio histórico y comercial. Feria de los sábados. Diverso étnicamente. Menor plusvalía.', 26),
  ('La Florida',                'Norte Lejano', 50, 'D', 12, 20,  200,  380, 'Frente al antiguo aeropuerto. Sector de riesgo. Calles solitarias. Baja demanda Airbnb.', 27),
  ('Carcelén Bajo',             'Norte Lejano', 47, 'D', 10, 18,  180,  350, 'Zona mayoritariamente industrial y comercial. Clase media-baja. Terminal interprovincial.', 28),
  ('Comité del Pueblo',         'Norte Lejano', 43, 'D',  8, 15,  150,  300, 'Problemas sociales. No recomendable para inversión inmobiliaria.', 29),
  -- Comodín para sectores sin clasificar
  ('Otro', NULL, 0, NULL, 0, 0, 0, 0, 'Sector no clasificado. Editar score en /configuracion/sectores.', 99)
ON CONFLICT (nombre) DO NOTHING;


-- ============================================================
-- SECCIÓN 7: TABLA webauthn_credentials (Fase Seguridad)
-- ============================================================
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id           text        PRIMARY KEY,
  public_key   text        NOT NULL,
  counter      bigint      NOT NULL DEFAULT 0,
  device_name  text        NOT NULL DEFAULT 'Mi dispositivo',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "solo autenticado" ON webauthn_credentials
  USING (auth.role() = 'authenticated');


-- ============================================================
-- Verificación final
-- ============================================================
SELECT 'configuracion'       AS tabla, COUNT(*) FROM configuracion
UNION ALL
SELECT 'criterios_scoring',           COUNT(*) FROM criterios_scoring
UNION ALL
SELECT 'proyectos',                   COUNT(*) FROM proyectos
UNION ALL
SELECT 'adjuntos',                    COUNT(*) FROM adjuntos
UNION ALL
SELECT 'sectores_scoring',            COUNT(*) FROM sectores_scoring
UNION ALL
SELECT 'webauthn_credentials',        COUNT(*) FROM webauthn_credentials;
