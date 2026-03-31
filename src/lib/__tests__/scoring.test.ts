import { describe, it, expect } from 'vitest'
import { calcularScores } from '../scoring'
import type { InputScoring, PesosCriterios } from '../../types/proyecto'

// Pesos de ejemplo que suman 1.00
const PESOS: PesosCriterios = {
  roi: 0.30,
  ubicacion: 0.20,
  constructora: 0.15,
  entrega: 0.15,
  precio_m2: 0.10,
  calidad: 0.07,
  confianza: 0.03,
}

// Scores de sectores de ejemplo para tests (subconjunto del CSV)
const SCORES_SECTORES: Record<string, number> = {
  'Iñaquito': 78,
  'La Carolina / Iñaquito': 91,
  'González Suárez': 90,
}

// Proyecto típico para tests
const BASE: InputScoring = {
  roi_anual: 8,
  precio_m2: 2000,
  sector: 'Iñaquito',
  piso: 5,
  orientacion: 'norte',
  fiabilidad_constructora: 'conocida_sin_retrasos',
  anos_constructora: 12,
  proyectos_entregados: 5,
  reconocimientos_constructora: null,
  meses_espera: 18,
  materiales: 'premium',
  amenidades: ['gimnasio', 'bbq'],
  tiene_balcon: true,
  tipo_cocina: 'americana',
  numero_banos: 1,
  tiene_zona_lavanderia: false,
  tiene_puerta_seguridad: false,
  viene_amoblado: false,
  tiene_administracion_airbnb_incluida: false,
  unidades_totales_edificio: 30,
  avance_obra_porcentaje: 40,
  confianza_subjetiva: 4,
  permite_airbnb: true,
}

describe('scoring.ts', () => {
  it('permite_airbnb=false → score_total = 0 (regla absoluta)', () => {
    const r = calcularScores({ ...BASE, permite_airbnb: false }, PESOS, [8], [2000], SCORES_SECTORES)
    expect(r.score_total).toBe(0)
    expect(r.score_roi).toBe(0)
    expect(r.score_ubicacion).toBe(0)
  })

  it('score_total = suma ponderada correcta con pesos de ejemplo', () => {
    // Proyecto único → score_roi = 100 (único proyecto, max normalizado)
    const r = calcularScores(BASE, PESOS, [8], [2000], SCORES_SECTORES)
    const esperado = Math.round(
      r.score_roi         * PESOS.roi +
      r.score_ubicacion   * PESOS.ubicacion +
      r.score_constructora* PESOS.constructora +
      r.score_entrega     * PESOS.entrega +
      r.score_precio_m2   * PESOS.precio_m2 +
      r.score_calidad     * PESOS.calidad +
      r.score_confianza   * PESOS.confianza
    )
    expect(r.score_total).toBe(esperado)
  })

  it('score_constructora: reputada=80 base, con_retrasos=20 base', () => {
    const reputada = calcularScores(
      { ...BASE, fiabilidad_constructora: 'reputada', anos_constructora: null, proyectos_entregados: null },
      PESOS, [8], [2000], SCORES_SECTORES
    )
    expect(reputada.score_constructora).toBe(80)

    const conRetrasos = calcularScores(
      { ...BASE, fiabilidad_constructora: 'conocida_con_retrasos', anos_constructora: null, proyectos_entregados: null },
      PESOS, [8], [2000], SCORES_SECTORES
    )
    expect(conRetrasos.score_constructora).toBe(20)
  })

  it('score_entrega: 0 meses=100, 48+ meses=0', () => {
    const entregado = calcularScores({ ...BASE, meses_espera: 0 }, PESOS, [8], [2000], SCORES_SECTORES)
    expect(entregado.score_entrega).toBe(100)

    const lejano = calcularScores({ ...BASE, meses_espera: 48 }, PESOS, [8], [2000], SCORES_SECTORES)
    expect(lejano.score_entrega).toBe(0)

    const mucho = calcularScores({ ...BASE, meses_espera: 60 }, PESOS, [8], [2000], SCORES_SECTORES)
    expect(mucho.score_entrega).toBe(0)
  })

  it('score_confianza: confianza_subjetiva × 20', () => {
    for (const nivel of [1, 2, 3, 4, 5] as const) {
      const r = calcularScores({ ...BASE, confianza_subjetiva: nivel }, PESOS, [8], [2000], SCORES_SECTORES)
      expect(r.score_confianza).toBe(nivel * 20)
    }
    const sinDato = calcularScores({ ...BASE, confianza_subjetiva: null }, PESOS, [8], [2000], SCORES_SECTORES)
    expect(sinDato.score_confianza).toBe(0)
  })
})
