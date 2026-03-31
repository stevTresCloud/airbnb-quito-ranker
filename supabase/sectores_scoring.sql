-- sectores_scoring.sql — Tabla de sectores con scores de ubicación para Airbnb
-- Correr en Supabase SQL Editor
--
-- Por qué tabla en lugar de hardcode:
-- - El usuario puede agregar nuevos sectores desde /configuracion/sectores
-- - Los scores son ajustables sin tocar código
-- - Los rangos de precio Airbnb sirven como referencia al ingresar proyectos

create table if not exists sectores_scoring (
  id          uuid primary key default gen_random_uuid(),
  nombre      text unique not null,           -- nombre exacto del sector (case-sensitive en búsqueda)
  zona        text,                           -- 'Centro-Norte' | 'Norte Medio' | 'Norte Lejano'
  score_base  numeric not null default 0,     -- 0-100, score de ubicación base para ranking
  grado       text,                           -- 'A' | 'B' | 'C' | 'D' (referencia visual)
  airbnb_noche_min  numeric default 0,        -- precio mínimo estimado por noche en Airbnb (USD)
  airbnb_noche_max  numeric default 0,        -- precio máximo estimado por noche en Airbnb (USD)
  arriendo_lp_min   numeric default 0,        -- arriendo largo plazo mínimo (USD/mes)
  arriendo_lp_max   numeric default 0,        -- arriendo largo plazo máximo (USD/mes)
  perfil      text,                           -- descripción corta del perfil del sector
  activo      boolean default true,           -- false = no aparece en el select de /nuevo
  orden       integer,                        -- orden de aparición en el select
  updated_at  timestamptz default now()
);

alter table sectores_scoring enable row level security;
create policy "solo autenticado" on sectores_scoring
  using (auth.role() = 'authenticated');

-- ─── Seeds — basados en quito_norte_ranking.csv + sectores del sistema original ─

