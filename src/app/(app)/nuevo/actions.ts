'use server'
// Server Actions para /nuevo — guardar un proyecto con sus métricas calculadas

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase'
import { calcularMetricas } from '@/lib/calculos'
import { calcularScores } from '@/lib/scoring'
import type { InputCalculos, InputScoring } from '@/types/proyecto'
import { TIPOS } from './data'

export type GuardarProyectoState = { ok: boolean; error?: string } | null

const SENTINEL_NUEVO = '__nuevo__'

// Calcula meses entre hoy y la fecha de entrega.
// Si la fecha ya pasó, devuelve 0.
function mesesDesdeHoy(fechaISO: string): number {
  const hoy = new Date()
  const entrega = new Date(fechaISO)
  const diffMs = entrega.getTime() - hoy.getTime()
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
}

export async function guardarProyecto(
  _prevState: GuardarProyectoState,
  formData: FormData
): Promise<GuardarProyectoState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  // ── Leer campos del formulario ─────────────────────────────────────────────
  const nombre = (formData.get('nombre') as string | null)?.trim()
  const sector_select = formData.get('sector_select') as string | null
  const sector_nuevo_raw = (formData.get('sector_nuevo') as string | null)?.trim()
  const tipo = formData.get('tipo') as string | null
  const precio_base = Number(formData.get('precio_base'))
  const area_interna_m2 = Number(formData.get('area_interna_m2'))

  // fecha_entrega tiene prioridad; si no hay fecha, se acepta meses manual
  const fecha_entrega_raw = (formData.get('fecha_entrega') as string | null)?.trim() || null
  const meses_espera_manual = formData.get('meses_espera')
    ? Number(formData.get('meses_espera'))
    : null

  const meses_espera = fecha_entrega_raw
    ? mesesDesdeHoy(fecha_entrega_raw)
    : (meses_espera_manual ?? 0)

  const unidades_disponibles = formData.get('unidades_disponibles')
    ? Number(formData.get('unidades_disponibles'))
    : null
  const preferencia = formData.get('preferencia') as string | null

  // ── Resolver sector ────────────────────────────────────────────────────────
  let sector: string
  if (sector_select === SENTINEL_NUEVO) {
    if (!sector_nuevo_raw) return { ok: false, error: 'Escribe el nombre del nuevo sector' }
    sector = sector_nuevo_raw
  } else {
    sector = sector_select ?? ''
  }

  // Validaciones básicas
  if (!nombre) return { ok: false, error: 'El nombre es obligatorio' }
  if (!sector) return { ok: false, error: 'El sector es obligatorio' }
  if (!tipo) return { ok: false, error: 'El tipo de unidad es obligatorio' }
  if (!precio_base || precio_base <= 0) return { ok: false, error: 'El precio debe ser mayor a 0' }
  if (!area_interna_m2 || area_interna_m2 <= 0) return { ok: false, error: 'El área debe ser mayor a 0' }
  if (!fecha_entrega_raw && meses_espera_manual === null)
    return { ok: false, error: 'Ingresa la fecha de entrega o los meses aproximados' }

  // ── Si el sector es nuevo, crearlo en sectores_scoring ────────────────────
  if (sector_select === SENTINEL_NUEVO) {
    const { data: existente } = await supabase
      .from('sectores_scoring')
      .select('nombre')
      .ilike('nombre', sector)
      .maybeSingle()

    if (existente) {
      sector = existente.nombre
    } else {
      await supabase.from('sectores_scoring').insert({
        nombre: sector,
        score_base: 0,
        airbnb_noche_min: 0,
        airbnb_noche_max: 0,
        plusvalia_anual_estimada: 5,
        activo: true,
      })
    }
  }

  // ── Leer configuracion + sector en paralelo ────────────────────────────────
  const [{ data: config }, { data: sectorData }, { data: sectoresDB }, { data: existentes }, { data: criterios }] =
    await Promise.all([
      supabase.from('configuracion').select('*').single(),
      supabase.from('sectores_scoring').select('score_base, plusvalia_anual_estimada, airbnb_noche_min, airbnb_noche_max').ilike('nombre', sector).maybeSingle(),
      supabase.from('sectores_scoring').select('nombre, score_base').eq('activo', true),
      supabase.from('proyectos').select('roi_anual, precio_m2'),
      supabase.from('criterios_scoring').select('clave, peso').eq('activo', true),
    ])

  if (!config) return { ok: false, error: 'No se encontró la configuración global' }

  // ── Copiar TODOS los defaults de config al registro (no quedan null) ───────
  // Cada proyecto tiene condiciones fijas negociadas. Si el config cambia después,
  // los proyectos existentes conservan los valores con los que fueron evaluados.
  const reserva = config.reserva_default
  const porcentaje_entrada = config.porcentaje_entrada_default
  const porcentaje_durante_construccion = config.porcentaje_durante_construccion_default
  const num_cuotas_construccion = config.num_cuotas_construccion_default
  const porcentaje_contra_entrega = config.porcentaje_contra_entrega_default
  const tasa_anual = config.tasa_default
  const anos_credito = config.anos_credito_default
  const banco = config.banco_default
  const costo_amoblado = config.costo_amoblado_default

  // Plusvalía: viene del sector seleccionado (datos reales del CSV), default 5%
  const plusvalia_anual = sectorData?.plusvalia_anual_estimada ?? 5

  // Precio/noche estimado: promedio del rango Airbnb del sector (0 si el sector aún no tiene datos)
  const precio_noche_estimado = sectorData && (sectorData.airbnb_noche_max ?? 0) > 0
    ? Math.round(((sectorData.airbnb_noche_min ?? 0) + (sectorData.airbnb_noche_max ?? 0)) / 2)
    : 0

  // ── Construir scores_sectores ──────────────────────────────────────────────
  const scores_sectores: Record<string, number> = {}
  for (const s of sectoresDB ?? []) scores_sectores[s.nombre] = s.score_base

  // ── Calcular métricas financieras ──────────────────────────────────────────
  const inputCalculos: InputCalculos = {
    precio_base,
    area_interna_m2,
    area_balcon_m2: 0,
    costo_parqueadero: 0,
    reserva,
    porcentaje_entrada,
    porcentaje_durante_construccion,
    num_cuotas_construccion,
    porcentaje_contra_entrega,
    tasa_anual,
    anos_credito,
    viene_amoblado: false,
    costo_amoblado,
    amoblado_financiado: false,
    tasa_prestamo_amoblado: 12,
    meses_prestamo_amoblado: 24,
    tiene_administracion_airbnb_incluida: false,
    porcentaje_gestion_airbnb: null,
    alicuota_mensual: 0,
    precio_noche_estimado,
    ocupacion_estimada: 70,
    meses_espera,
    plusvalia_anual,
    // defaults de config (usados como fallback si algún campo es null)
    reserva_default: config.reserva_default,
    porcentaje_entrada_default: config.porcentaje_entrada_default,
    porcentaje_durante_construccion_default: config.porcentaje_durante_construccion_default,
    num_cuotas_construccion_default: config.num_cuotas_construccion_default,
    porcentaje_contra_entrega_default: config.porcentaje_contra_entrega_default,
    sueldo_neto: config.sueldo_neto,
    porcentaje_ahorro: config.porcentaje_ahorro,
    porcentaje_gastos_airbnb: config.porcentaje_gastos_airbnb,
    costo_amoblado_default: config.costo_amoblado_default,
    anos_proyeccion: config.anos_proyeccion,
  }

  const metricas = calcularMetricas(inputCalculos)

  // ── Calcular scores ────────────────────────────────────────────────────────
  const pesos: Record<string, number> = {}
  for (const c of criterios ?? []) pesos[c.clave] = c.peso

  const todos_precio_m2 = [...(existentes ?? []).map(p => p.precio_m2 ?? 0), metricas.precio_m2]

  const inputScoring: InputScoring = {
    roi_anual: metricas.roi_anual,
    precio_m2: metricas.precio_m2,
    sector,
    piso: null,
    orientacion: null,
    fiabilidad_constructora: null,
    anos_constructora: null,
    proyectos_entregados: null,
    reconocimientos_constructora: null,
    meses_espera,
    materiales: null,
    amenidades: [],
    tiene_balcon: false,
    tipo_cocina: null,
    numero_banos: 1,
    tiene_zona_lavanderia: false,
    tiene_puerta_seguridad: false,
    viene_amoblado: false,
    tiene_administracion_airbnb_incluida: false,
    unidades_totales_edificio: null,
    avance_obra_porcentaje: 0,
    tiene_parqueadero: false,
    tiene_bodega: false,
    confianza_subjetiva: null,
    permite_airbnb: true,
  }

  const scores = calcularScores(inputScoring, pesos, todos_precio_m2, scores_sectores)

  // ── Insertar en la tabla proyectos ─────────────────────────────────────────
  const { error: errorInsert } = await supabase
    .from('proyectos')
    .insert({
      nombre,
      sector,
      tipo,
      precio_base,
      area_interna_m2,
      fecha_entrega: fecha_entrega_raw ?? null,
      meses_espera,
      unidades_disponibles,
      preferencia: preferencia || null,
      plusvalia_anual,
      precio_noche_estimado,
      // Estructura de pago — copiada de config (no quedan null)
      reserva,
      porcentaje_entrada,
      porcentaje_durante_construccion,
      num_cuotas_construccion,
      porcentaje_contra_entrega,
      tasa_anual,
      anos_credito,
      banco,
      costo_amoblado,
      // Métricas calculadas
      area_total_m2: metricas.area_total_m2,
      precio_total: metricas.precio_total,
      precio_m2: metricas.precio_m2,
      monto_financiar: metricas.monto_financiar,
      cuota_mensual: metricas.cuota_mensual,
      total_intereses: metricas.total_intereses,
      total_pagado_credito: metricas.total_pagado_credito,
      ingreso_bruto_mensual: metricas.ingreso_bruto_mensual,
      gastos_operativos: metricas.gastos_operativos,
      ingreso_neto_mensual: metricas.ingreso_neto_mensual,
      sueldo_disponible: metricas.sueldo_disponible,
      flujo_sin_airbnb: metricas.flujo_sin_airbnb,
      flujo_con_airbnb: metricas.flujo_con_airbnb,
      cobertura_sin_airbnb: metricas.cobertura_sin_airbnb,
      cobertura_con_airbnb: metricas.cobertura_con_airbnb,
      meses_productivos: metricas.meses_productivos,
      airbnb_acumulado: metricas.airbnb_acumulado,
      plusvalia_acumulada: metricas.plusvalia_acumulada,
      ganancia_bruta: metricas.ganancia_bruta,
      ganancia_neta: metricas.ganancia_neta,
      roi_anual: metricas.roi_anual,
      roi_aporte_propio: metricas.roi_aporte_propio,
      score_roi: scores.score_roi,
      score_ubicacion: scores.score_ubicacion,
      score_constructora: scores.score_constructora,
      score_entrega: scores.score_entrega,
      score_equipamiento: scores.score_equipamiento,
      score_precio_m2: scores.score_precio_m2,
      score_calidad: scores.score_calidad,
      score_confianza: scores.score_confianza,
      score_total: scores.score_total,
    })
    .select('id')
    .single()

  if (errorInsert) return { ok: false, error: errorInsert.message }

  revalidatePath('/')
  revalidatePath('/configuracion/sectores')
  redirect('/')
}
