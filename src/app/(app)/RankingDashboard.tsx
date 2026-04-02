'use client'
// RankingDashboard.tsx — Dashboard completo de ranking con filtros
//
// Por qué es Client Component ('use client'):
//   Necesita useState para los filtros interactivos (toggles, selects) y la
//   selección de proyectos para el comparador.
//   Recibe todos los datos ya hidratados desde el Server Component (page.tsx)
//   y filtra/ordena en el cliente — sin peticiones adicionales al servidor.
//   Para una app personal con ~20 proyectos, esto es más simple y rápido.

import { useState, useMemo, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScoreBar } from '@/components/ScoreBar'
import { SemaforoROI } from '@/components/SemaforoROI'
import { MontoPrivado } from '@/components/MontoPrivado'

// Leaflet requiere window/document — solo puede ejecutarse en el browser (no SSR).
// dynamic + ssr:false hace que Next.js omita este módulo durante el render de servidor.
const MapaProyectos = dynamic(() => import('@/components/MapaProyectos'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-xl border border-zinc-800
                    bg-zinc-900/60 text-zinc-500 text-sm"
         style={{ height: 500 }}>
      Cargando mapa...
    </div>
  ),
})

// ─── Tipo de fila de la tabla ─────────────────────────────────────────────────
// Subconjunto de la tabla `proyectos` que necesita el dashboard.
// Viene de Supabase y es serializable (sin funciones, solo datos primitivos).

export type ProyectoRanking = {
  id: string
  nombre: string
  tipo: string | null
  sector: string
  estado: string
  preferencia: string | null
  unidades_disponibles: number | null
  permite_airbnb: boolean
  latitud: number | null
  longitud: number | null

  // Scores (null si el proyecto aún no fue recalculado)
  score_total: number | null
  score_roi: number | null
  score_ubicacion: number | null
  score_constructora: number | null
  score_entrega: number | null
  score_precio_m2: number | null
  score_calidad: number | null
  score_confianza: number | null

  // Métricas financieras
  roi_anual: number | null
  cobertura_con_airbnb: number | null
  precio_base: number
  precio_m2: number | null
  cuota_mensual: number | null
  flujo_con_airbnb: number | null
  meses_espera: number | null
}

interface Props {
  proyectos: ProyectoRanking[]
}

// ─── Tipos para ordenamiento y visibilidad de columnas ────────────────────────

// Columnas por las que se puede ordenar
type SortKey = 'score_total' | 'roi_anual' | 'cobertura_con_airbnb' | 'precio_base' | 'cuota_mensual'
type SortDir = 'asc' | 'desc'

// Columnas opcionales que el usuario puede mostrar u ocultar
type ColId = 'cobertura' | 'precio' | 'cuota' | 'sector'
const COLS_DEFAULT: ColId[] = ['cobertura', 'precio', 'cuota', 'sector']
const COL_LABELS: Record<ColId, string> = {
  cobertura: 'Cobertura',
  precio:    'Precio',
  cuota:     'Cuota/mes',
  sector:    'Sector',
}

// ─── Helpers de badge ─────────────────────────────────────────────────────────

function BadgeEscasez({ n }: { n: number | null }) {
  if (n === null) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px]
                       font-medium bg-zinc-800 text-zinc-500">
        ?
      </span>
    )
  }
  if (n <= 3) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px]
                       font-medium bg-red-900/60 text-red-300 border border-red-700/50">
        ¡Últimas!
      </span>
    )
  }
  if (n <= 10) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px]
                       font-medium bg-amber-900/60 text-amber-300 border border-amber-700/50">
        Pocas
      </span>
    )
  }
  return null
}

function BadgeNoAirbnb() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px]
                     font-medium bg-red-900/60 text-red-300 border border-red-700/50">
      ✕ Airbnb
    </span>
  )
}

// ─── Panel resumen — 3 tarjetas ───────────────────────────────────────────────

