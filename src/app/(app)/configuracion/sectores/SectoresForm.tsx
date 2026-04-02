'use client'
// SectoresForm — lista editable de sectores y formulario para agregar nuevos.
//
// Cada sector tiene dos niveles de configuración:
//   1. Score base (0-100): puntaje simple, sin desglose
//   2. Sub-criterios (Renta + Seguridad + Plusvalía + Acceso + Servicios):
//      cuando la suma de sub-criterios > 0, el motor de scoring la usa
//      en lugar del score_base. Permite análisis más granular por dimensión.

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { guardarSectores, agregarSector, type SectorRow, type SectoresActionState } from './actions'

const ZONAS = ['Centro-Norte', 'Norte Medio', 'Norte Lejano']

// Definición de los 5 sub-criterios con sus máximos y etiquetas
const SUB_CRITERIOS = [
  { clave: 'sc_renta',     label: 'Renta',     max: 30, desc: 'Demanda Airbnb / precio noche alcanzable' },
  { clave: 'sc_seguridad', label: 'Seguridad', max: 25, desc: 'Índice de seguridad del barrio' },
  { clave: 'sc_plusvalia', label: 'Plusvalía', max: 20, desc: 'Apreciación histórica del valor del m²' },
  { clave: 'sc_acceso',    label: 'Acceso',    max: 15, desc: 'Movilidad, transporte, distancia a hitos' },
  { clave: 'sc_servicios', label: 'Servicios', max: 10, desc: 'Comercio, restaurantes, entretenimiento' },
] as const

type SubClave = typeof SUB_CRITERIOS[number]['clave']

