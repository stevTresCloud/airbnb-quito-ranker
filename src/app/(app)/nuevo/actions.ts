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
  const meses_espera = Number(formData.get('meses_espera'))
  const unidades_disponibles = formData.get('unidades_disponibles')
    ? Number(formData.get('unidades_disponibles'))
    : null
  const preferencia = formData.get('preferencia') as string | null

  // ── Resolver sector ────────────────────────────────────────────────────────
  // Si eligió "Agregar nuevo sector", usar el texto libre; si no, usar el select
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

  // ── Si el sector es nuevo, crearlo en sectores_scoring ────────────────────
  // Primero verificar si ya existe (case-insensitive) para evitar duplicados
  if (sector_select === SENTINEL_NUEVO) {
    const { data: existente } = await supabase
      .from('sectores_scoring')
      .select('nombre')
      .ilike('nombre', sector)   // ilike = case-insensitive LIKE
      .maybeSingle()

    if (existente) {
      // Ya existe con ese nombre (distinto case) → usar el nombre exacto de la DB
      sector = existente.nombre
    } else {
      // Crear nuevo sector con score=0 (el usuario lo configura después)
      await supabase.from('sectores_scoring').insert({
        nombre: sector,
        score_base: 0,
        airbnb_noche_min: 0,
        airbnb_noche_max: 0,
        activo: true,
      })
      // No fallamos si el insert falla (el proyecto igual se guarda con sector como texto libre)
    }
  }

  // ── Leer configuracion para defaults ──────────────────────────────────────
  const { data: config } = await supabase
    .from('configuracion')
    .select('*')
    .single()

  if (!config) return { ok: false, error: 'No se encontró la configuración global' }

  // ── Leer scores de sectores para el motor de scoring ──────────────────────
  const { data: sectoresDB } = await supabase
    .from('sectores_scoring')
    .select('nombre, score_base')
    .eq('activo', true)

  const scores_sectores: Record<string, number> = {}
  for (const s of sectoresDB ?? []) scores_sectores[s.nombre] = s.score_base

  // ── Leer ROI y precio_m2 de proyectos existentes para normalización ────────
  const { data: existentes } = await supabase
    .from('proyectos')
    .select('roi_anual, precio_m2')

  // ── Calcular métricas financieras ──────────────────────────────────────────
  const inputCalculos: InputCalculos = {
    precio_base,
    area_interna_m2,
    area_balcon_m2: 0,
    costo_parqueadero: 0,
    reserva: null,
    porcentaje_entrada: null,
    porcentaje_durante_construccion: null,
    num_cuotas_construccion: null,
    porcentaje_contra_entrega: null,
    tasa_anual: config.tasa_default,
    anos_credito: config.anos_credito_default,
    viene_amoblado: false,
    costo_amoblado: null,
    tiene_administracion_airbnb_incluida: false,
    porcentaje_gestion_airbnb: null,
    alicuota_mensual: 0,
    precio_noche_estimado: 0,
    ocupacion_estimada: 70,
    meses_espera,
    plusvalia_anual: 5,
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
  const { data: criterios } = await supabase
    .from('criterios_scoring')
    .select('clave, peso')
    .eq('activo', true)

  const pesos: Record<string, number> = {}
  for (const c of criterios ?? []) pesos[c.clave] = c.peso

  const todos_roi = [...(existentes ?? []).map(p => p.roi_anual ?? 0), metricas.roi_anual]
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
    confianza_subjetiva: null,
    permite_airbnb: true,
  }

  const scores = calcularScores(inputScoring, pesos, todos_roi, todos_precio_m2, scores_sectores)

  // ── Insertar en la tabla proyectos ─────────────────────────────────────────
  const { error: errorInsert } = await supabase
    .from('proyectos')
    .insert({
      nombre,
      sector,
      tipo,
      precio_base,
      area_interna_m2,
      meses_espera,
      unidades_disponibles,
      preferencia: preferencia || null,
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
  // redirect() lanza una excepción internamente en Next.js — debe estar fuera de try/catch
  redirect('/')
}
