'use client'
// SectoresForm — lista editable de sectores y formulario para agregar nuevos.
// Patrón: mismo que ScoringForm — dos useActionState independientes, uno para editar y uno para agregar.

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { guardarSectores, agregarSector, type SectorRow, type SectoresActionState } from './actions'

const ZONAS = ['Centro-Norte', 'Norte Medio', 'Norte Lejano']

export default function SectoresForm({ sectores }: { sectores: SectorRow[] }) {
  const [estadoGuardar, accionGuardar, pendienteGuardar] = useActionState<SectoresActionState, FormData>(
    guardarSectores, null
  )
  const [estadoAgregar, accionAgregar, pendienteAgregar] = useActionState<SectoresActionState, FormData>(
    agregarSector, null
  )

  // Estado local para editar scores en tiempo real (mostramos cambio antes de guardar)
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(sectores.map(s => [s.id, s.score_base]))
  )

  const claseInput = 'rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-zinc-100 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50'

  return (
    <div className="space-y-8">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Sectores de Scoring</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Score de ubicación base (0–100) y rango de precio Airbnb por sector.
            Los sectores con score 0 aparecen resaltados — pendiente de configurar.
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
        {sectores.map(s => (
          <div
            key={s.id}
            className={`rounded-lg border px-4 py-3 space-y-2
              ${s.score_base === 0 ? 'border-amber-800 bg-amber-950/20' : 'border-zinc-800 bg-zinc-900'}`}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Nombre + zona */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-zinc-100 truncate">{s.nombre}</span>
                {s.zona && <span className="text-xs text-zinc-500 shrink-0">{s.zona}</span>}
                {s.score_base === 0 && (
                  <span className="text-xs text-amber-400 shrink-0">⚠ sin score</span>
                )}
              </div>

              {/* Score */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-20 bg-zinc-800 rounded-full h-1.5 hidden sm:block">
                  <div
                    className="h-1.5 rounded-full bg-indigo-600 transition-all"
                    style={{ width: `${Math.min(scores[s.id] ?? 0, 100)}%` }}
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
                />
                <span className="text-xs text-zinc-500">pts</span>
              </div>
            </div>

            {/* Rango Airbnb + Plusvalía */}
            <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
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
          </div>
        ))}

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
