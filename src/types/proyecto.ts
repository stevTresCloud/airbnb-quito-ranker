// types/proyecto.ts — Tipos para calculos.ts y scoring.ts
// Estas interfaces representan los datos que necesitan las funciones puras de lib/.
// Son independientes del schema de Supabase (que tiene muchos más campos opcionales).

// ─── Input para calculos.ts ────────────────────────────────────────────────────

export interface InputCalculos {
  // De la fila de proyecto
  precio_base: number
  area_interna_m2: number
  area_balcon_m2: number
  costo_parqueadero: number

  // Estructura de pago — null significa "usar el default de configuracion"
  reserva: number | null
  porcentaje_entrada: number | null
  porcentaje_durante_construccion: number | null
  num_cuotas_construccion: number | null
  porcentaje_contra_entrega: number | null

  // Financiamiento bancario
  tasa_anual: number          // 0 = sin interés (financiamiento directo)
  anos_credito: number

  // Amoblamiento
  viene_amoblado: boolean
  costo_amoblado: number | null

  // Airbnb
  tiene_administracion_airbnb_incluida: boolean
  porcentaje_gestion_airbnb: number | null
  alicuota_mensual: number
  precio_noche_estimado: number
  ocupacion_estimada: number   // 0-100

  // Timeline y proyección
  meses_espera: number
  plusvalia_anual: number      // % anual

  // Defaults de configuracion (los campos null del proyecto toman estos valores)
  reserva_default: number
  porcentaje_entrada_default: number
  porcentaje_durante_construccion_default: number
  num_cuotas_construccion_default: number
  porcentaje_contra_entrega_default: number
  sueldo_neto: number
  porcentaje_ahorro: number
  porcentaje_gastos_airbnb: number
  costo_amoblado_default: number
  anos_proyeccion: number
}

// ─── Output de calculos.ts ─────────────────────────────────────────────────────

export interface MetricasCalculadas {
  // Precio y área
  area_total_m2: number
  precio_total: number
  precio_m2: number

  // Estructura de pago resuelta (con defaults aplicados)
  reserva_efectiva: number
  pct_entrada: number
  pct_durante: number
  pct_contra: number
  num_cuotas: number
  monto_entrada_total: number
  monto_durante_total: number
  monto_financiar: number
  pago_entrada_neto: number
  cuota_construccion: number

  // Amoblamiento
  costo_amoblado_efectivo: number

  // Financiamiento
  cuota_mensual: number
  total_pagado_credito: number
  total_intereses: number

  // Airbnb
  ingreso_bruto_mensual: number
  gastos_operativos: number
  ingreso_neto_mensual: number

  // Flujo mensual
  sueldo_disponible: number
  flujo_sin_airbnb: number
  flujo_con_airbnb: number
  cobertura_sin_airbnb: number
  cobertura_con_airbnb: number

  // Proyección a N años
  meses_productivos: number
  airbnb_acumulado: number
  plusvalia_acumulada: number
  ganancia_bruta: number
  ganancia_neta: number

  // ROI
  aporte_propio_total: number
  roi_anual: number
  roi_aporte_propio: number
}

// ─── Input para scoring.ts ─────────────────────────────────────────────────────

export interface InputScoring {
  // Métricas financieras (calculadas antes por calculos.ts)
  roi_anual: number
  precio_m2: number

  // Ubicación
  sector: string
  piso: number | null
  orientacion: string | null

  // Constructora
  fiabilidad_constructora: string | null
  anos_constructora: number | null
  proyectos_entregados: number | null
  reconocimientos_constructora: string | null

  // Entrega
  meses_espera: number

  // Calidad
  materiales: string | null
  amenidades: string[]
  tiene_balcon: boolean
  tipo_cocina: string | null
  numero_banos: number
  tiene_zona_lavanderia: boolean
  tiene_puerta_seguridad: boolean
  viene_amoblado: boolean
  tiene_administracion_airbnb_incluida: boolean
  unidades_totales_edificio: number | null
  avance_obra_porcentaje: number

  // Confianza subjetiva
  confianza_subjetiva: number | null

  // Regla especial: si false → score_total = 0
  permite_airbnb: boolean
}

// ─── Output de scoring.ts ──────────────────────────────────────────────────────

export interface ScoresCalculados {
  score_roi: number
  score_ubicacion: number
  score_constructora: number
  score_entrega: number
  score_precio_m2: number
  score_calidad: number
  score_confianza: number
  score_total: number
}

// ─── Tipo para pesos de criterios (viene de la tabla criterios_scoring) ────────

export type PesosCriterios = Record<string, number>
// Ej: { roi: 0.30, ubicacion: 0.20, constructora: 0.15, ... }

// ─── Sector con datos para el select de /nuevo ────────────────────────────────
// Subconjunto de la tabla sectores_scoring que necesita el formulario.

export interface SectorOption {
  nombre: string
  score_base: number
  airbnb_noche_min: number
  airbnb_noche_max: number
  perfil: string | null
}
