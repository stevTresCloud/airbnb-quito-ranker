// lib/scoring.ts — Motor de ranking en TypeScript puro
//
// PRINCIPIO: Esta función no toca la DB.
// Recibe los datos del proyecto, los pesos de criterios (ya leídos de DB por el caller),
// y el array de roi_anual de todos los proyectos (para normalizar score_roi).
//
// Cada score individual es 0-100. score_total es la suma ponderada.

import type { InputScoring, ScoresCalculados, PesosCriterios } from '@/types/proyecto'

// ─── Funciones de score individual ───────────────────────────────────────────

// scores_sectores viene de la tabla sectores_scoring en DB (nombre → score_base).
// Si el sector no está en el mapa (sector nuevo sin score asignado), usa 0.
function scoreUbicacion(p: InputScoring, scores_sectores: Record<string, number>): number {
  let score = scores_sectores[p.sector] ?? 0

  // Bonus por piso alto
  if (p.piso !== null) {
    if (p.piso >= 12) score += 10
    else if (p.piso >= 8) score += 5
  }

  // Bonus orientación favorable para Quito (norte/este = más luz natural)
  if (p.orientacion === 'norte' || p.orientacion === 'este') score += 5

  return Math.min(100, score)
}

function scoreConstructora(p: InputScoring): number {
  // Base según fiabilidad declarada por el usuario
  const bases: Record<string, number> = {
    'reputada':                 80,
    'conocida_sin_retrasos':    60,
    'desconocida':              40,
    'conocida_con_retrasos':    20,
  }
  let score = bases[p.fiabilidad_constructora ?? 'desconocida'] ?? 40

  // Bonus por experiencia (años)
  if (p.anos_constructora !== null) {
    if (p.anos_constructora > 20) score += 10
    else if (p.anos_constructora > 10) score += 5
  }

  // Bonus por track record (proyectos terminados)
  if (p.proyectos_entregados !== null && p.proyectos_entregados > 10) score += 5

  // Bonus por reconocimientos formales
  if (p.reconocimientos_constructora) score += 5

  return Math.min(100, score)
}

function scoreEntrega(meses_espera: number): number {
  // Función inversa: 0 meses = 100, 48+ meses = 0 (lineal en el rango)
  if (meses_espera <= 0) return 100
  if (meses_espera >= 48) return 0
  return Math.round(100 - (meses_espera / 48) * 100)
}

function scoreCalidad(p: InputScoring): number {
  // Base por calidad de materiales
  const bases: Record<string, number> = {
    'lujo':      40,
    'premium':   30,
    'estándar':  20,
    'básico':    10,
  }
  let score = bases[p.materiales ?? 'estándar'] ?? 20

  // Bonus amenidades del edificio
  const amenidades = p.amenidades ?? []
  const amenidadesSet = new Set(amenidades.map(a => a.toLowerCase()))

  if (amenidadesSet.has('spa') || amenidadesSet.has('piscina') || amenidadesSet.has('infinity pool'))
    score += 15
  if (amenidadesSet.has('gimnasio') || amenidadesSet.has('gym'))
    score += 8
  if (amenidadesSet.has('coworking'))
    score += 7
  if (amenidadesSet.has('bbq') || amenidadesSet.has('rooftop'))
    score += 6
  if (amenidadesSet.has('jacuzzi'))
    score += 5
  if (amenidadesSet.has('sauna') || amenidadesSet.has('turco'))
    score += 5
  // Otros no categorizados: +2 c/u (máx 5 ítems extra para evitar inflar)
  const conocidas = new Set(['spa','piscina','infinity pool','gimnasio','gym','coworking','bbq','rooftop','jacuzzi','sauna','turco'])
  const extras = amenidades.filter(a => !conocidas.has(a.toLowerCase()))
  score += Math.min(extras.length * 2, 10)

  // Bonus por características de la unidad
  if (p.tiene_balcon) score += 5
  if (p.tipo_cocina === 'americana') score += 3
  if (p.numero_banos >= 1.5) score += 5
  if (p.tiene_zona_lavanderia) score += 3
  if (p.tiene_puerta_seguridad) score += 2

  // Bonus operacionales
  if (p.viene_amoblado) score += 8          // listo para operar el día de entrega
  if (p.tiene_administracion_airbnb_incluida) score += 5

  // Penalizaciones
  if (p.unidades_totales_edificio !== null && p.unidades_totales_edificio > 60) score -= 5
  if (p.avance_obra_porcentaje < 30) score -= 5   // riesgo alto, obra muy temprana

  return Math.max(0, Math.min(100, score))
}

