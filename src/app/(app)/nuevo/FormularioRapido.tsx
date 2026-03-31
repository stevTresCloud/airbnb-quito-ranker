'use client'
// FormularioRapido.tsx — 8 campos obligatorios para guardar un proyecto en feria
// Implementa el patrón estándar: useActionState + <form action={accion}>

import { useActionState, useState } from 'react'
import { guardarProyecto } from './actions'
import type { GuardarProyectoState } from './actions'
import { TIPOS, PREFERENCIAS } from './data'
import type { SectorOption } from '@/types/proyecto'

// Tipo para los datos pre-llenados desde voz o foto
export type DatosPrellenados = {
  nombre?: string
  sector?: string
  tipo?: string
  precio_base?: number
  area_interna_m2?: number
  meses_espera?: number
  unidades_disponibles?: number | null
  preferencia?: string | null
  camposInciertos?: string[]  // campos extraídos con baja confianza (se resaltan en amarillo)
}

interface Props {
  datosIniciales?: DatosPrellenados
  sectores: SectorOption[]
}

const SENTINEL_NUEVO = '__nuevo__'

export default function FormularioRapido({ datosIniciales, sectores }: Props) {
  const [estado, accion, pendiente] = useActionState<GuardarProyectoState, FormData>(
    guardarProyecto,
    null
  )

  const inciertos = new Set(datosIniciales?.camposInciertos ?? [])

  // Si el sector pre-llenado no está en la lista, mostrar campo "Otro" directamente
  const sectorInicial = datosIniciales?.sector ?? ''
  const esSectorDesconocido = sectorInicial !== '' && !sectores.find(s => s.nombre === sectorInicial)
  const [sectorSelect, setSectorSelect] = useState(
    esSectorDesconocido ? SENTINEL_NUEVO : sectorInicial
  )
  const [sectorNuevo, setSectorNuevo] = useState(esSectorDesconocido ? sectorInicial : '')

  // Sector actualmente activo para mostrar el hint de precios
  const sectorActivo = sectorSelect === SENTINEL_NUEVO
    ? null
    : sectores.find(s => s.nombre === sectorSelect) ?? null

  // Clase CSS para destacar campos con baja confianza (extraídos de foto/voz con duda)
  const claseInput = (campo: string) =>
    `w-full rounded-lg border px-3 py-2 text-sm bg-zinc-900 text-white
     focus:outline-none focus:ring-2 focus:ring-indigo-500
     ${inciertos.has(campo) ? 'border-yellow-400' : 'border-zinc-700'}`

  return (
    <form action={accion} className="space-y-4">
      {/* Nombre del proyecto */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Nombre del proyecto *
          {inciertos.has('nombre') && <span className="ml-2 text-xs text-yellow-400">⚠ verificar</span>}
        </label>
        <input
          name="nombre"
          required
          defaultValue={datosIniciales?.nombre ?? ''}
          placeholder="Ej: Legacy Suite 4B"
          className={claseInput('nombre')}
        />
      </div>

      {/* Sector + Tipo en fila */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Sector *
            {inciertos.has('sector') && <span className="ml-1 text-xs text-yellow-400">⚠</span>}
          </label>
          {/* Campo oculto que lleva el valor real al Server Action */}
          <input type="hidden" name="sector_select" value={sectorSelect} />
          <select
            value={sectorSelect}
            onChange={e => {
              setSectorSelect(e.target.value)
              if (e.target.value !== SENTINEL_NUEVO) setSectorNuevo('')
            }}
            required
            className={claseInput('sector')}
          >
            <option value="">Seleccionar...</option>
            {sectores.map(s => (
              <option key={s.nombre} value={s.nombre}>{s.nombre}</option>
            ))}
            <option value={SENTINEL_NUEVO}>➕ Agregar nuevo sector</option>
          </select>

          {/* Campo texto solo visible al seleccionar "Agregar nuevo" */}
          {sectorSelect === SENTINEL_NUEVO && (
            <input
              name="sector_nuevo"
              value={sectorNuevo}
              onChange={e => setSectorNuevo(e.target.value)}
              required
              placeholder="Nombre del nuevo sector"
              className="mt-2 w-full rounded-lg border border-indigo-500 px-3 py-2 text-sm
                         bg-zinc-900 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}

          {/* Hint de precios Airbnb del sector seleccionado */}
          {sectorActivo && sectorActivo.airbnb_noche_max > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              Airbnb estimado: ${sectorActivo.airbnb_noche_min}–${sectorActivo.airbnb_noche_max}/noche
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Tipo *
            {inciertos.has('tipo') && <span className="ml-1 text-xs text-yellow-400">⚠</span>}
          </label>
          <select
            name="tipo"
            required
            defaultValue={datosIniciales?.tipo ?? ''}
            className={claseInput('tipo')}
          >
            <option value="">Seleccionar...</option>
            {TIPOS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Precio base + Área interna en fila */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Precio base (USD) *
            {inciertos.has('precio_base') && <span className="ml-1 text-xs text-yellow-400">⚠</span>}
          </label>
          <input
            name="precio_base"
            type="number"
            required
            min={1}
            step={1}
            defaultValue={datosIniciales?.precio_base ?? ''}
            placeholder="80000"
            className={claseInput('precio_base')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Área interna (m²) *
            {inciertos.has('area_interna_m2') && <span className="ml-1 text-xs text-yellow-400">⚠</span>}
          </label>
          <input
            name="area_interna_m2"
            type="number"
            required
            min={1}
            step={0.01}
            defaultValue={datosIniciales?.area_interna_m2 ?? ''}
            placeholder="40"
            className={claseInput('area_interna_m2')}
          />
        </div>
      </div>

      {/* Meses de espera + Unidades disponibles en fila */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Meses hasta entrega *
            {inciertos.has('meses_espera') && <span className="ml-1 text-xs text-yellow-400">⚠</span>}
          </label>
          <input
            name="meses_espera"
            type="number"
            required
            min={0}
            step={1}
            defaultValue={datosIniciales?.meses_espera ?? ''}
            placeholder="18"
            className={claseInput('meses_espera')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Unidades disponibles
            {inciertos.has('unidades_disponibles') && <span className="ml-1 text-xs text-yellow-400">⚠</span>}
          </label>
          <input
            name="unidades_disponibles"
            type="number"
            min={0}
            step={1}
            defaultValue={datosIniciales?.unidades_disponibles ?? ''}
            placeholder="Dejar vacío si no sabe"
            className={claseInput('unidades_disponibles')}
          />
        </div>
      </div>

      {/* Preferencia */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Preferencia
        </label>
        <select
          name="preferencia"
          defaultValue={datosIniciales?.preferencia ?? ''}
          className={claseInput('preferencia')}
        >
          <option value="">Sin clasificar</option>
          <option value={PREFERENCIAS[0]}>★ Primera opción</option>
          <option value={PREFERENCIAS[1]}>Alternativa</option>
        </select>
      </div>

      {/* Feedback de error */}
      {estado && !estado.ok && (
        <p className="text-red-400 text-sm">{estado.error}</p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                   text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {pendiente ? 'Guardando...' : 'Guardar ya'}
      </button>

      <p className="text-zinc-500 text-xs text-center">
        Los campos restantes (precio/noche, financiamiento, constructora, etc.) se pueden
        completar luego desde el detalle del proyecto.
      </p>
    </form>
  )
}
