'use client'
// ScoringForm — Client Component
//
// Muestra los criterios de scoring con sus pesos actuales.
// El usuario puede:
//   - Editar los porcentajes (deben sumar 100% entre los criterios activos)
//   - Activar / desactivar criterios (los desactivados no cuentan en el ranking)
//   - Editar el nombre y descripción de cada criterio (inline)
//
// Los pesos se ingresan como porcentajes (ej: 30%) aunque la DB los almacena
// como decimales (0.30). La conversión ocurre en las Server Actions.

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  guardarPesos, toggleCriterio, editarCriterio,
  type CriterioRow, type ScoringActionState
} from './actions'

// ─── Sub-componente: formulario inline de edición de nombre/desc ──────────────
// Se monta sobre el criterio seleccionado y guarda al hacer submit.
// useActionState necesita estar en el nivel de componente — lo sacamos fuera
// del render loop para respetar las Reglas de Hooks.
function EditarCriterioForm({
  criterio,
  onClose,
}: {
  criterio: CriterioRow
  onClose: () => void
}) {
  const [estado, accion, pendiente] = useActionState<ScoringActionState, FormData>(
    editarCriterio, null
  )

  return (
    <form
      action={accion}
      onSubmit={() => { if (!pendiente) setTimeout(onClose, 100) }}
      className="mt-2 space-y-2 bg-zinc-800/50 rounded-lg p-3 border border-zinc-700"
    >
      <input type="hidden" name="id" value={criterio.id} />

      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Nombre</label>
        <input
          name="nombre"
          defaultValue={criterio.nombre}
          disabled={pendiente}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5
                     text-zinc-100 text-sm focus:outline-none focus:ring-2
                     focus:ring-indigo-500 disabled:opacity-50"
        />
      </div>

      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Descripción</label>
        <input
          name="descripcion"
          defaultValue={criterio.descripcion ?? ''}
          disabled={pendiente}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5
                     text-zinc-100 text-sm focus:outline-none focus:ring-2
                     focus:ring-indigo-500 disabled:opacity-50"
        />
      </div>

      {estado?.ok === false && (
        <p className="text-xs text-red-400">{estado.error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="text-xs text-white bg-indigo-700 hover:bg-indigo-600 rounded-lg
                     px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {pendiente ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-200 rounded-lg
                     border border-zinc-700 px-3 py-1.5 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── Sub-componente: botón toggle activo ──────────────────────────────────────
// Formulario de un solo botón que envía la inversión del estado activo.
// Por qué formulario propio: useActionState requiere un hook en el nivel del componente.
function ToggleActivoForm({ criterio }: { criterio: CriterioRow }) {
  const [, accion, pendiente] = useActionState<ScoringActionState, FormData>(
    toggleCriterio, null
  )
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={criterio.id} />
      {/* Enviamos el valor contrario al actual para invertir */}
      <input type="hidden" name="activo" value={String(!criterio.activo)} />
      <button
        type="submit"
        disabled={pendiente}
        title={criterio.activo ? 'Desactivar criterio' : 'Activar criterio'}
        className={`text-xs rounded-lg px-2 py-1 transition-colors disabled:opacity-50
          ${criterio.activo
            ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50'
            : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
          }`}
      >
        {criterio.activo ? '✓ Activo' : '✗ Inactivo'}
      </button>
    </form>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ScoringForm({ criterios }: { criterios: CriterioRow[] }) {
  const [estado, accion, pendiente] = useActionState<ScoringActionState, FormData>(guardarPesos, null)

  // Pesos locales para calcular la suma en tiempo real (×100 = porcentaje)
  const [pesos, setPesos] = useState<Record<string, number>>(
    Object.fromEntries(criterios.map((c) => [c.id, Math.round(c.peso * 100)]))
  )

  // id del criterio cuyo formulario de edición está abierto (null = ninguno)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  // La suma solo considera criterios activos (los inactivos tienen peso efectivo = 0)
  const activos = criterios.filter(c => c.activo)
  const suma = activos.reduce((acc, c) => acc + (pesos[c.id] ?? 0), 0)
  const sumaCorrecta = suma === 100

  return (
    <div className="space-y-8">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Pesos del Scoring</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Edita pesos, activa/desactiva criterios o renombra cualquier criterio.
            Solo los activos cuentan — sus pesos deben sumar 100%.
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

        <div className="space-y-3">
          {criterios.map((criterio) => (
            <div key={criterio.id}>
              <div
                className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors
                  ${criterio.activo
                    ? 'bg-zinc-900 border-zinc-800'
                    : 'bg-zinc-900/30 border-zinc-800/50 opacity-60'
                  }`}
              >
                {/* Orden + nombre + descripción + botón editar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-600 w-4 text-right">{criterio.orden}.</span>
                    <span className="text-sm font-medium text-zinc-100">{criterio.nombre}</span>
                    {/* Botón editar inline — abre/cierra formulario de edición */}
                    <button
                      type="button"
                      onClick={() => setEditandoId(editandoId === criterio.id ? null : criterio.id)}
                      className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
                      title="Editar nombre y descripción"
                    >
                      ✏
                    </button>
                  </div>
                  {criterio.descripcion && (
                    <p className="text-xs text-zinc-600 mt-0.5 ml-6">{criterio.descripcion}</p>
                  )}
                </div>

                {/* Toggle activo */}
                <ToggleActivoForm criterio={criterio} />

                {/* Input de peso — solo si el criterio está activo */}
                {criterio.activo && (
                  <div className="flex items-center gap-2 shrink-0">
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
                                 focus:outline-none focus:ring-2 focus:ring-emerald-600
                                 disabled:opacity-50"
                    />
                    <span className="text-sm text-zinc-500 w-4">%</span>
                  </div>
                )}

                {/* Criterio inactivo: campo hidden con valor 0 para que el server action lo procese */}
                {!criterio.activo && (
                  <input type="hidden" name={`peso_${criterio.id}`} value="0" />
                )}
              </div>

              {/* Formulario de edición inline (aparece debajo del criterio seleccionado) */}
              {editandoId === criterio.id && (
                <EditarCriterioForm
                  criterio={criterio}
                  onClose={() => setEditandoId(null)}
                />
              )}
            </div>
          ))}
        </div>

        {/* Indicador de suma — solo cuenta activos */}
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 border
          ${sumaCorrecta
            ? 'bg-emerald-950/50 border-emerald-900'
            : 'bg-amber-950/50 border-amber-900'
          }`}
        >
          <span className="text-sm text-zinc-400">
            Total activos ({activos.length} criterios)
          </span>
          <span className={`text-sm font-semibold ${sumaCorrecta ? 'text-emerald-400' : 'text-amber-400'}`}>
            {suma}% {sumaCorrecta ? '✓' : `— faltan ${100 - suma}%`}
          </span>
        </div>

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
      </form>
    </div>
  )
}
