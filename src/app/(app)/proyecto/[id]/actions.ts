'use server'
// Server Actions para /proyecto/[id]
//
// Todas las mutaciones del detalle de unidad pasan por aquí:
//   guardarEdicion   → UPDATE de todos los campos + recálculo
//   recalcularUnidad → solo recalcula métricas + scores (sin tocar campos editables)
//   analizarConIA    → llama a Claude API y guarda análisis narrativo
//   subirAdjunto     → sube archivo a Supabase Storage e inserta en tabla adjuntos
//   eliminarAdjunto  → borra de Storage y de la tabla adjuntos
//   eliminarProyecto → DELETE cascade (borra proyecto + adjuntos de DB y Storage)

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import { calcularMetricas } from '@/lib/calculos'
import { calcularScores } from '@/lib/scoring'
import type { InputCalculos, InputScoring } from '@/types/proyecto'
import Anthropic from '@anthropic-ai/sdk'

export type ActionState = { ok: boolean; error?: string; mensaje?: string } | null

// Calcula meses entre hoy y una fecha ISO (date string). Devuelve 0 si ya pasó.
function mesesDesdeHoy(fechaISO: string): number {
  const hoy = new Date()
  const entrega = new Date(fechaISO)
  const diffMs = entrega.getTime() - hoy.getTime()
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
}

// ─── Helper: construir InputCalculos desde un objeto de campos + config ───────
// Usado tanto en guardarEdicion (viene del form) como en recalcularUnidad (viene de DB)
function buildInputCalculos(
  p: Record<string, unknown>,
  config: Record<string, unknown>
): InputCalculos {
  const n = (k: string, def = 0) => (p[k] as number | null) ?? def
  const nb = (k: string) => (p[k] as number | null) ?? null

  return {
    precio_base:                          n('precio_base'),
    area_interna_m2:                      n('area_interna_m2'),
    area_balcon_m2:                       n('area_balcon_m2'),
    costo_parqueadero:                    n('costo_parqueadero'),
    reserva:                              nb('reserva'),
    porcentaje_entrada:                   nb('porcentaje_entrada'),
    porcentaje_durante_construccion:      nb('porcentaje_durante_construccion'),
    num_cuotas_construccion:              nb('num_cuotas_construccion'),
    porcentaje_contra_entrega:            nb('porcentaje_contra_entrega'),
    tasa_anual:                           n('tasa_anual', config.tasa_default as number),
    anos_credito:                         n('anos_credito', config.anos_credito_default as number),
    viene_amoblado:                       (p['viene_amoblado'] as boolean) ?? false,
    costo_amoblado:                       nb('costo_amoblado'),
    amoblado_financiado:                  (p['amoblado_financiado'] as boolean) ?? false,
    tasa_prestamo_amoblado:               n('tasa_prestamo_amoblado', 12),
    meses_prestamo_amoblado:              n('meses_prestamo_amoblado', 24),
    tiene_administracion_airbnb_incluida: (p['tiene_administracion_airbnb_incluida'] as boolean) ?? false,
    porcentaje_gestion_airbnb:            nb('porcentaje_gestion_airbnb'),
    alicuota_mensual:                     n('alicuota_mensual'),
    precio_noche_estimado:                n('precio_noche_estimado'),
    ocupacion_estimada:                   n('ocupacion_estimada', 70),
    meses_espera:                         n('meses_espera'),
    plusvalia_anual:                      n('plusvalia_anual', 5),
    // Defaults de configuracion
    reserva_default:                         config.reserva_default                         as number,
    porcentaje_entrada_default:              config.porcentaje_entrada_default              as number,
    porcentaje_durante_construccion_default: config.porcentaje_durante_construccion_default as number,
    num_cuotas_construccion_default:         config.num_cuotas_construccion_default         as number,
    porcentaje_contra_entrega_default:       config.porcentaje_contra_entrega_default       as number,
    sueldo_neto:                             config.sueldo_neto                             as number,
    porcentaje_ahorro:                       config.porcentaje_ahorro                       as number,
    porcentaje_gastos_airbnb:                config.porcentaje_gastos_airbnb                as number,
    costo_amoblado_default:                  config.costo_amoblado_default                  as number,
    anos_proyeccion:                         config.anos_proyeccion                         as number,
  }
}

