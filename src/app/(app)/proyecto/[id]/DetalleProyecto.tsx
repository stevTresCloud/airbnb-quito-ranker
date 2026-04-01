'use client'
// DetalleProyecto.tsx — Vista completa de una unidad
//
// Por qué Client Component:
//   Maneja tabs locales (useState) y las acciones de Server Actions con useActionState.
//   Recibe todos los datos ya hidratados desde el Server Component — no hace fetch propio.
//
// Tabs:
//   Resumen  → métricas financieras + desglose de scoring
//   Editar   → formulario completo con todos los ~50 campos
//   Adjuntos → AdjuntosPanel (upload + listado)
//   IA       → análisis narrativo + preguntas al vendedor

import { useState, useEffect, useActionState } from 'react'
import Link from 'next/link'
import { ScoreBar } from '@/components/ScoreBar'
import { SemaforoROI } from '@/components/SemaforoROI'
import { MontoPrivado } from '@/components/MontoPrivado'
import { AdjuntosPanel } from '@/components/AdjuntosPanel'
import type { AdjuntoRow } from '@/components/AdjuntosPanel'
import { guardarEdicion, recalcularUnidad, analizarConIA, eliminarProyecto } from './actions'
import type { ActionState } from './actions'
import type { ConfiguracionRow } from '@/app/(app)/configuracion/actions'

// ─── Tipos ────────────────────────────────────────────────────────────────────

// Tipo completo de la fila de proyectos (todos los campos de la tabla)
export type ProyectoDetalle = {
  id: string
  // Estado
  estado: string
  fecha_cotizacion: string | null
  // Identificación
  nombre: string
  constructora: string | null
  anos_constructora: number | null
  proyectos_entregados: number | null
  fiabilidad_constructora: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  reconocimientos_constructora: string | null
  // Ubicación
  direccion: string | null
  sector: string
  latitud: number | null
  longitud: number | null
  // Unidad
  tipo: string | null
  area_interna_m2: number
  area_balcon_m2: number
  area_total_m2: number | null
  dormitorios: number
  numero_banos: number
  piso: number | null
  pisos_totales: number | null
  unidades_totales_edificio: number | null
  orientacion: string | null
  materiales: string | null
  tipo_cocina: string | null
  tiene_balcon: boolean
  tiene_parqueadero: boolean
  costo_parqueadero: number
  tiene_bodega: boolean
  tiene_zona_lavanderia: boolean
  tiene_puerta_seguridad: boolean
  amenidades: string[]
  unidades_disponibles: number | null
  preferencia: string | null
  viene_amoblado: boolean
  costo_amoblado: number | null
  amoblado_financiado: boolean
  tasa_prestamo_amoblado: number | null
  meses_prestamo_amoblado: number | null
  // Factor subjetivo
  confianza_subjetiva: number | null
  confianza_notas: string | null
  // Precio
  precio_base: number
  precio_total: number | null
  precio_m2: number | null
  // Estructura de pago
  reserva: number | null
  porcentaje_entrada: number | null
  monto_entrada: number | null
  porcentaje_durante_construccion: number | null
  monto_durante_construccion: number | null
  num_cuotas_construccion: number | null
  porcentaje_contra_entrega: number | null
  monto_contra_entrega: number | null
  // Financiamiento
  banco: string | null
  tasa_anual: number | null
  anos_credito: number | null
  monto_financiar: number | null
  cuota_mensual: number | null
  total_intereses: number | null
  total_pagado_credito: number | null
  // Airbnb
  permite_airbnb: boolean
  tiene_administracion_airbnb_incluida: boolean
  porcentaje_gestion_airbnb: number | null
  alicuota_mensual: number
  avance_obra_porcentaje: number
  precio_noche_estimado: number | null
  ocupacion_estimada: number
  // Métricas Airbnb
  ingreso_bruto_mensual: number | null
  gastos_operativos: number | null
  ingreso_neto_mensual: number | null
  // Flujo
  sueldo_disponible: number | null
  flujo_sin_airbnb: number | null
  flujo_con_airbnb: number | null
  cobertura_sin_airbnb: number | null
  cobertura_con_airbnb: number | null
  // Timeline
  fecha_entrega: string | null
  meses_espera: number
  plusvalia_anual: number
  // Proyección
  meses_productivos: number | null
  airbnb_acumulado: number | null
  plusvalia_acumulada: number | null
  ganancia_bruta: number | null
  ganancia_neta: number | null
  roi_anual: number | null
  roi_aporte_propio: number | null
  // Scores
  score_roi: number | null
  score_ubicacion: number | null
  score_constructora: number | null
  score_entrega: number | null
  score_equipamiento: number | null
  score_precio_m2: number | null
  score_calidad: number | null
  score_confianza: number | null
  score_total: number | null
  // IA
  analisis_ia_generado: boolean
  fortaleza_ia: string | null
  riesgo_ia: string | null
  recomendacion_ia: string | null
  alerta_ia: string | null
  que_preguntar: string[]
  datos_faltantes: string[]
  // Misc
  notas: string | null
  created_at: string
  updated_at: string
}

export type CriterioRow = {
  id: string
  clave: string
  nombre: string
  descripcion: string | null
  peso: number
  orden: number | null
}

// ─── Constantes del formulario ────────────────────────────────────────────────
const TIPOS          = ['estudio', 'minisuite', 'suite', '1 dormitorio', '2 dormitorios']
const ESTADOS        = ['en_análisis', 'visitado', 'cotización_recibida', 'en_negociación', 'descartado', 'elegido']
const FIABILIDADES   = ['desconocida', 'conocida_sin_retrasos', 'conocida_con_retrasos', 'reputada']
const ORIENTACIONES  = ['norte', 'sur', 'este', 'oeste']
const MATERIALES     = ['básico', 'estándar', 'premium', 'lujo']
const TIPOS_COCINA   = ['americana', 'independiente']
const PREFERENCIAS   = ['', 'primera_opcion', 'alternativa']
const AMENIDADES_LIST = [
  { value: 'spa',             label: 'Spa' },
  { value: 'piscina',         label: 'Piscina / Infinity Pool' },
  { value: 'gimnasio',        label: 'Gimnasio' },
  { value: 'coworking',       label: 'Coworking' },
  { value: 'bbq',             label: 'BBQ' },
  { value: 'rooftop',         label: 'Rooftop' },
  { value: 'jacuzzi',         label: 'Jacuzzi' },
  { value: 'sauna',           label: 'Sauna' },
  { value: 'turco',           label: 'Turco' },
  { value: 'yoga',            label: 'Yoga / Pilates' },
  { value: 'bar',             label: 'Bar' },
  { value: 'zona_juegos',     label: 'Play Room / Zona Juegos' },
  { value: 'pet_zone',        label: 'Pet Zone' },
  { value: 'fire_pit',        label: 'Fire Pit' },
  { value: 'salon_eventos',   label: 'Salón Eventos' },
  { value: 'terraza',         label: 'Terraza Panorámica' },
]