function PanelResumen({ proyectos }: { proyectos: ProyectoRanking[] }) {
  const activos = proyectos.filter(p => p.estado !== 'descartado')

  // Mejor score
  const mejorScore = activos.reduce<ProyectoRanking | null>((best, p) => {
    if (p.score_total === null) return best
    if (best === null || (best.score_total ?? 0) < p.score_total) return p
    return best
  }, null)

  // Mejor ROI
  const mejorROI = activos.reduce<ProyectoRanking | null>((best, p) => {
    if (p.roi_anual === null) return best
    if (best === null || (best.roi_anual ?? 0) < p.roi_anual) return p
    return best
  }, null)

  // Urgencia: menor unidades_disponibles entre los que tienen valor numérico ≤10
  const conEscasez = activos
    .filter(p => p.unidades_disponibles !== null && p.unidades_disponibles <= 10)
    .sort((a, b) => (a.unidades_disponibles ?? 99) - (b.unidades_disponibles ?? 99))
  const masUrgente = conEscasez[0] ?? null

  const labelProyecto = (p: ProyectoRanking) =>
    p.tipo ? `${p.nombre} · ${p.tipo}` : p.nombre

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">

      {/* Mejor score */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Mejor score</p>
        {mejorScore ? (
          <>
            <p className="text-sm font-medium text-zinc-100 truncate">{labelProyecto(mejorScore)}</p>
            <div className="mt-2">
              <ScoreBar score={mejorScore.score_total} />
            </div>
            {mejorScore.roi_anual !== null && (
              <p className="mt-1 text-xs text-zinc-500">
                ROI: <span className="text-zinc-300">{mejorScore.roi_anual.toFixed(1)}%</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-600">Sin datos</p>
        )}
      </div>

      {/* Mejor ROI */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Mejor ROI</p>
        {mejorROI ? (
          <>
            <p className="text-sm font-medium text-zinc-100 truncate">{labelProyecto(mejorROI)}</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-400">
              {mejorROI.roi_anual!.toFixed(1)}%
            </p>
            <p className="text-xs text-zinc-500">anual proyectado</p>
          </>
        ) : (
          <p className="text-sm text-zinc-600">Sin datos</p>
        )}
      </div>

      {/* Urgencia */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Urgencia</p>
        {masUrgente ? (
          <>
            <p className="text-sm font-medium text-zinc-100 truncate">{labelProyecto(masUrgente)}</p>
            <div className="mt-2 flex items-center gap-2">
              <BadgeEscasez n={masUrgente.unidades_disponibles} />
              <span className="text-xs text-zinc-500">
                {masUrgente.unidades_disponibles} unidades
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{masUrgente.sector}</p>
          </>
        ) : (
          <p className="text-sm text-zinc-600">Sin alerta de escasez</p>
        )}
      </div>

    </div>
  )
}

// ─── Barra de filtros ─────────────────────────────────────────────────────────

interface FiltrosActivos {
  soloFirstChoice: boolean
  mejorPorProyecto: boolean
  tipo: string        // '' = todos
  sector: string      // '' = todos
  topN: number        // 0 = todos
  estado: 'activos' | 'descartados' | 'todos'
}

const FILTROS_INICIAL: FiltrosActivos = {
  soloFirstChoice: false,
  mejorPorProyecto: false,
  tipo: '',
  sector: '',
  topN: 0,
  estado: 'activos',
}

function BarraFiltros({
  filtros,
  onChange,
  tiposDisponibles,
  sectoresDisponibles,
}: {
  filtros: FiltrosActivos
  onChange: (f: FiltrosActivos) => void
  tiposDisponibles: string[]
  sectoresDisponibles: string[]
}) {
  function set<K extends keyof FiltrosActivos>(key: K, val: FiltrosActivos[K]) {
    onChange({ ...filtros, [key]: val })
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4 items-center">

      {/* Toggle primera opción */}
      <button
        onClick={() => set('soloFirstChoice', !filtros.soloFirstChoice)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          filtros.soloFirstChoice
            ? 'bg-amber-900/40 text-amber-300 border-amber-700/60'
            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
        }`}
      >
        ★ Primera opción
      </button>

      {/* Toggle mejor por proyecto */}
      <button
        onClick={() => set('mejorPorProyecto', !filtros.mejorPorProyecto)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          filtros.mejorPorProyecto
            ? 'bg-blue-900/40 text-blue-300 border-blue-700/60'
            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
        }`}
      >
        Mejor / proyecto
      </button>

      {/* Filtro tipo */}
      {tiposDisponibles.length > 1 && (
        <select
          value={filtros.tipo}
          onChange={e => set('tipo', e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300
                     border border-zinc-700 focus:outline-none focus:border-zinc-500"
        >
          <option value="">Todos los tipos</option>
          {tiposDisponibles.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}

      {/* Filtro sector */}
      {sectoresDisponibles.length > 1 && (
        <select
          value={filtros.sector}
          onChange={e => set('sector', e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300
                     border border-zinc-700 focus:outline-none focus:border-zinc-500"
        >
          <option value="">Todos los sectores</option>
          {sectoresDisponibles.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}

      {/* Filtro Top N */}
      <select
        value={filtros.topN}
        onChange={e => set('topN', Number(e.target.value))}
        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300
                   border border-zinc-700 focus:outline-none focus:border-zinc-500"
      >
        <option value={0}>Todos</option>
        <option value={5}>Top 5</option>
        <option value={10}>Top 10</option>
      </select>

      {/* Filtro estado */}
      <select
        value={filtros.estado}
        onChange={e => set('estado', e.target.value as FiltrosActivos['estado'])}
        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300
                   border border-zinc-700 focus:outline-none focus:border-zinc-500"
      >
        <option value="activos">Activos</option>
        <option value="descartados">Descartados</option>
        <option value="todos">Todos</option>
      </select>

    </div>
  )
}

// ─── Encabezado de columna ordenable ──────────────────────────────────────────
// Muestra ↓ (desc), ↑ (asc), o ↕ (sin ordenar) según el estado actual.

function ThOrdenable({
  label,
  sortK,
  currentKey,
  currentDir,
  onSort,
  className,
}: {
  label: string
  sortK: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const activo = currentKey === sortK
  return (
    <th
      onClick={() => onSort(sortK)}
      className={`text-left px-4 py-3 text-xs font-medium uppercase tracking-wide
                  cursor-pointer select-none transition-colors
                  ${activo ? 'text-zinc-300' : 'text-zinc-500 hover:text-zinc-300'}
                  ${className ?? ''}`}
    >
      {label}
      <span className="ml-1 font-normal">
        {activo ? (currentDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </th>
  )
}

// ─── Selector de columnas ─────────────────────────────────────────────────────
// Dropdown con checkboxes para mostrar/ocultar columnas opcionales.
// Usa onBlur en el contenedor para cerrar al perder el foco — sin librería externa.

function SelectorColumnas({
  colsVisibles,
  onToggle,
}: {
  colsVisibles: Set<ColId>
  onToggle: (col: ColId) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cierra el menú al hacer click fuera del contenedor
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    if (abierto) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [abierto])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto(v => !v)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          abierto
            ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
        }`}
      >
        ⚙ Columnas
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700
                        rounded-lg shadow-xl p-2 min-w-[160px]">
          {(Object.entries(COL_LABELS) as [ColId, string][]).map(([id, label]) => (
            <label
              key={id}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer
                         hover:bg-zinc-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={colsVisibles.has(id)}
                onChange={() => onToggle(id)}
                className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs text-zinc-300">{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tabla de ranking ─────────────────────────────────────────────────────────

interface TablaRankingProps {
  proyectos: ProyectoRanking[]
  seleccionados: Set<string>
  onToggle: (id: string) => void
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  colsVisibles: Set<ColId>
  onToggleCol: (col: ColId) => void
}

function TablaRanking({
  proyectos,
  seleccionados,
  onToggle,
  sortKey,
  sortDir,
  onSort,
  colsVisibles,
  onToggleCol,
}: TablaRankingProps) {
  if (proyectos.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-sm">No hay unidades que mostrar con los filtros actuales.</p>
        <Link href="/nuevo" className="mt-3 inline-block text-xs text-zinc-500
                                      hover:text-zinc-300 underline underline-offset-2">
          + Agregar primera unidad
        </Link>
      </div>
    )
  }

  const maxSeleccion = seleccionados.size >= 3

  return (
    <div>
      {/* Barra de control de la tabla: selector de columnas */}
      <div className="flex justify-end mb-2">
        <SelectorColumnas colsVisibles={colsVisibles} onToggle={onToggleCol} />
      </div>

      {/* Tabla con scroll horizontal en móvil (overflow-x-auto) */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              {/* Columna checkbox */}
              <th className="px-3 py-3 w-8" />
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide w-6">
                #
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide min-w-[180px]">
                Unidad
              </th>
              <ThOrdenable
                label="Score"
                sortK="score_total"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="min-w-[160px]"
              />
              <ThOrdenable
                label="ROI"
                sortK="roi_anual"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={onSort}
              />
              {colsVisibles.has('cobertura') && (
                <ThOrdenable
                  label="Cobertura"
                  sortK="cobertura_con_airbnb"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="hidden sm:table-cell"
                />
              )}
              {colsVisibles.has('precio') && (
                <ThOrdenable
                  label="Precio"
                  sortK="precio_base"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="hidden md:table-cell text-right"
                />
              )}
              {colsVisibles.has('cuota') && (
                <ThOrdenable
                  label="Cuota/mes"
                  sortK="cuota_mensual"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="hidden md:table-cell text-right"
                />
              )}
              {colsVisibles.has('sector') && (
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide hidden lg:table-cell">
                  Sector
                </th>
              )}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {proyectos.map((p, idx) => (
              <FilaRanking
                key={p.id}
                proyecto={p}
                posicion={idx + 1}
                seleccionado={seleccionados.has(p.id)}
                deshabilitado={maxSeleccion && !seleccionados.has(p.id)}
                onToggle={onToggle}
                colsVisibles={colsVisibles}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Fila individual ──────────────────────────────────────────────────────────

interface FilaRankingProps {
  proyecto: ProyectoRanking
  posicion: number
  seleccionado: boolean
  deshabilitado: boolean
  onToggle: (id: string) => void
  colsVisibles: Set<ColId>
}

function FilaRanking({ proyecto: p, posicion, seleccionado, deshabilitado, onToggle, colsVisibles }: FilaRankingProps) {
  const descartado = p.estado === 'descartado'

  return (
    <tr
      onClick={() => !deshabilitado && onToggle(p.id)}
      className={`group transition-colors hover:bg-zinc-800/40 cursor-pointer ${
        descartado ? 'opacity-50' : ''
      } ${seleccionado ? 'bg-blue-900/20' : ''}`}
    >

      {/* Checkbox de selección para comparar */}
      <td
        className="px-3 py-3 align-middle"
        onClick={e => e.stopPropagation()}  // evita doble disparo con el onClick del tr
      >
        <input
          type="checkbox"
          checked={seleccionado}
          disabled={deshabilitado}
          onChange={() => onToggle(p.id)}
          className={`w-3.5 h-3.5 rounded border accent-blue-500 cursor-pointer
                      ${deshabilitado ? 'opacity-30 cursor-not-allowed' : ''}`}
        />
      </td>

      {/* Posición */}
      <td className="px-4 py-3 text-xs text-zinc-600 font-mono">{posicion}</td>

      {/* Nombre + badges */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Estrella de primera opción */}
            {p.preferencia === 'primera_opcion' && (
              <span className="text-amber-400 text-xs leading-none">★</span>
            )}
            <span className={`font-medium text-sm leading-tight ${
              descartado ? 'text-zinc-500 line-through' : 'text-zinc-100'
            }`}>
              {p.nombre}
            </span>
          </div>
          {/* Tipo + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {p.tipo && (
              <span className="text-[11px] text-zinc-500">{p.tipo}</span>
            )}
            {!p.permite_airbnb && <BadgeNoAirbnb />}
            <BadgeEscasez n={p.unidades_disponibles} />
          </div>
        </div>
      </td>

      {/* Score con barra */}
      <td className="px-4 py-3 w-40">
        <ScoreBar score={p.score_total} />
      </td>

      {/* ROI */}
      <td className="px-4 py-3">
        <SemaforoROI tipo="roi" valor={p.roi_anual} />
      </td>

      {/* Cobertura con Airbnb */}
      {colsVisibles.has('cobertura') && (
        <td className="px-4 py-3 hidden sm:table-cell">
          <SemaforoROI tipo="cobertura" valor={p.cobertura_con_airbnb} />
        </td>
      )}

      {/* Precio base */}
      {colsVisibles.has('precio') && (
        <td className="px-4 py-3 text-right hidden md:table-cell">
          <MontoPrivado
            valor={p.precio_base}
            prefijo="$"
            decimales={0}
            className="text-xs text-zinc-300"
          />
        </td>
      )}

      {/* Cuota mensual */}
      {colsVisibles.has('cuota') && (
        <td className="px-4 py-3 text-right hidden md:table-cell">
          {p.cuota_mensual !== null ? (
            <MontoPrivado
              valor={p.cuota_mensual}
              prefijo="$"
              decimales={0}
              className="text-xs text-zinc-300"
            />
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </td>
      )}

      {/* Sector */}
      {colsVisibles.has('sector') && (
        <td className="px-4 py-3 hidden lg:table-cell">
          <span className="text-xs text-zinc-500">{p.sector}</span>
        </td>
      )}

      {/* Botón ver detalle — stopPropagation para que no active el toggle */}
      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
        <Link
          href={`/proyecto/${p.id}`}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors
                     opacity-0 group-hover:opacity-100"
        >
          Ver →
        </Link>
      </td>
    </tr>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RankingDashboard({ proyectos }: Props) {
  const [filtros, setFiltros] = useState<FiltrosActivos>(FILTROS_INICIAL)
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')
  // Set de ids seleccionados para comparar (máx 3)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  // Ordenamiento de la tabla
  const [sortKey, setSortKey] = useState<SortKey>('score_total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  // Columnas visibles — se inicia con defaults para evitar hydration mismatch SSR/localStorage
  const [colsVisibles, setColsVisibles] = useState<Set<ColId>>(new Set(COLS_DEFAULT))
  const router = useRouter()

  // Sincronizar columnas visibles con localStorage después del montaje (client-only)
  useEffect(() => {
    const saved = localStorage.getItem('ranking_cols')
    if (saved) {
      try { setColsVisibles(new Set(JSON.parse(saved) as ColId[])) } catch { /* ignora JSON inválido */ }
    }
  }, [])

  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 3) {
        next.add(id)
      }
      return next
    })
  }

  function irAComparar() {
    const ids = Array.from(seleccionados).join(',')
    router.push(`/comparar?ids=${ids}`)
  }

  // Alterna el ordenamiento: mismo key → invierte dirección; nuevo key → desc
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Muestra/oculta una columna y persiste la preferencia en localStorage
  function toggleCol(col: ColId) {
    setColsVisibles(prev => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      localStorage.setItem('ranking_cols', JSON.stringify(Array.from(next)))
      return next
    })
  }

  // Listas únicas para los selects de tipo y sector
  const tiposDisponibles = useMemo(() => {
    const set = new Set(proyectos.map(p => p.tipo).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [proyectos])

  const sectoresDisponibles = useMemo(() => {
    const set = new Set(proyectos.map(p => p.sector))
    return Array.from(set).sort()
  }, [proyectos])

  // Pipeline de filtros + ordenamiento
  // useMemo evita recalcular si ni los proyectos ni los filtros/sort cambiaron.
  const filasFiltradas = useMemo(() => {
    let resultado = [...proyectos]

    // 1. Filtro por estado
    if (filtros.estado === 'activos') {
      resultado = resultado.filter(p => p.estado !== 'descartado')
    } else if (filtros.estado === 'descartados') {
      resultado = resultado.filter(p => p.estado === 'descartado')
    }

    // 2. Solo primera opción
    if (filtros.soloFirstChoice) {
      resultado = resultado.filter(p => p.preferencia === 'primera_opcion')
    }

    // 3. Filtro por tipo
    if (filtros.tipo) {
      resultado = resultado.filter(p => p.tipo === filtros.tipo)
    }

    // 4. Filtro por sector
    if (filtros.sector) {
      resultado = resultado.filter(p => p.sector === filtros.sector)
    }

    // 5. Ordenar según sortKey + sortDir (null siempre al final)
    resultado.sort((a, b) => {
      const av = a[sortKey] as number | null
      const bv = b[sortKey] as number | null
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return sortDir === 'desc' ? bv - av : av - bv
    })

    // 6. "Mejor de cada proyecto": agrupar por nombre, conservar solo la de mayor score
    if (filtros.mejorPorProyecto) {
      const mapa = new Map<string, ProyectoRanking>()
      for (const p of resultado) {
        const existente = mapa.get(p.nombre)
        if (!existente) {
          mapa.set(p.nombre, p)
        } else {
          // Comparar scores (null cuenta como -1)
          const scoreActual = existente.score_total ?? -1
          const scoreNuevo  = p.score_total ?? -1
          if (scoreNuevo > scoreActual) mapa.set(p.nombre, p)
        }
      }
      // Preservar el orden (ya estaba ordenado por sortKey)
      resultado = resultado.filter(p => mapa.get(p.nombre)?.id === p.id)
    }

    // 7. Top N
    if (filtros.topN > 0) {
      resultado = resultado.slice(0, filtros.topN)
    }

    return resultado
  }, [proyectos, filtros, sortKey, sortDir])

  return (
    <div>
      {/* Título + toggle Lista|Mapa + botón nuevo */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Ranking</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {filasFiltradas.length} unidad{filasFiltradas.length !== 1 ? 'es' : ''}
            {filtros.estado !== 'todos' ? ` · ${filtros.estado}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Lista | Mapa — solo visible cuando hay proyectos */}
          {proyectos.length > 0 && (
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
              <button
                onClick={() => setVista('lista')}
                className={`px-3 py-1.5 transition-colors ${
                  vista === 'lista'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ☰ Lista
              </button>
              <button
                onClick={() => setVista('mapa')}
                className={`px-3 py-1.5 transition-colors ${
                  vista === 'mapa'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ⊙ Mapa
              </button>
            </div>
          )}

          <Link
            href="/nuevo"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm
                       bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors
                       border border-zinc-700"
          >
            <span className="text-base leading-none">+</span>
            <span>Nueva</span>
          </Link>
        </div>
      </div>

      {/* Panel resumen — solo si hay proyectos */}
      {proyectos.length > 0 && (
        <PanelResumen proyectos={proyectos} />
      )}

      {/* Barra de filtros — aplica tanto a lista como a mapa */}
      {proyectos.length > 0 && (
        <BarraFiltros
          filtros={filtros}
          onChange={setFiltros}
          tiposDisponibles={tiposDisponibles}
          sectoresDisponibles={sectoresDisponibles}
        />
      )}

      {/* Vista: Lista o Mapa */}
      {vista === 'lista' ? (
        <TablaRanking
          proyectos={filasFiltradas}
          seleccionados={seleccionados}
          onToggle={toggleSeleccion}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          colsVisibles={colsVisibles}
          onToggleCol={toggleCol}
        />
      ) : (
        <MapaProyectos proyectos={filasFiltradas} />
      )}

      {/* Botón flotante "Comparar (N)" — visible solo con 2 o 3 seleccionados */}
      {/* fixed: se posiciona relativo al viewport, no al scroll — queda siempre visible */}
      {seleccionados.size >= 2 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={irAComparar}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium
                       bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-900/40
                       transition-all active:scale-95"
          >
            <span>⇄</span>
            <span>Comparar ({seleccionados.size})</span>
          </button>
        </div>
      )}
    </div>
  )
}