// ─── Helper: construir InputScoring desde un objeto de campos + métricas ──────
function buildInputScoring(p: Record<string, unknown>, roi: number, precioM2: number): InputScoring {
  return {
    roi_anual:                            roi,
    precio_m2:                            precioM2,
    sector:                               (p['sector'] as string) ?? '',
    piso:                                 (p['piso'] as number | null) ?? null,
    orientacion:                          (p['orientacion'] as string | null) ?? null,
    fiabilidad_constructora:              (p['fiabilidad_constructora'] as string | null) ?? null,
    anos_constructora:                    (p['anos_constructora'] as number | null) ?? null,
    proyectos_entregados:                 (p['proyectos_entregados'] as number | null) ?? null,
    reconocimientos_constructora:         (p['reconocimientos_constructora'] as string | null) ?? null,
    meses_espera:                         (p['meses_espera'] as number) ?? 0,
    materiales:                           (p['materiales'] as string | null) ?? null,
    amenidades:                           (p['amenidades'] as string[]) ?? [],
    tiene_balcon:                         (p['tiene_balcon'] as boolean) ?? false,
    tipo_cocina:                          (p['tipo_cocina'] as string | null) ?? null,
    numero_banos:                         (p['numero_banos'] as number) ?? 1,
    tiene_zona_lavanderia:                (p['tiene_zona_lavanderia'] as boolean) ?? false,
    tiene_puerta_seguridad:               (p['tiene_puerta_seguridad'] as boolean) ?? false,
    viene_amoblado:                       (p['viene_amoblado'] as boolean) ?? false,
    tiene_administracion_airbnb_incluida: (p['tiene_administracion_airbnb_incluida'] as boolean) ?? false,
    unidades_totales_edificio:            (p['unidades_totales_edificio'] as number | null) ?? null,
    avance_obra_porcentaje:               (p['avance_obra_porcentaje'] as number) ?? 0,
    tiene_parqueadero:                    (p['tiene_parqueadero'] as boolean) ?? false,
    tiene_bodega:                         (p['tiene_bodega'] as boolean) ?? false,
    confianza_subjetiva:                  (p['confianza_subjetiva'] as number | null) ?? null,
    permite_airbnb:                       (p['permite_airbnb'] as boolean) ?? true,
  }
}

// ─── Helper: leer config + criterios + sectores + existentes para scoring ─────
async function leerContextoScoring(supabase: Awaited<ReturnType<typeof createSupabaseServer>>, excluirId?: string) {
  const [{ data: config }, { data: criterios }, { data: sectoresDB }, { data: existentes }] =
    await Promise.all([
      supabase.from('configuracion').select('*').single(),
      supabase.from('criterios_scoring').select('clave, peso').eq('activo', true),
      supabase.from('sectores_scoring').select('nombre, score_base').eq('activo', true),
      excluirId
        ? supabase.from('proyectos').select('roi_anual, precio_m2').neq('id', excluirId)
        : supabase.from('proyectos').select('roi_anual, precio_m2'),
    ])

  const pesos: Record<string, number> = {}
  for (const c of criterios ?? []) pesos[c.clave] = c.peso

  const scores_sectores: Record<string, number> = {}
  for (const s of sectoresDB ?? []) scores_sectores[s.nombre] = s.score_base

  return { config, pesos, scores_sectores, existentes: existentes ?? [] }
}

