'use client'
// ComparadorTabla.tsx — Tabla de comparación lado a lado (2-3 proyectos)
//
// Por qué Client Component:
//   MontoPrivado usa useContext (PrivacyContext) que solo existe en el cliente.
//   El resaltado del ganador y el formateo son cálculos puros sin estado —
//   toda la interactividad real está en RankingDashboard (selección de filas).

import Link from 'next/link'
import { ScoreBar } from '@/components/ScoreBar'
import { SemaforoROI } from '@/components/SemaforoROI'
import { MontoPrivado } from '@/components/MontoPrivado'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ProyectoComparar = {
  id: string
  nombre: string
  tipo: string | null
  sector: string
  estado: string
  preferencia: string | null
  // Financiero
  precio_total: number | null
  cuota_mensual: number | null
  alicuota_mensual: number | null
  flujo_con_airbnb: number | null
  cobertura_con_airbnb: number | null
  roi_anual: number | null
  ganancia_neta: number | null
  monto_entrada: number | null
  monto_durante_construccion: number | null
  // Airbnb
  precio_noche_estimado: number | null
  ocupacion_estimada: number | null
  ingreso_neto_mensual: number | null
  // Unidad
  area_interna_m2: number | null
  area_balcon_m2: number | null
  precio_m2: number | null
  piso: number | null
  pisos_totales: number | null
  meses_espera: number | null
  tiene_parqueadero: boolean
  tiene_bodega: boolean
  viene_amoblado: boolean
  amenidades: string[] | null
  // Scores
  score_total: number | null
  score_roi: number | null
  score_ubicacion: number | null
  score_constructora: number | null
  score_entrega: number | null
  score_equipamiento: number | null
  score_precio_m2: number | null
  score_calidad: number | null
  score_confianza: number | null
}

export type CriterioComparar = {
  clave: string
  nombre: string
  peso: number
  orden: number
}

interface Props {
  proyectos: ProyectoComparar[]
  criterios: CriterioComparar[]
}

// ─── Helpers de resaltado del ganador ─────────────────────────────────────────
//
// mayor=true  → el mayor valor gana  (ROI, cobertura, flujo, etc.)
// mayor=false → el menor valor gana  (precio, cuota, meses espera)
// Devuelve el índice del ganador, o -1 si todos son iguales o nulos.

function idxGanador(valores: (number | null)[], mayor: boolean): number {
  const numericos = valores.filter((v): v is number => v !== null)
  if (numericos.length < 2) return -1
  const referencia = mayor ? Math.max(...numericos) : Math.min(...numericos)
  if (numericos.every(v => v === referencia)) return -1
  return valores.findIndex(v => v === referencia)
}

const CELDA_GANADORA = 'bg-emerald-900/30'

// ─── Sub-componentes de sección ───────────────────────────────────────────────

function SeccionHeader({ titulo }: { titulo: string }) {
  return (
    <tr>
      <td
        colSpan={99}
        className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider
                   text-zinc-500 bg-zinc-900/80 border-t border-zinc-800"
      >
        {titulo}
      </td>
    </tr>
  )
}

// Fila genérica numérica con resaltado del ganador
function Fila({
  label,
  valores,
  ganador,
  render,
}: {
  label: string
  valores: (number | null)[]
  ganador: number
  render: (v: number | null) => React.ReactNode
}) {
  return (
    <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
        {label}
      </td>
      {valores.map((v, idx) => (
        <td
          key={idx}
          className={`px-4 py-3 text-xs align-middle min-w-[160px] ${
            ganador === idx ? CELDA_GANADORA : ''
          }`}
        >
          {render(v)}
        </td>
      ))}
    </tr>
  )
}

// Fila de ScoreBar
function FilaScore({
  label,
  scores,
  ganador,
}: {
  label: string
  scores: (number | null)[]
  ganador: number
}) {
  return (
    <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
        {label}
      </td>
      {scores.map((s, idx) => (
        <td
          key={idx}
          className={`px-4 py-3 align-middle min-w-[160px] ${
            ganador === idx ? CELDA_GANADORA : ''
          }`}
        >
          <ScoreBar score={s} />
        </td>
      ))}
    </tr>
  )
}