export default function SectoresForm({ sectores }: { sectores: SectorRow[] }) {
  const [estadoGuardar, accionGuardar, pendienteGuardar] = useActionState<SectoresActionState, FormData>(
    guardarSectores, null
  )
  const [estadoAgregar, accionAgregar, pendienteAgregar] = useActionState<SectoresActionState, FormData>(
    agregarSector, null
  )

  // Estado local para editar scores en tiempo real
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(sectores.map(s => [s.id, s.score_base]))
  )

  // Sub-criterios por sector (id → clave → valor)
  const [subScores, setSubScores] = useState<Record<string, Record<SubClave, number>>>(
    Object.fromEntries(sectores.map(s => [
      s.id,
      {
        sc_renta:     s.sc_renta     ?? 0,
        sc_seguridad: s.sc_seguridad ?? 0,
        sc_plusvalia: s.sc_plusvalia ?? 0,
        sc_acceso:    s.sc_acceso    ?? 0,
        sc_servicios: s.sc_servicios ?? 0,
      }
    ]))
  )

  // Set de IDs con el panel de sub-criterios expandido
  const [expandidos, setExpandidos] = useState<Set<string>>(
    // Pre-expandir sectores que ya tienen sub-criterios configurados
    new Set(sectores.filter(s => (s.sc_renta + s.sc_seguridad + s.sc_plusvalia + s.sc_acceso + s.sc_servicios) > 0).map(s => s.id))
  )

  const toggleExpandido = (id: string) =>
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setSubScore = (id: string, clave: SubClave, valor: number) =>
    setSubScores(prev => ({
      ...prev,
      [id]: { ...prev[id], [clave]: valor }
    }))

  const subTotal = (id: string) => {
    const sc = subScores[id]
    if (!sc) return 0
    return sc.sc_renta + sc.sc_seguridad + sc.sc_plusvalia + sc.sc_acceso + sc.sc_servicios
  }

  const claseInput = 'rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-zinc-100 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50'
  const claseSubInput = 'w-14 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-100 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50'

  return (
    <div className="space-y-8">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Sectores de Scoring</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Score base (0–100) y desglose opcional en 5 sub-criterios de ubicación.
            Cuando los sub-criterios suman &gt;0, el motor los usa en lugar del score base.
          </p>
        </div>
        <Link
          href="/configuracion"
          className="text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg px-3 py-2 transition-colors"
        >
          ← Volver
        </Link>
      </div>

      {/* Lista de sectores existentes */}
      <form action={accionGuardar} className="space-y-3">
        {sectores.map(s => {
          const st = subTotal(s.id)
          const usandoSub = st > 0

          return (
            <div
              key={s.id}
              className={`rounded-lg border space-y-0
                ${s.score_base === 0 && !usandoSub ? 'border-amber-800 bg-amber-950/20' : 'border-zinc-800 bg-zinc-900'}`}
            >
              {/* ── Fila principal ── */}
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3">

                {/* Nombre + zona + badges */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-medium text-zinc-100 truncate">{s.nombre}</span>
                  {s.zona && <span className="text-xs text-zinc-500 shrink-0">{s.zona}</span>}
                  {s.score_base === 0 && !usandoSub && (
                    <span className="text-xs text-amber-400 shrink-0">⚠ sin score</span>
                  )}
                  {usandoSub && (
                    <span className="text-xs text-indigo-400 shrink-0">
                      ⬡ sub-score: {st} pts
                    </span>
                  )}
                </div>

                {/* Score base + botón desglosar */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 bg-zinc-800 rounded-full h-1.5 hidden sm:block">
                    <div
                      className="h-1.5 rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${Math.min(usandoSub ? st : (scores[s.id] ?? 0), 100)}%` }}
                    />
                  </div>
                  <input
                    type="number"
                    name={`score_${s.id}`}
                    value={scores[s.id] ?? 0}
                    onChange={e => setScores(prev => ({ ...prev, [s.id]: Number(e.target.value) }))}
                    min={0} max={100} step={1}
                    disabled={pendienteGuardar}
                    className={`w-16 ${claseInput}`}
                    title="Score base (fallback cuando no hay sub-criterios)"
                  />
                  <span className="text-xs text-zinc-500">pts</span>

                  {/* Botón para expandir/colapsar sub-criterios */}
                  <button
                    type="button"
                    onClick={() => toggleExpandido(s.id)}
                    className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors
                               border border-zinc-700 hover:border-indigo-700 rounded-lg px-2 py-1"
                    title="Desglosar en sub-criterios de ubicación"
                  >
                    {expandidos.has(s.id) ? '▲ Sub' : '▼ Sub'}
                  </button>
                </div>
              </div>

              {/* ── Rango Airbnb + Plusvalía ── */}
              <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap px-4 pb-2">
                <span>Airbnb/noche:</span>
                <span>$</span>
                <input
                  type="number"
                  name={`airbnb_min_${s.id}`}
                  defaultValue={s.airbnb_noche_min}
                  min={0} step={1}
                  disabled={pendienteGuardar}
                  className="w-16 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
                <span>–</span>
                <span>$</span>
                <input
                  type="number"
                  name={`airbnb_max_${s.id}`}
                  defaultValue={s.airbnb_noche_max}
                  min={0} step={1}
                  disabled={pendienteGuardar}
                  className="w-16 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
                <span className="ml-2">Plusvalía:</span>
                <input
                  type="number"
                  name={`plusvalia_${s.id}`}
                  defaultValue={s.plusvalia_anual_estimada ?? 5}
                  min={0} max={20} step={0.1}
                  disabled={pendienteGuardar}
                  className="w-16 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
                <span>%/año</span>
                {s.perfil && (
                  <span className="text-zinc-600 truncate hidden md:block ml-2" title={s.perfil}>
                    — {s.perfil.slice(0, 60)}{s.perfil.length > 60 ? '…' : ''}
                  </span>
                )}
              </div>

              {/* ── Panel de sub-criterios (expandible) ── */}
              {expandidos.has(s.id) && (
                <div className="border-t border-zinc-800 px-4 py-3 space-y-2 bg-zinc-900/50 rounded-b-lg">
                  <p className="text-xs text-zinc-500 mb-2">
                    Sub-criterios de ubicación — máximo total: 100 pts.
                    {usandoSub
                      ? <span className="text-indigo-400 ml-1">Activo: el motor usa {st} pts en lugar del score base.</span>
                      : <span className="text-zinc-600 ml-1">Todos en 0 → se usa el score base como fallback.</span>
                    }
                  </p>

                  <div className="space-y-2">
                    {SUB_CRITERIOS.map(sc => {
                      const val = subScores[s.id]?.[sc.clave] ?? 0
                      return (
                        <div key={sc.clave} className="flex items-center gap-3">
                          {/* Barra proporcional al máximo del criterio */}
                          <div className="w-20 bg-zinc-800 rounded-full h-1 hidden sm:block shrink-0">
                            <div
                              className="h-1 rounded-full bg-indigo-600/70 transition-all"
                              style={{ width: `${(val / sc.max) * 100}%` }}
                            />
                          </div>
                          <input
                            type="number"
                            name={`${sc.clave}_${s.id}`}
                            value={val}
                            onChange={e => setSubScore(s.id, sc.clave, Number(e.target.value))}
                            min={0} max={sc.max} step={1}
                            disabled={pendienteGuardar}
                            className={claseSubInput}
                          />
                          <span className="text-xs text-zinc-600 w-4 shrink-0">/{sc.max}</span>
                          <span className="text-xs text-zinc-300 w-16 shrink-0">{sc.label}</span>
                          <span className="text-xs text-zinc-600 hidden sm:block">{sc.desc}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Total sub-criterios */}
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 mt-2 border
                    ${st > 100 ? 'border-red-900 bg-red-950/30' : st > 0 ? 'border-indigo-900 bg-indigo-950/20' : 'border-zinc-800'}`}
                  >
                    <span className="text-xs text-zinc-400">Total sub-criterios</span>
                    <span className={`text-xs font-semibold ${st > 100 ? 'text-red-400' : st > 0 ? 'text-indigo-400' : 'text-zinc-500'}`}>
                      {st} pts {st > 100 ? '— excede 100' : st === 0 ? '(sin activar)' : '/ 100'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Feedback guardar */}
        {estadoGuardar?.ok === true && (
          <p className="text-sm text-emerald-400 bg-emerald-950/50 border border-emerald-900 rounded-lg px-3 py-2">
            Sectores guardados correctamente
          </p>
        )}
        {estadoGuardar?.ok === false && (
          <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
            {estadoGuardar.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pendienteGuardar}
          className="rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-medium px-6 py-2.5 text-sm transition-colors disabled:opacity-50"
        >
          {pendienteGuardar ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      {/* Formulario para agregar nuevo sector */}
      <div className="border-t border-zinc-800 pt-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300">Agregar nuevo sector</h2>
        <form action={accionAgregar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Nombre *</label>
              <input
                name="nuevo_nombre"
                required
                placeholder="Ej: El Batán Bajo"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Zona</label>
              <select
                name="nuevo_zona"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Sin clasificar</option>
                {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Score (0–100)</label>
              <input
                name="nuevo_score"
                type="number"
                defaultValue={0}
                min={0} max={100} step={1}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Airbnb mín/noche ($)</label>
              <input
                name="nuevo_airbnb_min"
                type="number"
                defaultValue={0}
                min={0} step={1}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Airbnb máx/noche ($)</label>
              <input
                name="nuevo_airbnb_max"
                type="number"
                defaultValue={0}
                min={0} step={1}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Plusvalía anual (%)</label>
              <input
                name="nuevo_plusvalia"
                type="number"
                defaultValue={5}
                min={0} max={20} step={0.1}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Feedback agregar */}
          {estadoAgregar?.ok === true && (
            <p className="text-sm text-emerald-400 bg-emerald-950/50 border border-emerald-900 rounded-lg px-3 py-2">
              Sector agregado correctamente
            </p>
          )}
          {estadoAgregar?.ok === false && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
              {estadoAgregar.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pendienteAgregar}
            className="rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {pendienteAgregar ? 'Agregando...' : '+ Agregar sector'}
          </button>
        </form>
      </div>
    </div>
  )
}