// ─── Helper: montar el UPDATE de métricas calculadas ──────────────────────────
// Devuelve el objeto listo para hacer .update() en Supabase con todos los calculados
function metricasUpdate(m: ReturnType<typeof calcularMetricas>, s: ReturnType<typeof calcularScores>) {
  return {
    area_total_m2:          m.area_total_m2,
    precio_total:           m.precio_total,
    precio_m2:              m.precio_m2,
    monto_entrada:          m.monto_entrada_total,
    monto_durante_construccion: m.monto_durante_total,
    monto_contra_entrega:   m.monto_financiar,
    monto_financiar:        m.monto_financiar,
    cuota_mensual:          m.cuota_mensual,
    total_intereses:        m.total_intereses,
    total_pagado_credito:   m.total_pagado_credito,
    ingreso_bruto_mensual:  m.ingreso_bruto_mensual,
    gastos_operativos:      m.gastos_operativos,
    ingreso_neto_mensual:   m.ingreso_neto_mensual,
    sueldo_disponible:      m.sueldo_disponible,
    flujo_sin_airbnb:       m.flujo_sin_airbnb,
    flujo_con_airbnb:       m.flujo_con_airbnb,
    cobertura_sin_airbnb:   m.cobertura_sin_airbnb,
    cobertura_con_airbnb:   m.cobertura_con_airbnb,
    meses_productivos:      m.meses_productivos,
    airbnb_acumulado:       m.airbnb_acumulado,
    plusvalia_acumulada:    m.plusvalia_acumulada,
    ganancia_bruta:         m.ganancia_bruta,
    ganancia_neta:          m.ganancia_neta,
    roi_anual:              m.roi_anual,
    roi_aporte_propio:      m.roi_aporte_propio,
    score_roi:              s.score_roi,
    score_ubicacion:        s.score_ubicacion,
    score_constructora:     s.score_constructora,
    score_entrega:          s.score_entrega,
    score_equipamiento:     s.score_equipamiento,
    score_precio_m2:        s.score_precio_m2,
    score_calidad:          s.score_calidad,
    score_confianza:        s.score_confianza,
    score_total:            s.score_total,
    updated_at:             new Date().toISOString(),
  }
}