// Fila de booleanos (✓ / —) sin ganador
function FilaBool({ label, valores }: { label: string; valores: boolean[] }) {
  return (
    <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
        {label}
      </td>
      {valores.map((v, idx) => (
        <td key={idx} className="px-4 py-3 text-xs align-middle min-w-[160px]">
          {v
            ? <span className="text-emerald-400 font-medium">✓</span>
            : <span className="text-zinc-600">—</span>
          }
        </td>
      ))}
    </tr>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ComparadorTabla({ proyectos, criterios }: Props) {
  // Helper para extraer array de valores numéricos de un campo
  const get = (campo: keyof ProyectoComparar) =>
    proyectos.map(p => p[campo] as number | null)

  // Ganador para campos numéricos
  const ganador = (campo: keyof ProyectoComparar, mayor: boolean) =>
    idxGanador(get(campo), mayor)

  // Aporte pre-entrega = monto_entrada + monto_durante_construccion
  // (aporte_propio_total no se almacena en DB, se aproxima con estos dos campos)
  const aportePreEntrega = proyectos.map(p =>
    p.monto_entrada !== null && p.monto_durante_construccion !== null
      ? p.monto_entrada + p.monto_durante_construccion
      : null
  )

  // Cantidad de amenidades por proyecto (para determinar el ganador)
  const countAmenidades = proyectos.map(p => (p.amenidades ?? []).length)

  return (
    <div className="max-w-6xl mx-auto">

      {/* Barra de acciones — oculta en impresión */}
      <div className="print:hidden mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Ranking
        </Link>
        {/* Exportar PDF — abre el diálogo de impresión del navegador.
            El usuario elige "Guardar como PDF" en la impresora. */}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100
                     border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5
                     transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Exportar PDF
        </button>
      </div>

      <h1 className="text-xl font-semibold text-zinc-100 mb-6">
        Comparador
        <span className="ml-2 text-sm font-normal text-zinc-500">{proyectos.length} unidades</span>
      </h1>

      {/* Scroll horizontal en móvil */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">

          {/* ── Encabezado por columna ── */}
          <thead>
            <tr className="bg-zinc-900/60 border-b border-zinc-800">
              <th className="px-4 py-4 w-40" />
              {proyectos.map(p => (
                <th key={p.id} className="px-4 py-4 text-left min-w-[160px] align-top">
                  <div className="flex flex-col gap-1">
                    {p.preferencia === 'primera_opcion' && (
                      <span className="text-amber-400 text-xs">★ Primera opción</span>
                    )}
                    <span className="font-semibold text-zinc-100 text-sm leading-tight">
                      {p.nombre}
                    </span>
                    {p.tipo && <span className="text-[11px] text-zinc-500">{p.tipo}</span>}
                    <span className="text-[11px] text-zinc-500">{p.sector}</span>
                    <span className="text-[11px] text-zinc-600 capitalize">
                      {p.estado.replace('_', ' ')}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>

            {/* ── Sección Financiero ── */}
            <SeccionHeader titulo="Financiero" />

            <Fila
              label="Precio total"
              valores={get('precio_total')}
              ganador={ganador('precio_total', false)}
              render={v => v !== null
                ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                : <span className="text-zinc-600">—</span>
              }
            />

            <Fila
              label="Alícuota/mes"
              valores={get('alicuota_mensual')}
              ganador={ganador('alicuota_mensual', false)}
              render={v => v !== null
                ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                : <span className="text-zinc-600">—</span>
              }
            />

            <Fila
              label="Cuota mensual"
              valores={get('cuota_mensual')}
              ganador={ganador('cuota_mensual', false)}
              render={v => v !== null
                ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                : <span className="text-zinc-600">—</span>
              }
            />

            {/* Aporte pre-entrega calculado en cliente (entrada + durante obra) */}
            <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
                Aporte pre-entrega
              </td>
              {aportePreEntrega.map((v, idx) => {
                const g = idxGanador(aportePreEntrega, false)
                return (
                  <td key={idx} className={`px-4 py-3 text-xs align-middle min-w-[160px] ${g === idx ? CELDA_GANADORA : ''}`}>
                    {v !== null
                      ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                      : <span className="text-zinc-600">—</span>
                    }
                  </td>
                )
              })}
            </tr>

            {/* Flujo c/Airbnb — verde si >0 */}
            <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
                Flujo c/Airbnb
              </td>
              {proyectos.map((p, idx) => {
                const g = ganador('flujo_con_airbnb', true)
                return (
                  <td key={p.id} className={`px-4 py-3 text-xs align-middle min-w-[160px] ${g === idx ? CELDA_GANADORA : ''}`}>
                    {p.flujo_con_airbnb !== null
                      ? <MontoPrivado
                          valor={p.flujo_con_airbnb}
                          prefijo="$"
                          decimales={0}
                          className={`font-mono ${p.flujo_con_airbnb > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                        />
                      : <span className="text-zinc-600">—</span>
                    }
                  </td>
                )
              })}
            </tr>

            {/* Cobertura c/Airbnb — semáforo */}
            <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
                Cobertura c/Airbnb
              </td>
              {proyectos.map((p, idx) => {
                const g = ganador('cobertura_con_airbnb', true)
                return (
                  <td key={p.id} className={`px-4 py-3 align-middle min-w-[160px] ${g === idx ? CELDA_GANADORA : ''}`}>
                    <SemaforoROI tipo="cobertura" valor={p.cobertura_con_airbnb} />
                  </td>
                )
              })}
            </tr>

            {/* ROI anual — semáforo */}
            <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
                ROI anual
              </td>
              {proyectos.map((p, idx) => {
                const g = ganador('roi_anual', true)
                return (
                  <td key={p.id} className={`px-4 py-3 align-middle min-w-[160px] ${g === idx ? CELDA_GANADORA : ''}`}>
                    <SemaforoROI tipo="roi" valor={p.roi_anual} />
                  </td>
                )
              })}
            </tr>

            <Fila
              label="Ganancia neta"
              valores={get('ganancia_neta')}
              ganador={ganador('ganancia_neta', true)}
              render={v => v !== null
                ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                : <span className="text-zinc-600">—</span>
              }
            />

            {/* ── Sección Airbnb ── */}
            <SeccionHeader titulo="Airbnb" />

            <Fila
              label="Precio/noche est."
              valores={get('precio_noche_estimado')}
              ganador={ganador('precio_noche_estimado', true)}
              render={v => v !== null
                ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                : <span className="text-zinc-600">—</span>
              }
            />

            <Fila
              label="Ocupación est."
              valores={get('ocupacion_estimada')}
              ganador={ganador('ocupacion_estimada', true)}
              render={v => v !== null
                ? <span className="text-zinc-300 font-mono">{v}%</span>
                : <span className="text-zinc-600">—</span>
              }
            />

            <Fila
              label="Ingreso neto/mes"
              valores={get('ingreso_neto_mensual')}
              ganador={ganador('ingreso_neto_mensual', true)}
              render={v => v !== null
                ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                : <span className="text-zinc-600">—</span>
              }
            />

            {/* ── Sección Unidad ── */}
            <SeccionHeader titulo="Unidad" />

            <Fila
              label="Área interna m²"
              valores={get('area_interna_m2')}
              ganador={ganador('area_interna_m2', true)}
              render={v => v !== null
                ? <span className="text-zinc-300 font-mono">{v} m²</span>
                : <span className="text-zinc-600">—</span>
              }
            />

            <Fila
              label="Área balcón m²"
              valores={get('area_balcon_m2')}
              ganador={ganador('area_balcon_m2', true)}
              render={v => v !== null && v > 0
                ? <span className="text-zinc-300 font-mono">{v} m²</span>
                : <span className="text-zinc-600">—</span>
              }
            />

            <Fila
              label="Precio/m²"
              valores={get('precio_m2')}
              ganador={ganador('precio_m2', false)}
              render={v => v !== null
                ? <MontoPrivado valor={v} prefijo="$" decimales={0} className="text-zinc-300 font-mono" />
                : <span className="text-zinc-600">—</span>
              }
            />

            {/* Piso / Pisos totales — texto, sin ganador */}
            <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-middle">
                Piso / Pisos tot.
              </td>
              {proyectos.map(p => (
                <td key={p.id} className="px-4 py-3 text-xs text-zinc-300 align-middle min-w-[160px]">
                  {p.piso !== null
                    ? `${p.piso}${p.pisos_totales ? ` / ${p.pisos_totales}` : ''}`
                    : <span className="text-zinc-600">—</span>
                  }
                </td>
              ))}
            </tr>

            {/* Meses de espera — menor es mejor */}
            <Fila
              label="Meses espera"
              valores={get('meses_espera')}
              ganador={ganador('meses_espera', false)}
              render={v => v !== null
                ? <span className="text-zinc-300 font-mono">{v} meses</span>
                : <span className="text-zinc-600">—</span>
              }
            />

            <FilaBool label="Parqueadero" valores={proyectos.map(p => p.tiene_parqueadero)} />
            <FilaBool label="Bodega"      valores={proyectos.map(p => p.tiene_bodega)} />
            <FilaBool label="Amoblado"    valores={proyectos.map(p => p.viene_amoblado)} />

            {/* Amenidades — texto + ganador por cantidad */}
            <tr className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap w-40 align-top pt-4">
                Amenidades
              </td>
              {proyectos.map((p, idx) => {
                const lista = p.amenidades ?? []
                // Ganador = el que tiene más amenidades (si hay empate o todos tienen 0, nadie se resalta)
                const maxCount = Math.max(...countAmenidades)
                const esGanador = lista.length > 0 && lista.length === maxCount &&
                  countAmenidades.filter(c => c === maxCount).length === 1
                return (
                  <td
                    key={p.id}
                    className={`px-4 py-3 text-xs align-top min-w-[160px] ${esGanador ? CELDA_GANADORA : ''}`}
                  >
                    {lista.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {lista.map(a => (
                          <span
                            key={a}
                            className="inline-block px-1.5 py-0.5 rounded text-[10px]
                                       bg-zinc-800 text-zinc-400 border border-zinc-700"
                          >
                            {a}
                          </span>
                        ))}
                        <span className="text-zinc-600 text-[10px] mt-0.5 w-full">
                          {lista.length} amenidad{lista.length !== 1 ? 'es' : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                )
              })}
            </tr>

            {/* ── Sección Scoring ── */}
            <SeccionHeader titulo="Scoring" />

            <FilaScore
              label="Score total"
              scores={get('score_total')}
              ganador={idxGanador(get('score_total'), true)}
            />

            {/* Una fila por criterio activo */}
            {criterios.map(c => {
              const campo = `score_${c.clave}` as keyof ProyectoComparar
              const scores = proyectos.map(p => p[campo] as number | null)
              return (
                <FilaScore
                  key={c.clave}
                  label={c.nombre}
                  scores={scores}
                  ganador={idxGanador(scores, true)}
                />
              )
            })}

          </tbody>

          {/* ── Fila final: botón Ver detalle — oculta en impresión ── */}
          <tfoot className="print:hidden">
            <tr className="bg-zinc-900/60 border-t border-zinc-800">
              <td className="px-4 py-4" />
              {proyectos.map(p => (
                <td key={p.id} className="px-4 py-4 min-w-[160px]">
                  <Link
                    href={`/proyecto/${p.id}`}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400
                               hover:text-zinc-100 transition-colors border border-zinc-700
                               hover:border-zinc-500 rounded-lg px-3 py-1.5"
                  >
                    Ver detalle →
                  </Link>
                </td>
              ))}
            </tr>
          </tfoot>

        </table>
      </div>
    </div>
  )
}
