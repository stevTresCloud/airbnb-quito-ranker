'use client'
// ScoringForm — Client Component
//
// Muestra los 7 criterios de scoring con sus pesos actuales.
// El usuario edita los porcentajes (0-100). Al guardar se valida que sumen 100%.
//
// Decisión de UX: los pesos se ingresan como porcentajes enteros (ej: 30, 20, 15...)
// aunque la DB los almacena como decimales (0.30, 0.20, 0.15...).
// Esto es más intuitivo para editar manualmente.
// La conversión (÷100 al guardar, ×100 al mostrar) ocurre en los actions.

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { guardarPesos, type CriterioRow, type ScoringActionState } from './actions'

export default function ScoringForm({ criterios }: { criterios: CriterioRow[] }) {
  const [estado, accion, pendiente] = useActionState<ScoringActionState, FormData>(guardarPesos, null)

  // Estado local para calcular la suma en tiempo real mientras el usuario edita
  // Inicializamos con los pesos actuales convertidos a porcentaje (×100)
  const [pesos, setPesos] = useState<Record<string, number>>(
    Object.fromEntries(criterios.map((c) => [c.id, Math.round(c.peso * 100)]))
  )

  const suma = Object.values(pesos).reduce((acc, v) => acc + v, 0)
  const sumaCorrecta = suma === 100

  return (
    <div className="space-y-8">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Pesos del Scoring</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Los 7 criterios y sus pesos relativos. Deben sumar exactamente 100%.
          </p>
        </div>
        <Link
          href="/configuracion"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors
                     border border-zinc-700 hover:border-zinc-600 rounded-lg px-3 py-2"
        >
          ← Volver
        </Link>
      </div>

      <form action={accion} className="space-y-6">

        {/* Tabla de criterios */}
        <div className="space-y-3">
          {criterios.map((criterio) => (
            <div
              key={criterio.id}
              className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
            >
              {/* Orden + nombre */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600 w-4 text-right">{criterio.orden}.</span>
                  <span className="text-sm font-medium text-zinc-100">{criterio.nombre}</span>
                </div>
                {criterio.descripcion && (
                  <p className="text-xs text-zinc-600 mt-0.5 ml-6">{criterio.descripcion}</p>
                )}
              </div>

              {/* Input de peso */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Barra visual proporcional al peso */}
                <div className="w-24 bg-zinc-800 rounded-full h-1.5 hidden sm:block">
                  <div
                    className="h-1.5 rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${Math.min(pesos[criterio.id] ?? 0, 100)}%` }}
                  />
                </div>

                <input
                  type="number"
                  name={`peso_${criterio.id}`}
                  value={pesos[criterio.id] ?? 0}
                  onChange={(e) =>
                    setPesos((prev) => ({ ...prev, [criterio.id]: Number(e.target.value) }))
                  }
                  min={0}
                  max={100}
                  step={1}
                  disabled={pendiente}
                  className="w-16 rounded-lg bg-zinc-800 border border-zinc-700 px-2 py-1.5
                             text-zinc-100 text-sm text-right
                             focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                             disabled:opacity-50"
                />
                <span className="text-sm text-zinc-500 w-4">%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Indicador de suma en tiempo real */}
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 border
          ${sumaCorrecta
            ? 'bg-emerald-950/50 border-emerald-900'
            : 'bg-amber-950/50 border-amber-900'
          }`}
        >
          <span className="text-sm text-zinc-400">Total</span>
          <span className={`text-sm font-semibold ${sumaCorrecta ? 'text-emerald-400' : 'text-amber-400'}`}>
            {suma}% {sumaCorrecta ? '✓' : `— faltan ${100 - suma}%`}
          </span>
        </div>

        {/* Feedback del Server Action */}
        {estado?.ok === true && (
          <p className="text-sm text-emerald-400 bg-emerald-950/50 border border-emerald-900 rounded-lg px-3 py-2">
            Pesos guardados correctamente
          </p>
        )}
        {estado?.ok === false && (
          <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
            {estado.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pendiente || !sumaCorrecta}
          className="rounded-lg bg-emerald-700 hover:bg-emerald-600
                     text-white font-medium px-6 py-2.5 text-sm
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                     focus:ring-offset-zinc-950"
        >
          {pendiente ? 'Guardando...' : 'Guardar pesos'}
        </button>
        {/* El botón queda deshabilitado hasta que la suma sea exactamente 100%.
            Esto previene que el formulario se envíe con pesos inválidos,
            aunque la validación también existe en el Server Action (doble seguridad). */}

      </form>
    </div>
  )
}