// ─── 1. guardarEdicion ────────────────────────────────────────────────────────
// Actualiza todos los campos del proyecto Y recalcula métricas + scores.
// .bind(null, id) se usa en el componente para que solo queden (state, formData).
export async function guardarEdicion(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  // Helpers locales para leer FormData
  // num → número o null si vacío; numDef → número o default; str → string o null; bool → checkbox
  const num  = (k: string) => { const v = formData.get(k); return v !== null && v !== '' ? Number(v) : null }
  const numDef = (k: string, d: number) => num(k) ?? d
  const str  = (k: string) => { const v = (formData.get(k) as string | null)?.trim(); return v || null }
  const bool = (k: string) => formData.get(k) === 'on'
  const strs = (k: string) => formData.getAll(k) as string[]

  // Campos obligatorios
  const nombre         = str('nombre')
  const sector         = str('sector')
  const tipo           = str('tipo')
  const precio_base    = num('precio_base')
  const area_interna   = num('area_interna_m2')

  if (!nombre)                       return { ok: false, error: 'El nombre es obligatorio' }
  if (!sector)                       return { ok: false, error: 'El sector es obligatorio' }
  if (!precio_base || precio_base <= 0) return { ok: false, error: 'El precio debe ser mayor a 0' }
  if (!area_interna || area_interna <= 0) return { ok: false, error: 'El área debe ser mayor a 0' }

  // Objeto con todos los campos editables del formulario
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campos: Record<string, any> = {
    // Identificación
    nombre,
    constructora:               str('constructora'),
    anos_constructora:          num('anos_constructora'),
    proyectos_entregados:       num('proyectos_entregados'),
    fiabilidad_constructora:    str('fiabilidad_constructora'),
    contacto_nombre:            str('contacto_nombre'),
    contacto_telefono:          str('contacto_telefono'),
    reconocimientos_constructora: str('reconocimientos_constructora'),
    // Estado
    estado:                     str('estado') ?? 'en_análisis',
    fecha_cotizacion:           str('fecha_cotizacion'),
    // Ubicación
    direccion:                  str('direccion'),
    sector,
    latitud:                    num('latitud'),
    longitud:                   num('longitud'),
    // Unidad
    tipo,
    area_interna_m2:            area_interna,
    area_balcon_m2:             numDef('area_balcon_m2', 0),
    dormitorios:                numDef('dormitorios', 1),
    numero_banos:               numDef('numero_banos', 1),
    piso:                       num('piso'),
    pisos_totales:              num('pisos_totales'),
    unidades_totales_edificio:  num('unidades_totales_edificio'),
    orientacion:                str('orientacion'),
    materiales:                 str('materiales'),
    tipo_cocina:                str('tipo_cocina'),
    tiene_balcon:               bool('tiene_balcon'),
    tiene_parqueadero:          bool('tiene_parqueadero'),
    costo_parqueadero:          numDef('costo_parqueadero', 0),
    tiene_bodega:               bool('tiene_bodega'),
    tiene_zona_lavanderia:      bool('tiene_zona_lavanderia'),
    tiene_puerta_seguridad:     bool('tiene_puerta_seguridad'),
    amenidades:                 strs('amenidades'),
    unidades_disponibles:       num('unidades_disponibles'),
    preferencia:                str('preferencia'),
    // Precio y amoblado
    precio_base,
    viene_amoblado:             bool('viene_amoblado'),
    costo_amoblado:             num('costo_amoblado'),
    amoblado_financiado:        bool('amoblado_financiado'),
    tasa_prestamo_amoblado:     num('tasa_prestamo_amoblado') ?? 12,
    meses_prestamo_amoblado:    num('meses_prestamo_amoblado') ?? 24,
    // Estructura de pago (null → usa defaults de configuracion)
    reserva:                         num('reserva'),
    porcentaje_entrada:              num('porcentaje_entrada'),
    porcentaje_durante_construccion: num('porcentaje_durante_construccion'),
    num_cuotas_construccion:         num('num_cuotas_construccion'),
    porcentaje_contra_entrega:       num('porcentaje_contra_entrega'),
    // Financiamiento
    banco:        str('banco'),
    tasa_anual:   num('tasa_anual'),
    anos_credito: num('anos_credito'),
    // Airbnb
    permite_airbnb:                        bool('permite_airbnb'),
    tiene_administracion_airbnb_incluida:  bool('tiene_administracion_airbnb_incluida'),
    porcentaje_gestion_airbnb:             num('porcentaje_gestion_airbnb'),
    precio_noche_estimado:                 numDef('precio_noche_estimado', 0),
    ocupacion_estimada:                    numDef('ocupacion_estimada', 70),
    alicuota_mensual:                      numDef('alicuota_mensual', 0),
    avance_obra_porcentaje:                numDef('avance_obra_porcentaje', 0),
    // Timeline — fecha_entrega tiene prioridad; si existe, calcula meses_espera desde hoy
    fecha_entrega: str('fecha_entrega'),
    meses_espera: str('fecha_entrega')
      ? mesesDesdeHoy(str('fecha_entrega')!)
      : numDef('meses_espera', 0),
    plusvalia_anual: numDef('plusvalia_anual', 5),
    // Subjetivo
    confianza_subjetiva: num('confianza_subjetiva'),
    confianza_notas:     str('confianza_notas'),
    notas:               str('notas'),
  }

  // Recalcular métricas + scores
  const { config, pesos, scores_sectores, existentes } = await leerContextoScoring(supabase, id)
  if (!config) return { ok: false, error: 'No se encontró la configuración' }

  const metricas = calcularMetricas(buildInputCalculos(campos, config))
  const todos_roi      = [...existentes.map(p => p.roi_anual ?? 0), metricas.roi_anual]
  const todos_precio_m2 = [...existentes.map(p => p.precio_m2 ?? 0), metricas.precio_m2]
  const scores = calcularScores(
    buildInputScoring(campos, metricas.roi_anual, metricas.precio_m2),
    pesos, todos_roi, todos_precio_m2, scores_sectores
  )

  const { error } = await supabase
    .from('proyectos')
    .update({ ...campos, ...metricasUpdate(metricas, scores) })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/proyecto/${id}`)
  revalidatePath('/')
  return { ok: true, mensaje: 'Cambios guardados correctamente' }
}

// ─── 2. recalcularUnidad ──────────────────────────────────────────────────────
// Recalcula métricas y scores sin tocar los campos editables.
// Útil cuando cambió la configuración global y quieres actualizar solo esta fila.
export async function recalcularUnidad(
  id: string,
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const { data: p } = await supabase.from('proyectos').select('*').eq('id', id).single()
  if (!p) return { ok: false, error: 'Proyecto no encontrado' }

  const { config, pesos, scores_sectores, existentes } = await leerContextoScoring(supabase, id)
  if (!config) return { ok: false, error: 'Sin configuración' }

  // Si el proyecto tiene fecha_entrega, recalcular meses_espera desde hoy.
  // Así los meses no quedan "vencidos" cuando recalculas meses después.
  const meses_espera_actual = p.fecha_entrega
    ? mesesDesdeHoy(p.fecha_entrega as string)
    : (p.meses_espera ?? 0)
  const pActualizado = { ...p, meses_espera: meses_espera_actual }

  const metricas = calcularMetricas(buildInputCalculos(pActualizado, config))
  const todos_roi       = [...existentes.map(e => e.roi_anual ?? 0), metricas.roi_anual]
  const todos_precio_m2 = [...existentes.map(e => e.precio_m2 ?? 0), metricas.precio_m2]
  const scores = calcularScores(
    buildInputScoring(pActualizado, metricas.roi_anual, metricas.precio_m2),
    pesos, todos_roi, todos_precio_m2, scores_sectores
  )

  const { error } = await supabase
    .from('proyectos')
    .update({ meses_espera: meses_espera_actual, ...metricasUpdate(metricas, scores) })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/proyecto/${id}`)
  revalidatePath('/')
  return { ok: true, mensaje: 'Unidad recalculada con la configuración actual' }
}