-- Sectores del CSV (ordenados por score_base descendente)
insert into sectores_scoring (nombre, zona, score_base, grado, airbnb_noche_min, airbnb_noche_max, arriendo_lp_min, arriendo_lp_max, perfil, orden) values
  ('La Carolina / Iñaquito', 'Centro-Norte', 91, 'A', 38, 55,  600, 1400, 'Zona financiera y corporativa. Máxima conectividad. Parque La Carolina. Mejor acceso de todo el corredor.', 1),
  ('González Suárez',        'Centro-Norte', 90, 'A', 50, 90,  800, 2500, 'Edificios premium con vistas al valle de Guápulo. Perfil de huésped más exclusivo del corredor.', 2),
  ('El Batán Alto',          'Norte Medio',  84, 'A', 35, 60,  700, 1600, 'Casas exclusivas con jardín. Quietud residencial. Alta plusvalía histórica.', 3),
  ('Bellavista',             'Norte Medio',  78, 'B', 35, 65,  600, 1400, 'Capilla del Hombre, vistas panorámicas. Tranquilo. Requiere vehículo propio.', 4),
  ('La Floresta',            'Centro-Norte', 78, 'B', 30, 50,  450,  900, 'Bohemio, gastronómico, cultural. Alta demanda Airbnb turístico. Crecimiento constante de plusvalía.', 5),
  ('Quito Tenis',            'Norte Medio',  76, 'B', 35, 58,  600, 1500, 'Urbanizaciones exclusivas. Mucha vegetación. Requiere vehículo. Alta demanda ejecutiva.', 6),
  ('El Batán Bajo',          'Norte Medio',  75, 'B', 28, 45,  450,  900, 'Departamentos y conjuntos habitacionales. Más accesible que el Alto. Buena conectividad.', 7),
  ('Granda Centeno',         'Norte Medio',  72, 'B', 28, 45,  450,  900, 'Barrio tranquilo en crecimiento. Entre Quito Tenis y El Inca. Precio/calidad en mejora.', 8),
  ('Quito Norte (sector)',   'Norte Medio',  69, 'B', 28, 48,  500, 1100, 'Casas grandes con arquitectura exclusiva. Embajada EEUU cercana. Sin buses en todo el sector.', 9),
  ('La Mariscal',            'Centro-Norte', 68, 'B', 25, 45,  300,  700, 'Máxima demanda turística pero ruido e inseguridad nocturna. Ideal corto plazo, no para vivir.', 10),
  ('Jipijapa',               'Norte Medio',  67, 'B', 22, 38,  380,  750, 'Sector en mejora continua. Bien conectado. Buen punto de entrada para inversión moderada.', 11),
  ('El Inca',                'Norte Medio',  66, 'B', 22, 38,  380,  750, 'Clase media-alta. Tranquilo. Balanceo precio/calidad muy competitivo.', 12),
  ('El Condado',             'Norte Medio',  66, 'B', 22, 40,  400,  900, 'Urbanizaciones de clase media-alta desde los 90s. Golf Club. Lejos del centro pero exclusivo.', 13),
  ('Kennedy / La Luz',       'Norte Medio',  66, 'B', 20, 35,  350,  700, 'Clase media. Alta densidad de servicios. Sector más rentable del centro de Quito según Tamayo.', 14),
  ('Guápulo',                'Norte Medio',  60, 'C', 25, 45,  350,  700, 'Bohemio y artístico. Acceso difícil. Nicho turístico alternativo. Poca oferta inmobiliaria nueva.', 15),
  ('La Concepción / El Labrador', 'Norte Lejano', 62, 'C', 18, 30, 300, 600, 'Terminal norte del metro. Sector en valorización acelerada desde apertura del metro. A vigilar.', 16),
  ('Ponciano Alto',          'Norte Lejano', 61, 'C', 18, 30,  280,  580, 'Más residencial y tranquilo que el Bajo. Urbanizaciones cerradas. Precio accesible.', 17),
  ('San Carlos',             'Norte Lejano', 59, 'C', 18, 30,  300,  600, 'Conjuntos habitacionales coloridos. Clase media. Hospital del Adulto Mayor. Parque Inglés.', 18),
  ('Las Casas / Cochapamba', 'Norte Lejano', 58, 'C', 15, 28,  280,  550, 'Barrio de casas, clase media. Tranquilo. Acceso a Av. Occidental. Poca oferta Airbnb.', 19),
  ('Carcelén Alto',          'Norte Lejano', 57, 'C', 15, 26,  260,  520, 'Concepción original ordenada. Clase media. Hospital San Francisco, Colegio Americano.', 20),
  ('Ponciano Bajo',          'Norte Lejano', 56, 'C', 14, 24,  250,  480, 'Más comercial y denso que el Alto. Acceso a la Prensa. Precio bajo pero menor exclusividad.', 21),
  ('Cotocollao',             'Norte Lejano', 53, 'C', 13, 22,  220,  430, 'Barrio histórico y comercial. Feria de los sábados. Diverso étnicamente. Menor plusvalía.', 22),
  ('La Florida',             'Norte Lejano', 50, 'D', 12, 20,  200,  380, 'Frente al antiguo aeropuerto. Sector de riesgo. Calles solitarias. Baja demanda Airbnb.', 23),
  ('Carcelén Bajo',          'Norte Lejano', 47, 'D', 10, 18,  180,  350, 'Zona mayoritariamente industrial y comercial. Clase media-baja. Terminal interprovincial.', 24),
  ('Comité del Pueblo',      'Norte Lejano', 43, 'D',  8, 15,  150,  300, 'Problemas sociales. No recomendable para inversión inmobiliaria.', 25),

  -- Sectores del sistema original no presentes en el CSV
  ('Quicentro',       'Centro-Norte', 95, 'A', 50, 90,  800, 2500, 'Rep. Salvador / Naciones Unidas — prime, máxima demanda Airbnb ejecutiva.', 26),
  ('La Coruña',       'Centro-Norte', 88, 'A', 45, 75,  700, 1800, 'Zona alta, segura, vistas. Perfil ejecutivo y turistas internacionales.', 27),
  ('Benalcázar',      'Centro-Norte', 87, 'A', 40, 70,  650, 1600, 'Austria e Irlanda — barrio consolidado, cerca La Carolina.', 28),
  ('Guangüiltagua',   'Norte Medio',  70, 'B', 25, 40,  350,  700, 'Sector residencial. Acceso a parques. Menor demanda Airbnb que el centro-norte.', 29),

  -- Comodín para sectores sin clasificar (se crea automáticamente al ingresar "Otro")
  ('Otro', NULL, 0, NULL, 0, 0, 0, 0, 'Sector no clasificado. Editar score en /configuracion/sectores.', 99)

on conflict (nombre) do nothing;