function scoreEquipamiento(p: InputScoring): number {
  // Parqueadero y bodega son extras que elevan el valor real del inmueble para Airbnb:
  // – Parqueadero: alta demanda en Quito, diferenciador frente a unidades sin él
  // – Bodega: comodidad operativa (almacén de lencería, artículos de limpieza, etc.)
  // Bonus por tener ambos: la combinación es más valiosa que la suma de sus partes
  let score = 0
  if (p.tiene_parqueadero) score += 50
  if (p.tiene_bodega)      score += 30
  if (p.tiene_parqueadero && p.tiene_bodega) score += 20  // bonus combo
  return Math.min(100, score)
}

function scoreConfianza(confianza_subjetiva: number | null): number {
  // 1→20, 2→40, 3→60, 4→80, 5→100
  if (confianza_subjetiva === null) return 0
  return Math.max(0, Math.min(5, confianza_subjetiva)) * 20
}

// ─── Normalización de ROI ──────────────────────────────────────────────────────
// Escala absoluta: 16% ROI anual = 100 puntos (referencia de excelencia).
// A diferencia de min-max, esta escala no depende del conjunto de proyectos:
// un proyecto con ROI del 7% siempre recibe ~44 pts, no 0 por ser el peor del set.
function scoreRoi(roi_anual: number): number {
  return Math.min(100, Math.round((roi_anual / 16) * 100))
}

// score_precio_m2 es inverso: menor precio_m2 = mejor score
function scorePrecioM2(precio_m2: number, todos_los_precio_m2: number[]): number {
  if (todos_los_precio_m2.length === 0) return 50
  const min = Math.min(...todos_los_precio_m2)
  const max = Math.max(...todos_los_precio_m2)
  if (max === min) return 100
  // Invertimos: el más barato obtiene 100, el más caro obtiene 0
  return Math.round(((max - precio_m2) / (max - min)) * 100)
}

// ─── Función principal ─────────────────────────────────────────────────────────

export function calcularScores(
  proyecto: InputScoring,
  pesos: PesosCriterios,
  // Array de precio_m2 de todos los proyectos (incluye al actual) para normalizar score_precio_m2
  todos_los_precio_m2: number[],
  // Mapa nombre_sector → score_base leído de la tabla sectores_scoring en DB
  // Si es undefined (tests legacy), se usa mapa vacío → score_ubicacion depende solo de piso/orientación
  scores_sectores: Record<string, number> = {}
): ScoresCalculados {

  // REGLA ESPECIAL: si el reglamento del edificio prohíbe Airbnb, score_total = 0
  // No tiene sentido incluirlo en el ranking.
  if (!proyecto.permite_airbnb) {
    return {
      score_roi: 0, score_ubicacion: 0, score_constructora: 0,
      score_entrega: 0, score_equipamiento: 0, score_precio_m2: 0,
      score_calidad: 0, score_confianza: 0, score_total: 0,
    }
  }

  const score_roi = scoreRoi(proyecto.roi_anual)
  const score_ubicacion = scoreUbicacion(proyecto, scores_sectores)
  const score_constructora = scoreConstructora(proyecto)
  const score_entrega = scoreEntrega(proyecto.meses_espera)
  const score_equipamiento = scoreEquipamiento(proyecto)
  const score_precio_m2 = scorePrecioM2(proyecto.precio_m2, todos_los_precio_m2)
  const score_calidad = scoreCalidad(proyecto)
  const score_confianza = scoreConfianza(proyecto.confianza_subjetiva)

  // score_total = suma ponderada (los pesos de la DB son decimales 0.00–1.00)
  const score_total = Math.round(
    score_roi          * (pesos['roi']           ?? 0) +
    score_ubicacion    * (pesos['ubicacion']     ?? 0) +
    score_constructora * (pesos['constructora']  ?? 0) +
    score_entrega      * (pesos['entrega']       ?? 0) +
    score_equipamiento * (pesos['equipamiento']  ?? 0) +
    score_precio_m2    * (pesos['precio_m2']     ?? 0) +
    score_calidad      * (pesos['calidad']       ?? 0) +
    score_confianza    * (pesos['confianza']     ?? 0)
  )

  return {
    score_roi,
    score_ubicacion,
    score_constructora,
    score_entrega,
    score_equipamiento,
    score_precio_m2,
    score_calidad,
    score_confianza,
    score_total,
  }
}