// ─── Utilidades de formato ────────────────────────────────────────────────────
const usd  = (n: number | null) => n == null ? '—' : `$${n.toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const pct  = (n: number | null) => n == null ? '—' : `${n.toFixed(1)}%`
const num2 = (n: number | null) => n == null ? '—' : n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Mapa de claves de score a nombre de criterio ────────────────────────────
const SCORE_KEY_MAP: Record<string, keyof ProyectoDetalle> = {
  roi:           'score_roi',
  ubicacion:     'score_ubicacion',
  constructora:  'score_constructora',
  entrega:       'score_entrega',
  equipamiento:  'score_equipamiento',
  precio_m2:     'score_precio_m2',
  calidad:       'score_calidad',
  confianza:     'score_confianza',
}

// ─── Componente principal ─────────────────────────────────────────────────────
type Tab = 'resumen' | 'editar' | 'adjuntos' | 'ia'

interface Props {
  proyecto: ProyectoDetalle
  criterios: CriterioRow[]
  adjuntos: AdjuntoRow[]
  config?: ConfiguracionRow
}

export function DetalleProyecto({ proyecto, criterios, adjuntos, config }: Props) {
  const [tab, setTab] = useState<Tab>('resumen')

  // Acciones con useActionState — el tercer valor es el estado 'pending' (carga)
  // .bind(null, id) prerrellena el primer parámetro; solo quedan (state, formData)
  const [editState,    editAction,    editPending]    = useActionState<ActionState, FormData>(guardarEdicion.bind(null, proyecto.id), null)
  const [recalcState,  recalcAction,  recalcPending]  = useActionState<ActionState, FormData>(recalcularUnidad.bind(null, proyecto.id), null)
  const [iaState,      iaAction,      iaPending]      = useActionState<ActionState, FormData>(analizarConIA.bind(null, proyecto.id), null)
  const [elimState,    elimAction,    elimPending]    = useActionState<ActionState, FormData>(eliminarProyecto.bind(null, proyecto.id), null)

  // Después de guardar con éxito → volver a Resumen para ver los valores actualizados
  useEffect(() => {
    if (editState?.ok) setTab('resumen')
  }, [editState])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen',  label: 'Resumen' },
    { key: 'editar',   label: 'Editar' },
    { key: 'adjuntos', label: `Adjuntos${adjuntos.length > 0 ? ` (${adjuntos.length})` : ''}` },
    { key: 'ia',       label: iaState?.ok || proyecto.analisis_ia_generado ? '✓ IA' : 'Análisis IA' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2 inline-block">
            ← Ranking
          </Link>
          <h1 className="text-xl font-bold text-zinc-100 truncate">
            {proyecto.preferencia === 'primera_opcion' && <span className="text-amber-400 mr-1">★</span>}
            {proyecto.nombre}
          </h1>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {proyecto.tipo && (
              <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{proyecto.tipo}</span>
            )}
            <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{proyecto.sector}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              proyecto.estado === 'elegido'   ? 'bg-emerald-900/50 text-emerald-400' :
              proyecto.estado === 'descartado'? 'bg-red-900/50 text-red-400' :
                                               'bg-zinc-800 text-zinc-400'
            }`}>{proyecto.estado.replace('_', ' ')}</span>
            {!proyecto.permite_airbnb && (
              <span className="text-xs bg-red-900/60 text-red-300 px-2 py-0.5 rounded font-medium">
                ⚠ Sin Airbnb
              </span>
            )}
          </div>
        </div>

        {/* Score total destacado */}
        {proyecto.score_total !== null && (
          <div className="text-right flex-shrink-0">
            <div className={`text-3xl font-bold tabular-nums ${
              proyecto.score_total >= 70 ? 'text-emerald-400' :
              proyecto.score_total >= 50 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {Math.round(proyecto.score_total)}
            </div>
            <div className="text-xs text-zinc-500">score total</div>
          </div>
        )}
      </div>

      {/* ── Botones de acción rápida ─────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap items-center">
        {/* Recalcular — form sin campos de entrada, solo un botón */}
        <form action={recalcAction}>
          <button
            type="submit"
            disabled={recalcPending}
            className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700
                       text-zinc-300 disabled:opacity-50 transition-colors border border-zinc-700"
          >
            {recalcPending ? 'Recalculando…' : '↻ Recalcular esta unidad'}
          </button>
        </form>

        {/* Eliminar — confirm en el cliente antes de enviar al servidor */}
        <form action={elimAction}>
          <button
            type="submit"
            disabled={elimPending}
            className="text-xs px-3 py-1.5 rounded bg-red-950/60 hover:bg-red-900/60
                       text-red-400 disabled:opacity-50 transition-colors border border-red-900/50"
            onClick={e => {
              if (!confirm(`¿Eliminar "${proyecto.nombre}" permanentemente? Esta acción no se puede deshacer.`)) {
                e.preventDefault()
              }
            }}
          >
            {elimPending ? 'Eliminando…' : 'Eliminar unidad'}
          </button>
        </form>

        {recalcState?.error && <p className="text-xs text-red-400">{recalcState.error}</p>}
        {recalcState?.ok    && <p className="text-xs text-emerald-400">{recalcState.mensaje}</p>}
        {elimState?.error   && <p className="text-xs text-red-400">{elimState.error}</p>}
      </div>

      {/* ── Tabs de navegación ───────────────────────────────────────────── */}
      <div className="border-b border-zinc-800">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-zinc-300 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido por tab ─────────────────────────────────────────────── */}
      {tab === 'resumen'  && <TabResumen  proyecto={proyecto} criterios={criterios} />}
      {tab === 'editar'   && <TabEditar   proyecto={proyecto} action={editAction} state={editState} pending={editPending} config={config} />}
      {tab === 'adjuntos' && <AdjuntosPanel proyectoId={proyecto.id} adjuntosIniciales={adjuntos} />}
      {tab === 'ia'       && <TabIA        proyecto={proyecto} action={iaAction} state={iaState} pending={iaPending} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: RESUMEN
// ═══════════════════════════════════════════════════════════════════════════════
function TabResumen({ proyecto: p, criterios }: { proyecto: ProyectoDetalle; criterios: CriterioRow[] }) {
  return (
    <div className="space-y-6">

      {/* Alerta si no permite Airbnb */}
      {!p.permite_airbnb && (
        <div className="bg-red-950/60 border border-red-700 rounded-lg p-4">
          <p className="text-red-300 font-medium text-sm">⚠ Este proyecto no permite Airbnb</p>
          <p className="text-red-400/80 text-xs mt-1">
            El reglamento de copropiedad prohíbe el alquiler de corta estadía. Score total = 0.
          </p>
        </div>
      )}

      {/* ── Métricas clave (tarjetas 2x2) ──────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Métricas clave</h2>
        <div className="grid grid-cols-2 gap-3">
          <MetricaTarjeta label="ROI anual" valor={pct(p.roi_anual)} tipo="roi" valorNum={p.roi_anual} />
          <MetricaTarjeta label="Cobertura c/Airbnb" valor={pct(p.cobertura_con_airbnb)} tipo="cobertura" valorNum={p.cobertura_con_airbnb} />
          <MetricaTarjeta label="Flujo mensual c/Airbnb" valor={usd(p.flujo_con_airbnb)} />
          <MetricaTarjeta label="Cuota bancaria" valor={usd(p.cuota_mensual)} />
        </div>
      </section>

      {/* ── Precio y área ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Precio y área</h2>
        <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800 text-sm">
          <FilaDato label="Precio base"        valor={<MontoPrivado valor={p.precio_base} prefijo="$" />} />
          <FilaDato label="Precio total"       valor={<MontoPrivado valor={p.precio_total} prefijo="$" />} />
          <FilaDato label="Precio / m²"        valor={<MontoPrivado valor={p.precio_m2} prefijo="$" sufijo="/m²" />} />
          <FilaDato label="Área interna"       valor={`${p.area_interna_m2} m²`} />
          {p.area_balcon_m2 > 0 && (
            <FilaDato label="Área balcón"      valor={`${p.area_balcon_m2} m²`} />
          )}
          <FilaDato label="Área total"         valor={`${p.area_total_m2 ?? (p.area_interna_m2 + p.area_balcon_m2)} m²`} />
        </div>
      </section>

      {/* ── Estructura de pago ────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Estructura de pago</h2>
        <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800 text-sm">
          <FilaDato label="Reserva"            valor={<MontoPrivado valor={p.reserva} prefijo="$" />} />
          <FilaDato label="Entrada"            valor={`${p.porcentaje_entrada ?? '—'}% → `} extra={<MontoPrivado valor={p.monto_entrada} prefijo="$" />} />
          <FilaDato label="Durante obra"       valor={`${p.porcentaje_durante_construccion ?? '—'}% en ${p.num_cuotas_construccion ?? '—'} cuotas`} extra={<MontoPrivado valor={p.monto_durante_construccion} prefijo="$" />} />
          <FilaDato label="Contra entrega"     valor={`${p.porcentaje_contra_entrega ?? '—'}% → `} extra={<MontoPrivado valor={p.monto_contra_entrega} prefijo="$" />} />
        </div>
      </section>

      {/* ── Financiamiento bancario ───────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Financiamiento</h2>
        <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800 text-sm">
          <FilaDato label="Banco / entidad"    valor={p.banco ?? 'No especificado'} />
          <FilaDato label="Tasa anual"         valor={p.tasa_anual === 0 ? 'Sin intereses (directo)' : pct(p.tasa_anual)} />
          <FilaDato label="Plazo"              valor={p.anos_credito ? `${p.anos_credito} años` : '—'} />
          <FilaDato label="Cuota mensual"      valor={<MontoPrivado valor={p.cuota_mensual} prefijo="$" />} />
          <FilaDato label="Total intereses"    valor={<MontoPrivado valor={p.total_intereses} prefijo="$" />} />
        </div>
      </section>

      {/* ── Airbnb ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Airbnb</h2>
        <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800 text-sm">
          <FilaDato label="Precio / noche est."   valor={<MontoPrivado valor={p.precio_noche_estimado} prefijo="$" />} />
          <FilaDato label="Ocupación estimada"    valor={pct(p.ocupacion_estimada)} />
          <FilaDato label="Ingreso bruto/mes"     valor={<MontoPrivado valor={p.ingreso_bruto_mensual} prefijo="$" />} />
          <FilaDato label="Gastos operativos"     valor={<MontoPrivado valor={p.gastos_operativos} prefijo="$" />} />
          <FilaDato label="Ingreso neto/mes"      valor={<MontoPrivado valor={p.ingreso_neto_mensual} prefijo="$" />} />
          <FilaDato label="Alícuota mensual"      valor={<MontoPrivado valor={p.alicuota_mensual} prefijo="$" />} />
          {p.tiene_administracion_airbnb_incluida && (
            <FilaDato label="Gestión Airbnb"      valor={`Incluida (${p.porcentaje_gestion_airbnb ?? '—'}%)`} badge="emerald" />
          )}
        </div>
      </section>

      {/* ── Flujo mensual y cobertura ─────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Flujo mensual</h2>
        <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800 text-sm">
          <FilaDato label="Sueldo disponible"  valor={<MontoPrivado valor={p.sueldo_disponible} prefijo="$" />} />
          <FilaDato label="Flujo sin Airbnb"   valor={<MontoPrivado valor={p.flujo_sin_airbnb} prefijo="$" />} />
          <FilaDato label="Flujo con Airbnb"   valor={<MontoPrivado valor={p.flujo_con_airbnb} prefijo="$" />} />
          <FilaDato label="Cobertura sin Airbnb" valor={<SemaforoROI tipo="cobertura" valor={p.cobertura_sin_airbnb} />} />
          <FilaDato label="Cobertura con Airbnb" valor={<SemaforoROI tipo="cobertura" valor={p.cobertura_con_airbnb} />} />
        </div>
      </section>

      {/* ── Proyección N años ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Proyección ({p.meses_espera} meses espera + {p.meses_productivos ?? '—'} meses productivos)
        </h2>
        <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800 text-sm">
          <FilaDato label="Airbnb acumulado"   valor={<MontoPrivado valor={p.airbnb_acumulado} prefijo="$" />} />
          <FilaDato label="Plusvalía acumulada" valor={<MontoPrivado valor={p.plusvalia_acumulada} prefijo="$" />} />
          <FilaDato label="Ganancia bruta"     valor={<MontoPrivado valor={p.ganancia_bruta} prefijo="$" />} />
          <FilaDato label="Ganancia neta"      valor={<MontoPrivado valor={p.ganancia_neta} prefijo="$" />} />
          <FilaDato label="ROI anual"          valor={<SemaforoROI tipo="roi" valor={p.roi_anual} />} />
          <FilaDato label="ROI sobre aporte"   valor={pct(p.roi_aporte_propio)} />
        </div>
      </section>

      {/* ── Desglose de scoring ───────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Desglose de scoring</h2>

        {!p.permite_airbnb ? (
          <div className="text-sm text-zinc-500 text-center py-4">Score total = 0 por restricción de Airbnb</div>
        ) : (
          <div className="bg-zinc-900 rounded-lg overflow-hidden">
            {/* Ordenar criterios por orden o por clave */}
            {[...criterios]
              .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99))
              .map(c => {
                const scoreKey = SCORE_KEY_MAP[c.clave] as keyof ProyectoDetalle
                const scoreVal = p[scoreKey] as number | null
                const contribucion = scoreVal !== null ? scoreVal * c.peso : null
                return (
                  <div key={c.clave} className="px-4 py-3 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-zinc-300">{c.nombre}</span>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>peso {Math.round(c.peso * 100)}%</span>
                        {contribucion !== null && (
                          <span className="text-zinc-400">
                            aporta <span className="font-mono text-zinc-300">{contribucion.toFixed(1)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ScoreBar score={scoreVal} mostrarNumero />
                  </div>
                )
              })}

            {/* Score total */}
            <div className="px-4 py-3 bg-zinc-800/50 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-200">Score total</span>
              <div className="flex items-center gap-3">
                <div className="w-32">
                  <ScoreBar score={p.score_total} mostrarNumero={false} />
                </div>
                <span className={`text-lg font-bold tabular-nums ${
                  (p.score_total ?? 0) >= 70 ? 'text-emerald-400' :
                  (p.score_total ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {p.score_total !== null ? Math.round(p.score_total) : '—'}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Contacto ─────────────────────────────────────────────────── */}
      {(p.contacto_nombre || p.contacto_telefono) && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Contacto</h2>
          <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800 text-sm">
            {p.contacto_nombre && (
              <FilaDato label="Vendedor / contacto" valor={p.contacto_nombre} />
            )}
            {p.contacto_telefono && (
              <FilaDato
                label="Teléfono"
                valor={
                  <div className="flex items-center gap-2">
                    <span>{p.contacto_telefono}</span>
                    <BtnWhatsApp telefono={p.contacto_telefono} />
                  </div>
                }
              />
            )}
          </div>
        </section>
      )}

      {/* ── Notas ────────────────────────────────────────────────────── */}
      {p.notas && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Notas</h2>
          <p className="text-sm text-zinc-300 bg-zinc-900 rounded-lg p-4 whitespace-pre-wrap">{p.notas}</p>
        </section>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: EDITAR
// ═══════════════════════════════════════════════════════════════════════════════
type SubTab = 'identificacion' | 'unidad' | 'pago' | 'airbnb'

function TabEditar({
  proyecto: p,
  action,
  state,
  pending,
  config,
}: {
  proyecto: ProyectoDetalle
  action: (payload: FormData) => void
  state: ActionState
  pending: boolean
  config?: ConfiguracionRow
}) {
  const [subTab, setSubTab] = useState<SubTab>('identificacion')
  const [amobladoFinanciado, setAmobladoFinanciado] = useState(p.amoblado_financiado)

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'identificacion', label: 'Identificación' },
    { key: 'unidad',         label: 'Unidad' },
    { key: 'pago',           label: 'Pago' },
    { key: 'airbnb',         label: 'Airbnb' },
  ]

  // Placeholders que muestran el valor efectivo del config cuando el campo es vacío.
  // Útil para registros viejos que aún tienen null en campos de pago.
  const ph = {
    reserva:    config ? `vacío = usa config ($${config.reserva_default})` : 'vacío = usa config',
    entrada:    config ? `vacío = usa config (${config.porcentaje_entrada_default}%)` : 'vacío = usa config',
    durante:    config ? `vacío = usa config (${config.porcentaje_durante_construccion_default}%)` : 'vacío = usa config',
    cuotas:     config ? `vacío = usa config (${config.num_cuotas_construccion_default} cuotas)` : 'vacío = usa config',
    contra:     config ? `vacío = usa config (${config.porcentaje_contra_entrega_default}%)` : 'vacío = usa config',
    tasa:       config ? `vacío = usa config (${config.tasa_default}%)` : '0 = sin intereses',
    anos:       config ? `vacío = usa config (${config.anos_credito_default} años)` : 'vacío = usa config',
    amoblado:   config ? `vacío = usa config ($${config.costo_amoblado_default})` : 'vacío = usa config',
  }

  const subTabCls = (key: SubTab) =>
    `px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      subTab === key
        ? 'border-zinc-300 text-zinc-100'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`

  return (
    <form action={action} className="space-y-6">

      {/* ── Sub-tabs de navegación ───────────────────────────────────── */}
      {/* type="button" en cada botón es CRÍTICO: evita que hagan submit del form */}
      <div className="flex gap-0 border-b border-zinc-700 overflow-x-auto">
        {SUB_TABS.map(st => (
          <button key={st.key} type="button" onClick={() => setSubTab(st.key)} className={subTabCls(st.key)}>
            {st.label}
          </button>
        ))}
      </div>

      {/* ── Errores / éxito globales ────────────────────────────────── */}
      {state?.error && (
        <div className="bg-red-950/60 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
          {state.error}
        </div>
      )}

      {/* IMPORTANTE: todas las secciones están en el DOM aunque solo una sea visible.
          Usar className="hidden" (no condicional) para que los <input> sigan enviando
          sus valores al hacer submit, independientemente del sub-tab activo. */}

      {/* ── SUB-TAB: IDENTIFICACIÓN ──────────────────────────────────── */}
      <div className={subTab !== 'identificacion' ? 'hidden' : 'space-y-8'}>
      <Seccion titulo="Identificación">
        <Campo label="Nombre del proyecto *">
          <input type="text" name="nombre" required defaultValue={p.nombre}
            className={INPUT_CLS} />
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Constructora">
            <input type="text" name="constructora" defaultValue={p.constructora ?? ''} className={INPUT_CLS} />
          </Campo>
          <Campo label="Fiabilidad constructora">
            <select name="fiabilidad_constructora" defaultValue={p.fiabilidad_constructora ?? ''} className={SELECT_CLS}>
              <option value="">— no sé —</option>
              {FIABILIDADES.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Años de experiencia">
            <input type="number" name="anos_constructora" min="0" defaultValue={p.anos_constructora ?? ''} className={INPUT_CLS} />
          </Campo>
          <Campo label="Proyectos entregados">
            <input type="number" name="proyectos_entregados" min="0" defaultValue={p.proyectos_entregados ?? ''} className={INPUT_CLS} />
          </Campo>
        </div>
        <Campo label="Reconocimientos (ej: Mención al Ornato 2021)">
          <input type="text" name="reconocimientos_constructora" defaultValue={p.reconocimientos_constructora ?? ''} className={INPUT_CLS} />
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Contacto / vendedor">
            <input type="text" name="contacto_nombre" defaultValue={p.contacto_nombre ?? ''} className={INPUT_CLS} />
          </Campo>
          <Campo label="Teléfono / WhatsApp">
            <div className="flex gap-2 items-center">
              <input type="text" name="contacto_telefono" defaultValue={p.contacto_telefono ?? ''}
                className={`${INPUT_CLS} flex-1`} placeholder="0995939183" />
              {p.contacto_telefono && <BtnWhatsApp telefono={p.contacto_telefono} />}
            </div>
            <p className={HINT_CLS}>Solo dígitos o con prefijo de país. El botón abre WhatsApp directamente.</p>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Estado">
            <select name="estado" defaultValue={p.estado} className={SELECT_CLS}>
              {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
            </select>
          </Campo>
          <Campo label="Fecha de cotización">
            <input type="date" name="fecha_cotizacion" defaultValue={p.fecha_cotizacion ?? ''} className={INPUT_CLS} />
          </Campo>
        </div>
      </Seccion>

      {/* ── Ubicación ────────────────────────────────────────────────── */}
      <Seccion titulo="Ubicación">
        <Campo label="Dirección">
          <input type="text" name="direccion" defaultValue={p.direccion ?? ''} className={INPUT_CLS} placeholder="Ej: Telégrafo y Últimas Noticias" />
        </Campo>
        <Campo label="Sector *">
          <input type="text" name="sector" required defaultValue={p.sector} className={INPUT_CLS} />
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Latitud">
            <input type="number" step="any" name="latitud" defaultValue={p.latitud ?? ''} className={INPUT_CLS} placeholder="-0.1738" />
          </Campo>
          <Campo label="Longitud">
            <input type="number" step="any" name="longitud" defaultValue={p.longitud ?? ''} className={INPUT_CLS} placeholder="-78.4811" />
          </Campo>
        </div>
      </Seccion>
      </div>{/* fin sub-tab identificacion */}

      {/* ── SUB-TAB: UNIDAD ──────────────────────────────────────────── */}
      <div className={subTab !== 'unidad' ? 'hidden' : 'space-y-8'}>
      {/* ── Unidad ───────────────────────────────────────────────────── */}
      <Seccion titulo="Unidad">
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Tipo *">
            <select name="tipo" defaultValue={p.tipo ?? ''} className={SELECT_CLS}>
              <option value="">— seleccionar —</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Orientación">
            <select name="orientacion" defaultValue={p.orientacion ?? ''} className={SELECT_CLS}>
              <option value="">— sin datos —</option>
              {ORIENTACIONES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Campo label="Área interna (m²) *">
            <input type="number" step="0.01" name="area_interna_m2" required min="1" defaultValue={p.area_interna_m2} className={INPUT_CLS} />
            <p className={HINT_CLS}>Solo el área habitable. El precio/m² se calcula sobre este valor.</p>
          </Campo>
          <Campo label="Área balcón (m²)">
            <input type="number" step="0.01" name="area_balcon_m2" min="0" defaultValue={p.area_balcon_m2} className={INPUT_CLS} />
            <p className={HINT_CLS}>Balcón o terraza. No se incluye en el precio/m².</p>
          </Campo>
          <Campo label="Dormitorios">
            <input type="number" name="dormitorios" min="0" max="5" defaultValue={p.dormitorios} className={INPUT_CLS} />
          </Campo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Campo label="Baños">
            <input type="number" step="0.5" name="numero_banos" min="0.5" defaultValue={p.numero_banos} className={INPUT_CLS} />
          </Campo>
          <Campo label="Piso">
            <input type="number" name="piso" min="1" defaultValue={p.piso ?? ''} className={INPUT_CLS} />
          </Campo>
          <Campo label="Pisos totales edificio">
            <input type="number" name="pisos_totales" min="1" defaultValue={p.pisos_totales ?? ''} className={INPUT_CLS} />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Unidades totales edificio">
            <input type="number" name="unidades_totales_edificio" min="1" defaultValue={p.unidades_totales_edificio ?? ''} className={INPUT_CLS} />
          </Campo>
          <Campo label="Tipo de cocina">
            <select name="tipo_cocina" defaultValue={p.tipo_cocina ?? ''} className={SELECT_CLS}>
              <option value="">— sin datos —</option>
              {TIPOS_COCINA.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Materiales">
            <select name="materiales" defaultValue={p.materiales ?? ''} className={SELECT_CLS}>
              <option value="">— sin datos —</option>
              {MATERIALES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Campo>
        </div>
        {/* Checkboxes de características */}
        <Campo label="Características de la unidad">
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'tiene_balcon',           label: 'Balcón / Terraza',   val: p.tiene_balcon },
              { name: 'tiene_parqueadero',       label: 'Parqueadero',        val: p.tiene_parqueadero },
              { name: 'tiene_bodega',            label: 'Bodega',             val: p.tiene_bodega },
              { name: 'tiene_zona_lavanderia',   label: 'Zona lavandería',    val: p.tiene_zona_lavanderia },
              { name: 'tiene_puerta_seguridad',  label: 'Puerta de seguridad',val: p.tiene_puerta_seguridad },
              { name: 'viene_amoblado',          label: 'Viene amoblado',     val: p.viene_amoblado },
            ].map(({ name, label, val }) => (
              <CheckboxField key={name} name={name} label={label} defaultChecked={val} />
            ))}
          </div>
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Costo parqueadero ($)">
            <input type="number" name="costo_parqueadero" min="0" defaultValue={p.costo_parqueadero} className={INPUT_CLS} />
          </Campo>
          <Campo label="Costo amoblado ($)">
            <input type="number" name="costo_amoblado" min="0" defaultValue={p.costo_amoblado ?? ''} className={INPUT_CLS} placeholder={ph.amoblado} />
            <p className={HINT_CLS}>Inversión para amueblar antes de operar como Airbnb. Si ya viene amoblado, marca el checkbox y se ignora.</p>
          </Campo>
          <Campo label="¿Amoblado con préstamo?">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="amoblado_financiado"
                defaultChecked={p.amoblado_financiado}
                onChange={e => setAmobladoFinanciado(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500"
              />
              <span className="text-sm text-zinc-300">Financiar amoblado con préstamo</span>
            </label>
            <p className={HINT_CLS}>Si no tienes el dinero disponible al momento de la entrega, marca esto. El préstamo baja el flujo mensual y el ROI real.</p>
          </Campo>
          {amobladoFinanciado && (
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tasa préstamo amoblado (% anual)">
                <input type="number" name="tasa_prestamo_amoblado" min="0" step="0.1" defaultValue={p.tasa_prestamo_amoblado ?? 12} className={INPUT_CLS} />
              </Campo>
              <Campo label="Plazo préstamo amoblado (meses)">
                <input type="number" name="meses_prestamo_amoblado" min="1" defaultValue={p.meses_prestamo_amoblado ?? 24} className={INPUT_CLS} />
              </Campo>
            </div>
          )}
        </div>
        {/* Amenidades del edificio */}
        <Campo label="Amenidades del edificio">
          <div className="grid grid-cols-2 gap-2">
            {AMENIDADES_LIST.map(a => (
              <CheckboxField
                key={a.value}
                name="amenidades"
                value={a.value}
                label={a.label}
                defaultChecked={p.amenidades?.includes(a.value)}
              />
            ))}
          </div>
        </Campo>
      </Seccion>

      {/* ── Precio y estado de venta ──────────────────────────────────── */}
      <Seccion titulo="Precio y estado de venta">
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Precio base ($) *">
            <input type="number" step="0.01" name="precio_base" required min="1" defaultValue={p.precio_base} className={INPUT_CLS} />
            <p className={HINT_CLS}>Precio del departamento sin parqueadero. El precio/m² se calcula sobre el área interna.</p>
          </Campo>
          <Campo label="Unidades disponibles">
            <input type="number" name="unidades_disponibles" min="0" defaultValue={p.unidades_disponibles ?? ''} className={INPUT_CLS} placeholder="vacío = desconocido" />
            <p className={HINT_CLS}>≤3 muestra badge rojo "¡Últimas!". ≤10 muestra "Pocas". Vacío muestra "?".</p>
          </Campo>
        </div>
        <Campo label="Preferencia">
          <select name="preferencia" defaultValue={p.preferencia ?? ''} className={SELECT_CLS}>
            <option value="">Sin clasificar</option>
            <option value="primera_opcion">★ Primera opción</option>
            <option value="alternativa">Alternativa</option>
          </select>
          <p className={HINT_CLS}>Permite filtrar el ranking a solo tu apuesta real (primera opción).</p>
        </Campo>
      </Seccion>
      </div>{/* fin sub-tab unidad */}

      {/* ── SUB-TAB: PAGO ────────────────────────────────────────────── */}
      <div className={subTab !== 'pago' ? 'hidden' : 'space-y-8'}>
      {/* ── Estructura de pago ────────────────────────────────────────── */}
      <Seccion titulo="Estructura de pago">
        <p className="text-xs text-zinc-500 -mt-2">
          Vacío = usa el default de configuración global. Entrada + Durante + Contra entrega deben sumar 100%.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Reserva ($)">
            <input type="number" name="reserva" min="0" defaultValue={p.reserva ?? ''} className={INPUT_CLS} placeholder={ph.reserva} />
            <p className={HINT_CLS}>Monto de separación inicial. Se abona a la entrada al firmar promesa.</p>
          </Campo>
          <Campo label="% Entrada">
            <input type="number" step="0.01" name="porcentaje_entrada" min="0" max="100" defaultValue={p.porcentaje_entrada ?? ''} className={INPUT_CLS} placeholder={ph.entrada} />
            <p className={HINT_CLS}>Porcentaje del precio total que se paga al firmar.</p>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="% Durante construcción">
            <input type="number" step="0.01" name="porcentaje_durante_construccion" min="0" max="100" defaultValue={p.porcentaje_durante_construccion ?? ''} className={INPUT_CLS} placeholder={ph.durante} />
            <p className={HINT_CLS}>Porcentaje pagado en cuotas mensuales mientras se construye.</p>
          </Campo>
          <Campo label="Nro cuotas obra">
            <input type="number" name="num_cuotas_construccion" min="0" defaultValue={p.num_cuotas_construccion ?? ''} className={INPUT_CLS} placeholder={ph.cuotas} />
            <p className={HINT_CLS}>Meses de construcción en los que se distribuye el % durante obra.</p>
          </Campo>
        </div>
        <Campo label="% Contra entrega (financia el banco)">
          <input type="number" step="0.01" name="porcentaje_contra_entrega" min="0" max="100" defaultValue={p.porcentaje_contra_entrega ?? ''} className={INPUT_CLS} placeholder={ph.contra} />
          <p className={HINT_CLS}>Porcentaje que se financia con crédito hipotecario al recibir el inmueble.</p>
        </Campo>
      </Seccion>

      {/* ── Financiamiento ────────────────────────────────────────────── */}
      <Seccion titulo="Financiamiento">
        <div className="grid grid-cols-3 gap-4">
          <Campo label="Banco / entidad">
            <input type="text" name="banco" defaultValue={p.banco ?? ''} className={INPUT_CLS} placeholder="BIESS" />
            <p className={HINT_CLS}>Institución que otorga el crédito hipotecario.</p>
          </Campo>
          <Campo label="Tasa anual (%)">
            <input type="number" step="0.01" name="tasa_anual" min="0" defaultValue={p.tasa_anual ?? ''} className={INPUT_CLS} placeholder={ph.tasa} />
            <p className={HINT_CLS}>Tasa nominal anual. 0% = financiamiento directo sin intereses.</p>
          </Campo>
          <Campo label="Plazo (años)">
            <input type="number" name="anos_credito" min="0" defaultValue={p.anos_credito ?? ''} className={INPUT_CLS} placeholder={ph.anos} />
            <p className={HINT_CLS}>Duración del crédito hipotecario en años.</p>
          </Campo>
        </div>
      </Seccion>
      </div>{/* fin sub-tab pago */}

      {/* ── SUB-TAB: AIRBNB ──────────────────────────────────────────── */}
      <div className={subTab !== 'airbnb' ? 'hidden' : 'space-y-8'}>
      {/* ── Airbnb ───────────────────────────────────────────────────── */}
      <Seccion titulo="Airbnb">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <CheckboxField name="permite_airbnb" label="Permite Airbnb" defaultChecked={p.permite_airbnb} />
            <p className={HINT_CLS}>Si el reglamento prohíbe Airbnb, score total = 0 automáticamente.</p>
          </div>
          <div>
            <CheckboxField name="tiene_administracion_airbnb_incluida" label="Gestión Airbnb incluida" defaultChecked={p.tiene_administracion_airbnb_incluida} />
            <p className={HINT_CLS}>Si el edificio gestiona el Airbnb, su % reemplaza el % global de gastos.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="% Gestión Airbnb (si incluida)">
            <input type="number" step="0.1" name="porcentaje_gestion_airbnb" min="0" max="100" defaultValue={p.porcentaje_gestion_airbnb ?? ''} className={INPUT_CLS} />
            <p className={HINT_CLS}>Porcentaje que cobra la empresa gestora del Airbnb del edificio.</p>
          </Campo>
          <Campo label="Alícuota mensual ($)">
            <input type="number" step="0.01" name="alicuota_mensual" min="0" defaultValue={p.alicuota_mensual} className={INPUT_CLS} />
            <p className={HINT_CLS}>Cuota mensual de mantenimiento del edificio. Se descuenta siempre del flujo.</p>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Precio / noche estimado ($)">
            <input type="number" step="0.01" name="precio_noche_estimado" min="0" defaultValue={p.precio_noche_estimado ?? ''} className={INPUT_CLS} />
            <p className={HINT_CLS}>Tarifa promedio en Airbnb para este sector y tipo. Revisa listings similares.</p>
          </Campo>
          <Campo label="Ocupación estimada (%)">
            <input type="number" step="0.01" name="ocupacion_estimada" min="0" max="100" defaultValue={p.ocupacion_estimada} className={INPUT_CLS} />
            <p className={HINT_CLS}>% de días ocupados al mes. Quito norte: 60-80% según sector.</p>
          </Campo>
        </div>
        <Campo label="Avance de obra (%)">
          <input type="number" step="0.01" name="avance_obra_porcentaje" min="0" max="100" defaultValue={p.avance_obra_porcentaje} className={INPUT_CLS} />
          <p className={HINT_CLS}>0% = solo en planos (mayor riesgo). 100% = entregado. Afecta el score de calidad.</p>
        </Campo>
      </Seccion>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <Seccion titulo="Timeline y apreciación">
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Fecha de entrega">
            <input type="date" name="fecha_entrega" defaultValue={p.fecha_entrega ?? ''} className={INPUT_CLS} />
            <p className={HINT_CLS}>Al guardar, los meses hasta entrega se calculan automáticamente desde esta fecha.</p>
          </Campo>
          <Campo label="Meses hasta entrega">
            <input type="number" name="meses_espera" min="0" defaultValue={p.meses_espera} className={INPUT_CLS} />
            <p className={HINT_CLS}>Se recalcula automáticamente si hay fecha de entrega. Edita solo si no tienes la fecha exacta.</p>
          </Campo>
        </div>
        <Campo label="Plusvalía anual estimada (%)">
          <input type="number" step="0.01" name="plusvalia_anual" min="0" defaultValue={p.plusvalia_anual} className={INPUT_CLS} />
          <p className={HINT_CLS}>Se copia automáticamente del sector al crear. Ajusta si tienes datos más precisos.</p>
        </Campo>
      </Seccion>

      {/* ── Factor subjetivo ─────────────────────────────────────────── */}
      <Seccion titulo="Factor subjetivo y notas">
        <Campo label="Confianza en el proyecto (1=baja, 5=alta)">
          <select name="confianza_subjetiva" defaultValue={p.confianza_subjetiva ?? ''} className={SELECT_CLS}>
            <option value="">— sin evaluar —</option>
            {[1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>{n} {'★'.repeat(n)}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Notas sobre confianza">
          <textarea name="confianza_notas" rows={2} defaultValue={p.confianza_notas ?? ''}
            className={`${INPUT_CLS} resize-none`} placeholder="ej: el arquitecto mostró planos reales" />
        </Campo>
        <Campo label="Notas generales">
          <textarea name="notas" rows={3} defaultValue={p.notas ?? ''}
            className={`${INPUT_CLS} resize-none`} />
        </Campo>
      </Seccion>
      </div>{/* fin sub-tab airbnb */}

      {/* ── Botón guardar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pb-8">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg bg-zinc-200 hover:bg-white
                     text-zinc-900 font-semibold text-sm disabled:opacity-50 transition-colors"
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {state?.error && (
          <p className="text-sm text-red-400">{state.error}</p>
        )}
      </div>
    </form>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: ANÁLISIS IA
// ═══════════════════════════════════════════════════════════════════════════════
function TabIA({
  proyecto: p,
  action,
  state,
  pending,
}: {
  proyecto: ProyectoDetalle
  action: (payload: FormData) => void
  state: ActionState
  pending: boolean
}) {
  const hayAnalisis = p.analisis_ia_generado || state?.ok

  return (
    <div className="space-y-6">

      {/* ── Botón Analizar (siempre visible para re-analizar) ─────────── */}
      <div className="flex items-center gap-4">
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600
                       text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {pending ? 'Analizando con Claude…' : hayAnalisis ? '↻ Re-analizar con IA' : '✨ Analizar con IA'}
          </button>
        </form>
        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        <p className="text-xs text-zinc-600">Costo: ~1 llamada a Claude API</p>
      </div>

      {/* ── Alerta crítica ────────────────────────────────────────────── */}
      {p.alerta_ia && (
        <div className="bg-red-950/60 border border-red-700 rounded-lg p-4">
          <p className="text-xs font-semibold text-red-400 uppercase mb-1">⚠ Alerta</p>
          <p className="text-sm text-red-300">{p.alerta_ia}</p>
        </div>
      )}

      {/* ── Análisis narrativo ────────────────────────────────────────── */}
      {hayAnalisis ? (
        <div className="space-y-4">
          {p.fortaleza_ia && (
            <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-emerald-500 uppercase mb-1">💪 Fortaleza</p>
              <p className="text-sm text-emerald-200">{p.fortaleza_ia}</p>
            </div>
          )}
          {p.riesgo_ia && (
            <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-500 uppercase mb-1">⚡ Riesgo principal</p>
              <p className="text-sm text-amber-200">{p.riesgo_ia}</p>
            </div>
          )}
          {p.recomendacion_ia && (
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase mb-1">💡 Recomendación</p>
              <p className="text-sm text-zinc-200">{p.recomendacion_ia}</p>
            </div>
          )}
        </div>
      ) : (
        !pending && (
          <p className="text-sm text-zinc-500 text-center py-8">
            Presiona "Analizar con IA" para generar el análisis narrativo de esta unidad.
          </p>
        )
      )}

      {/* ── Qué preguntar al vendedor ─────────────────────────────────── */}
      {(p.que_preguntar?.length > 0 || p.datos_faltantes?.length > 0) && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Qué preguntar al vendedor
          </h2>

          {p.que_preguntar?.length > 0 && (
            <ul className="space-y-2 mb-4">
              {p.que_preguntar.map((q, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-300">
                  <span className="text-zinc-600 flex-shrink-0">→</span>
                  {q}
                </li>
              ))}
            </ul>
          )}

          {p.datos_faltantes?.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Datos faltantes para mejorar el análisis:</p>
              <div className="flex flex-wrap gap-2">
                {p.datos_faltantes.map((d, i) => (
                  <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded border border-zinc-700">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTES DE UI AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════════

// Clases Tailwind compartidas — constantes para consistencia visual
const INPUT_CLS = `w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5
  text-sm text-zinc-200 placeholder-zinc-600
  focus:outline-none focus:border-zinc-500`

const SELECT_CLS = `w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5
  text-sm text-zinc-200 focus:outline-none focus:border-zinc-500`

// Clase para hints de ayuda debajo de los campos del formulario
const HINT_CLS = 'text-xs text-zinc-500 mt-0.5'

// Botón WhatsApp — limpia el número (deja solo dígitos) y arma la URL wa.me
// Ecuador: prefijo +593; se descarta el 0 inicial si existe (093... → 93...)
function BtnWhatsApp({ telefono }: { telefono: string }) {
  // Quitar todo lo que no sea dígito
  const soloDigitos = telefono.replace(/\D/g, '')
  // Si empieza con 0 (ej: 0995939183), lo reemplazamos por el prefijo 593
  const numero = soloDigitos.startsWith('0')
    ? '593' + soloDigitos.slice(1)
    : soloDigitos.startsWith('593')
      ? soloDigitos
      : '593' + soloDigitos
  const url = `https://wa.me/${numero}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir WhatsApp: +${numero}`}
      className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded
                 bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-800/50
                 text-emerald-400 hover:text-emerald-300 text-xs font-medium
                 transition-colors whitespace-nowrap"
    >
      {/* Icono WhatsApp (SVG inline — sin dependencias) */}
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      WhatsApp
    </a>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider
                     border-b border-zinc-800 pb-2">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

// Checkbox con apariencia de toggle
function CheckboxField({
  name, label, defaultChecked, value,
}: {
  name: string; label: string; defaultChecked?: boolean; value?: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-zinc-200
                   focus:ring-0 focus:ring-offset-0 accent-zinc-300"
      />
      <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
        {label}
      </span>
    </label>
  )
}

// Fila de dato en la vista resumen (label → valor)
function FilaDato({
  label,
  valor,
  extra,
  badge,
}: {
  label: string
  valor: React.ReactNode
  extra?: React.ReactNode
  badge?: 'emerald' | 'amber' | 'red'
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-4">
      <span className="text-zinc-500 text-xs flex-shrink-0">{label}</span>
      <span className={`text-right text-sm flex items-center gap-1 ${
        badge === 'emerald' ? 'text-emerald-400' :
        badge === 'amber'   ? 'text-amber-400' :
        badge === 'red'     ? 'text-red-400' :
        'text-zinc-200'
      }`}>
        {valor}{extra}
      </span>
    </div>
  )
}

// Tarjeta de métrica clave (usada en la cuadrícula 2x2)
function MetricaTarjeta({
  label, valor, tipo, valorNum,
}: {
  label: string; valor: string; tipo?: 'roi' | 'cobertura'; valorNum?: number | null
}) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        {tipo && valorNum !== undefined && valorNum !== null && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            tipo === 'roi'
              ? valorNum >= 8 ? 'bg-emerald-500' : valorNum >= 5 ? 'bg-amber-400' : 'bg-red-500'
              : valorNum >= 120 ? 'bg-emerald-500' : valorNum >= 100 ? 'bg-amber-400' : 'bg-red-500'
          }`} />
        )}
        <span className="text-lg font-bold text-zinc-100 font-mono">{valor}</span>
      </div>
    </div>
  )
}