// ─── 3. analizarConIA ─────────────────────────────────────────────────────────
// Llama a Claude API con todos los datos del proyecto y guarda el análisis narrativo.
// Solo se invoca cuando el usuario presiona "Analizar con IA" — nunca automáticamente.
export async function analizarConIA(
  id: string,
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const { data: p } = await supabase.from('proyectos').select('*').eq('id', id).single()
  if (!p) return { ok: false, error: 'Proyecto no encontrado' }

  const SYSTEM_PROMPT = `
Eres un experto en inversión inmobiliaria en Quito, Ecuador, especializado en
rentabilidad Airbnb para el sector norte de la ciudad.

## Referencia de mercado por sector (Quito Norte, 2025)
Usa estos datos para comparar precio/m² y precio/noche del proyecto contra el mercado:

| Sector              | Precio/noche est. | Ocupación est. | Precio m² ref.       | Score ubicación |
|---------------------|-------------------|----------------|----------------------|-----------------|
| Quicentro           | $70–90            | 75–85%         | $2.200–2.800/m²      | 95              |
| González Suárez     | $70–90            | 70–80%         | $2.200–2.800/m²      | 90              |
| La Coruña           | $60–80            | 65–75%         | $1.900–2.400/m²      | 88              |
| Quito Tenis         | $55–75            | 65–75%         | $1.800–2.200/m²      | 85              |
| Granda Centeno      | $50–70            | 60–72%         | $1.700–2.100/m²      | 82              |
| Bellavista          | $50–70            | 60–70%         | $1.700–2.100/m²      | 80              |
| Iñaquito / La Carolina | $45–65         | 58–70%         | $1.600–2.000/m²      | 78              |
| El Batán            | $45–65            | 58–68%         | $1.600–2.000/m²      | 76              |
| La Pradera          | $40–60            | 55–65%         | $1.500–1.900/m²      | 74              |
| La Floresta         | $40–60            | 55–65%         | $1.500–1.900/m²      | 74              |
| Otros sectores      | $30–50            | 50–60%         | $1.200–1.600/m²      | 60              |

## Escala de confianza subjetiva (1–5)
1 = muy desconfiado | 3 = neutral | 5 = muy confiado en el proyecto/vendedor

## Fiabilidad de constructora
- reputada: trayectoria sólida, múltiples proyectos exitosos
- conocida_sin_retrasos: buena historia de entrega
- desconocida: sin información suficiente
- conocida_con_retrasos: historial de incumplimientos — riesgo alto

## Tu tarea
Se te proporcionan todos los datos y métricas ya calculadas de un proyecto.
Genera un análisis en español con estos 6 campos:
1. fortaleza: La fortaleza clave para uso Airbnb (1 oración concreta, usa los datos reales)
2. riesgo: El riesgo principal (1 oración, sé específico con números si aplica)
3. recomendacion: Recomendación de inversión (1-2 oraciones, menciona si conviene negociar o esperar)
4. alerta: Alerta crítica si aplica (cadena vacía "" si no hay ninguna)
5. que_preguntar: 3-5 preguntas concretas para hacer al vendedor o a la constructora.
   Si hay contacto_nombre, personaliza ("pregúntale a [nombre] sobre...").
   Prioriza preguntas sobre datos faltantes o riesgos identificados.
6. datos_faltantes: Lista de campos clave que están vacíos o en 0 y afectan la calidad del análisis
   (ej: "precio_noche_estimado = 0 — sin esto el ROI Airbnb es una estimación ciega")

## Criterios de alerta obligatoria
- ROI anual < 5%
- cobertura_con_airbnb < 100% (el Airbnb no cubre la cuota)
- meses_espera > 24 (más de 2 años de espera)
- precio_m2 más de 20% sobre el rango alto del sector
- fiabilidad_constructora = "conocida_con_retrasos"
- permite_airbnb = false
- precio_noche_estimado = 0 o null (sin dato de ingreso)
- confianza_subjetiva <= 2 (feeling negativo del inversor)

Devuelve ÚNICAMENTE JSON válido sin markdown, sin texto antes ni después:
{
  "fortaleza": "",
  "riesgo": "",
  "recomendacion": "",
  "alerta": "",
  "que_preguntar": [],
  "datos_faltantes": []
}
`.trim()

  // Datos completos del proyecto enviados a Claude para el análisis
  const resumen = {
    // Identificación
    nombre: p.nombre,
    constructora: p.constructora,
    anos_constructora: p.anos_constructora,
    proyectos_entregados: p.proyectos_entregados,
    fiabilidad_constructora: p.fiabilidad_constructora,
    reconocimientos_constructora: p.reconocimientos_constructora,
    contacto_nombre: p.contacto_nombre,

    // Ubicación y unidad
    sector: p.sector,
    tipo: p.tipo,
    area_interna_m2: p.area_interna_m2,
    piso: p.piso,
    orientacion: p.orientacion,
    materiales: p.materiales,
    amenidades: p.amenidades,
    viene_amoblado: p.viene_amoblado,
    tiene_administracion_airbnb_incluida: p.tiene_administracion_airbnb_incluida,
    porcentaje_gestion_airbnb: p.porcentaje_gestion_airbnb,
    permite_airbnb: p.permite_airbnb,
    unidades_disponibles: p.unidades_disponibles,

    // Precio y financiamiento
    precio_base: p.precio_base,
    precio_m2: p.precio_m2,
    tasa_anual: p.tasa_anual,
    banco: p.banco,
    cuota_mensual: p.cuota_mensual,

    // Timeline
    fecha_entrega: p.fecha_entrega,
    meses_espera: p.meses_espera,
    avance_obra_porcentaje: p.avance_obra_porcentaje,
    plusvalia_anual: p.plusvalia_anual,

    // Métricas Airbnb
    precio_noche_estimado: p.precio_noche_estimado,
    ocupacion_estimada: p.ocupacion_estimada,
    ingreso_neto_mensual: p.ingreso_neto_mensual,
    flujo_con_airbnb: p.flujo_con_airbnb,
    cobertura_con_airbnb: p.cobertura_con_airbnb,

    // Rentabilidad
    roi_anual: p.roi_anual,
    roi_aporte_propio: p.roi_aporte_propio,
    ganancia_neta: p.ganancia_neta,
    score_total: p.score_total,

    // Factor subjetivo y notas del inversor
    confianza_subjetiva: p.confianza_subjetiva,
    confianza_notas: p.confianza_notas,
    notas: p.notas,
  }

  let analisis: {
    fortaleza: string; riesgo: string; recomendacion: string; alerta: string;
    que_preguntar: string[]; datos_faltantes: string[]
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(resumen, null, 2) }],
    })

    const texto = (message.content[0] as { type: string; text: string }).text
    // Claude a veces envuelve la respuesta en ```json ... ``` — extraer solo el JSON
    const jsonLimpio = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    analisis = JSON.parse(jsonLimpio)
  } catch (e) {
    return { ok: false, error: `Error al llamar a Claude: ${(e as Error).message}` }
  }

  const { error } = await supabase.from('proyectos').update({
    analisis_ia_generado: true,
    fortaleza_ia:    analisis.fortaleza    ?? null,
    riesgo_ia:       analisis.riesgo       ?? null,
    recomendacion_ia: analisis.recomendacion ?? null,
    alerta_ia:       analisis.alerta       ?? null,
    que_preguntar:   analisis.que_preguntar   ?? [],
    datos_faltantes: analisis.datos_faltantes ?? [],
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/proyecto/${id}`)
  return { ok: true, mensaje: 'Análisis generado correctamente' }
}

// ─── 4. subirAdjunto ──────────────────────────────────────────────────────────
// Sube uno o varios archivos a Supabase Storage e inserta los registros.
// Acepta múltiples archivos: el <input name="archivo" multiple> incluye todos en FormData.
// Si hay un solo archivo y el usuario escribió un nombre personalizado, se usa ese nombre.
// Si hay varios, cada archivo usa su propio nombre de archivo.
export async function subirAdjunto(
  proyectoId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const archivos = (formData.getAll('archivo') as File[]).filter(f => f.size > 0)
  const tipo        = (formData.get('tipo') as string | null) ?? 'otro'
  const nombreCustom = (formData.get('nombre') as string | null)?.trim() || null
  const descripcion  = (formData.get('descripcion') as string | null)?.trim() || null

  if (archivos.length === 0) return { ok: false, error: 'Selecciona al menos un archivo' }

  let subidos = 0
  for (const archivo of archivos) {
    if (archivo.size > 20 * 1024 * 1024)
      return { ok: false, error: `"${archivo.name}" supera el límite de 20 MB` }

    // Con un solo archivo se respeta el nombre personalizado; con varios se usa el nombre del archivo
    const nombre = archivos.length === 1 && nombreCustom ? nombreCustom : archivo.name

    // Path en Storage: proyectoId/timestamp-nombre (evita colisiones)
    const ext = archivo.name.split('.').pop() ?? 'bin'
    const storagePath = `${proyectoId}/${Date.now()}-${nombre.replace(/\s+/g, '_')}.${ext}`

    const buffer = Buffer.from(await archivo.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('adjuntos-proyectos')
      .upload(storagePath, buffer, { contentType: archivo.type, upsert: false })

    if (uploadError)
      return { ok: false, error: `Error subiendo "${archivo.name}": ${uploadError.message}` }

    const { error: insertError } = await supabase.from('adjuntos').insert({
      proyecto_id:  proyectoId,
      tipo,
      nombre,
      storage_path: storagePath,
      url_externa:  null,
      descripcion,
    })

    if (insertError) {
      // Si la inserción falla, limpiar el archivo ya subido para no dejar huérfanos en Storage
      await supabase.storage.from('adjuntos-proyectos').remove([storagePath])
      return { ok: false, error: insertError.message }
    }
    subidos++
  }

  revalidatePath(`/proyecto/${proyectoId}`)
  const msg = subidos === 1
    ? `"${archivos[0].name}" subido correctamente`
    : `${subidos} archivos subidos correctamente`
  return { ok: true, mensaje: msg }
}

// ─── 5. eliminarAdjunto ───────────────────────────────────────────────────────
// Borra el archivo de Storage (si existe) y el registro de la tabla adjuntos.
// Se llama con .bind(null, adjuntoId, storagePath) desde el componente AdjuntosPanel.
export async function eliminarAdjunto(
  adjuntoId: string,
  storagePath: string | null,
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  // Borrar de Storage primero (antes de perder la referencia)
  if (storagePath) {
    await supabase.storage.from('adjuntos-proyectos').remove([storagePath])
    // No fallamos si el storage falla — la fila de DB se borra igual
  }

  const { data: adj } = await supabase
    .from('adjuntos')
    .select('proyecto_id')
    .eq('id', adjuntoId)
    .single()

  const { error } = await supabase.from('adjuntos').delete().eq('id', adjuntoId)
  if (error) return { ok: false, error: error.message }

  if (adj?.proyecto_id) revalidatePath(`/proyecto/${adj.proyecto_id}`)
  return { ok: true }
}

// ─── 6. eliminarProyecto ──────────────────────────────────────────────────────
// Borra el proyecto completo: primero los archivos de Storage (para no dejar
// huérfanos), luego DELETE en DB (CASCADE borra la tabla adjuntos automáticamente).
// Tras el borrado redirige al ranking.
export async function eliminarProyecto(
  id: string,
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  // Leer los storage_path de todos los adjuntos antes de borrar la fila
  const { data: adjuntos } = await supabase
    .from('adjuntos')
    .select('storage_path')
    .eq('proyecto_id', id)

  // Borrar archivos de Storage (ignora errores — la DB se limpia igual por CASCADE)
  const paths = (adjuntos ?? [])
    .map(a => a.storage_path)
    .filter(Boolean) as string[]
  if (paths.length > 0) {
    await supabase.storage.from('adjuntos-proyectos').remove(paths)
  }

  // DELETE en proyectos — la FK con ON DELETE CASCADE borra adjuntos automáticamente
  const { error } = await supabase.from('proyectos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  // redirect() lanza una excepción interna en Next.js (tipo never) — debe quedar fuera de try/catch
  redirect('/')
}
