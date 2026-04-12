'use server'
// Server Action para análisis IA comparativo de 2-3 proyectos.
// Se invoca desde ComparadorTabla cuando el usuario presiona "Análisis IA".
// No persiste en DB — se genera cada vez (los datos pueden cambiar).

import { createSupabaseServer } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export type AnalisisComparativoState = {
  ok: boolean
  error?: string
  analisis?: {
    auditoria: string
    comparacion: string
    veredicto: string
  }
} | null

export async function analizarComparacion(
  ids: string[],
  _prev: AnalisisComparativoState,
  _formData: FormData
): Promise<AnalisisComparativoState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  if (ids.length < 2 || ids.length > 3) return { ok: false, error: 'Se requieren 2-3 proyectos' }

  // Fetch proyectos completos + sectores + config en paralelo
  const [{ data: proyectos }, { data: sectoresDB }, { data: config }] = await Promise.all([
    supabase.from('proyectos').select('*').in('id', ids),
    supabase.from('sectores_scoring')
      .select('nombre, score_base, airbnb_noche_min, airbnb_noche_max, plusvalia_anual_estimada, perfil'),
    supabase.from('configuracion').select('*').single(),
  ])

  if (!proyectos || proyectos.length < 2) return { ok: false, error: 'Proyectos no encontrados' }

  // Construir mapa de sectores para acceso rápido
  const sectoresList = sectoresDB ?? []
  const sectoresMap: Record<string, typeof sectoresList[0]> = {}
  for (const s of sectoresList) sectoresMap[s.nombre] = s

  // Preservar orden original de ids
  const proyectosOrdenados = ids
    .map(id => proyectos.find(p => p.id === id))
    .filter(Boolean) as typeof proyectos

  // Preparar resumen de cada proyecto con benchmarks de su sector
  const resumenProyectos = proyectosOrdenados.map(p => {
    const sector = sectoresMap[p.sector]
    return {
      nombre: p.nombre,
      tipo: p.tipo,
      constructora: p.constructora,
      fiabilidad_constructora: p.fiabilidad_constructora,
      anos_constructora: p.anos_constructora,

      // Ubicación (prioridad: coordenadas > dirección > sector)
      latitud: p.latitud,
      longitud: p.longitud,
      direccion: p.direccion,
      sector: p.sector,
      walkability: p.walkability,

      // Benchmarks del sector
      benchmark_sector: sector ? {
        airbnb_noche_min: sector.airbnb_noche_min,
        airbnb_noche_max: sector.airbnb_noche_max,
        plusvalia_anual_estimada: sector.plusvalia_anual_estimada,
        score_base: sector.score_base,
        perfil: sector.perfil,
      } : null,

      // Unidad
      area_interna_m2: p.area_interna_m2,
      piso: p.piso,
      materiales: p.materiales,
      amenidades: p.amenidades,
      viene_amoblado: p.viene_amoblado,
      tiene_parqueadero: p.tiene_parqueadero,
      tiene_bodega: p.tiene_bodega,
      tiene_administracion_airbnb_incluida: p.tiene_administracion_airbnb_incluida,
      permite_airbnb: p.permite_airbnb,

      // Precio
      precio_base: p.precio_base,
      descuento_valor: p.descuento_valor,
      descuento_tipo: p.descuento_tipo,
      precio_total: p.precio_total,
      precio_m2: p.precio_m2,

      // Financiamiento
      tasa_anual: p.tasa_anual,
      cuota_mensual: p.cuota_mensual,
      seguro_mensual: p.seguro_mensual,
      alicuota_mensual: p.alicuota_mensual,

      // Timeline
      meses_espera: p.meses_espera,
      avance_obra_porcentaje: p.avance_obra_porcentaje,
      plusvalia_anual: p.plusvalia_anual,

      // Airbnb
      precio_noche_estimado: p.precio_noche_estimado,
      ocupacion_estimada: p.ocupacion_estimada,
      ingreso_neto_mensual: p.ingreso_neto_mensual,
      flujo_con_airbnb: p.flujo_con_airbnb,
      cobertura_con_airbnb: p.cobertura_con_airbnb,

      // Rentabilidad
      roi_anual: p.roi_anual,
      ganancia_neta: p.ganancia_neta,
      score_total: p.score_total,

      // Subjetivo
      confianza_subjetiva: p.confianza_subjetiva,
    }
  })

  const SYSTEM_PROMPT = `
Eres un experto en inversión inmobiliaria en Quito, Ecuador, especializado en
rentabilidad Airbnb. Se te presentan ${ids.length} proyectos para una comparación definitiva.

## Tu tarea

Genera un análisis en español con estos 3 campos:

### 1. auditoria (obligatorio, 3-6 oraciones)
Para CADA proyecto, audita si los datos ingresados son realistas comparándolos
contra los benchmarks del sector que se incluyen en benchmark_sector:
- precio_noche_estimado vs rango airbnb_noche_min/max del sector
- ocupacion_estimada vs rango razonable para el perfil del sector (60-80% es típico)
- plusvalia_anual vs plusvalia_anual_estimada del sector
- precio_m2 vs rango razonable del sector
- meses_espera vs avance_obra_porcentaje (¿coherentes?)

Si un dato está fuera de rango, indícalo con el impacto:
"[Proyecto X]: precio_noche $70 está sobre el techo del sector ($65) → el ROI real sería ~X% menor"

Si la ubicación (coordenadas o dirección) sugiere zona premium o periférica del sector, menciónalo.
Si todos los datos son coherentes, dilo brevemente.

### 2. comparacion (obligatorio, 4-8 oraciones)
Comparación directa entre los proyectos, usando datos YA AUDITADOS (corregidos si fue necesario):
- Cuál tiene mejor ROI real (no el inflado por datos optimistas)
- Cuál tiene menos riesgo (constructora, avance obra, meses espera, cobertura)
- Cuál tiene mejor flujo mensual y capacidad de pago
- Trade-offs explícitos: "A gana en X pero B gana en Y"
- Factores cualitativos: walkability, amenidades, gestión Airbnb incluida, amoblado

### 3. veredicto (obligatorio, 2-4 oraciones)
Recomendación clara y definitiva:
- "Si tu prioridad es [flujo/ROI/seguridad], elige [Proyecto X] porque..."
- "Mi recomendación general: [Proyecto X], con la advertencia de..."
- Si están muy parejos, dilo honestamente y menciona qué factor debería desempatar

## Reglas
- Sé directo y específico con números. No uses frases genéricas.
- Si un proyecto tiene permite_airbnb=false, señálalo como descalificado para Airbnb.
- Usa los nombres de los proyectos, no "Proyecto 1" o "Proyecto 2".

Devuelve ÚNICAMENTE JSON válido sin markdown, sin texto antes ni después:
{
  "auditoria": "",
  "comparacion": "",
  "veredicto": ""
}
`.trim()

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          proyectos: resumenProyectos,
          config_global: config ? {
            sueldo_neto: config.sueldo_neto,
            porcentaje_ahorro: config.porcentaje_ahorro,
            anos_proyeccion: config.anos_proyeccion,
            seguro_mensual_default: config.seguro_mensual_default,
          } : null,
        }, null, 2),
      }],
    })

    const texto = (message.content[0] as { type: string; text: string }).text
    const jsonLimpio = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const analisis = JSON.parse(jsonLimpio)

    return {
      ok: true,
      analisis: {
        auditoria: analisis.auditoria ?? '',
        comparacion: analisis.comparacion ?? '',
        veredicto: analisis.veredicto ?? '',
      },
    }
  } catch (e) {
    return { ok: false, error: `Error al llamar a Claude: ${(e as Error).message}` }
  }
}
