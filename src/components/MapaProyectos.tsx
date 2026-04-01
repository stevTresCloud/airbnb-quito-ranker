'use client'
// MapaProyectos.tsx — Mapa de proyectos con react-leaflet + OpenStreetMap
//
// Por qué se importa con dynamic({ ssr: false }):
//   Leaflet accede a `window` y `document` al importarse — APIs que no existen
//   en el servidor (Node.js). Si se importara directamente, el build de Next.js
//   fallaría con "window is not defined". Al usar dynamic + ssr:false, Next.js
//   solo carga este módulo en el browser, nunca durante el SSR.
//
// Por qué CircleMarker en lugar de Marker:
//   El Marker por defecto de Leaflet usa archivos PNG que Webpack no puede
//   resolver automáticamente (bug histórico). CircleMarker es un SVG puro
//   generado por Leaflet — sin dependencias de archivos de imagen.

import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import Link from 'next/link'
import type { ProyectoRanking } from '@/app/(app)/RankingDashboard'

// ─── Color del pin según score ────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return '#71717a'   // gris — sin calcular
  if (score >= 70) return '#22c55e'      // verde
  if (score >= 50) return '#f59e0b'      // amarillo
  return '#ef4444'                        // rojo
}

// ─── Badge escasez (inline para no depender del componente padre) ─────────────

function BadgeEscasez({ n }: { n: number | null }) {
  if (n === null) return null
  if (n <= 3) {
    return (
      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4,
                     background: 'rgba(127,29,29,0.4)', color: '#fca5a5',
                     border: '1px solid rgba(185,28,28,0.4)' }}>
        ¡Últimas!
      </span>
    )
  }
  if (n <= 10) {
    return (
      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4,
                     background: 'rgba(120,53,15,0.4)', color: '#fcd34d',
                     border: '1px solid rgba(180,83,9,0.4)' }}>
        Pocas
      </span>
    )
  }
  return null
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  proyectos: ProyectoRanking[]
}

export default function MapaProyectos({ proyectos }: Props) {
  // Solo los proyectos con coordenadas cargadas
  const conCoords = proyectos.filter(
    p => p.latitud !== null && p.longitud !== null
  )

  // Centro: Parque La Carolina, Quito Norte
  const center: [number, number] = [-0.183, -78.487]

  return (
    <div className="relative">
      {/* Leyenda de colores */}
      <div className="flex items-center gap-4 mb-3 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
          Score ≥70
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-400" />
          50–69
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
          &lt;50
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-zinc-500" />
          Sin calcular
        </span>
      </div>

      {conCoords.length === 0 ? (
        // Estado vacío: ningún proyecto tiene coordenadas aún
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800
                        bg-zinc-900/60 text-zinc-500 text-sm"
             style={{ height: 500 }}>
          <span className="text-3xl mb-3">📍</span>
          <p>Ningún proyecto tiene coordenadas.</p>
          <p className="text-xs mt-1 text-zinc-600">
            Edita un proyecto y agrega Latitud / Longitud (clic derecho en Google Maps → Copiar coordenadas).
          </p>
        </div>
      ) : (
        <MapContainer
          center={center}
          zoom={14}
          // style en lugar de className para altura — Leaflet necesita height explícito
          style={{ height: 500, borderRadius: 12, border: '1px solid rgb(39,39,42)' }}
        >
          {/* Tiles de OpenStreetMap — gratis, sin API key */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {conCoords.map(p => {
            const color = scoreColor(p.score_total)
            return (
              <CircleMarker
                key={p.id}
                center={[p.latitud!, p.longitud!]}
                radius={11}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              >
                <Popup minWidth={200}>
                  {/* El popup vive en un portal de Leaflet — usamos inline styles
                      para no depender de que Tailwind inyecte sus clases ahí */}
                  <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>

                    {/* Nombre */}
                    <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, color: '#161617' }}>
                      {p.preferencia === 'primera_opcion' && (
                        <span style={{ color: '#fbbf24', marginRight: 4 }}>★</span>
                      )}
                      {p.nombre}
                    </p>

                    {/* Tipo */}
                    {p.tipo && (
                      <p style={{ fontSize: 11, color: '#161617', marginBottom: 6 }}>
                        {p.tipo} · {p.sector}
                      </p>
                    )}

                    {/* Score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#a1a1aa' }}>Score</span>
                      <span style={{
                        fontSize: 14, fontWeight: 700, color,
                      }}>
                        {p.score_total !== null ? p.score_total.toFixed(0) : '—'}
                      </span>
                    </div>

                    {/* ROI */}
                    {p.roi_anual !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#a1a1aa' }}>ROI anual</span>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: p.roi_anual >= 8 ? '#4ade80' : '#f87171',
                        }}>
                          {p.roi_anual.toFixed(1)}%
                        </span>
                      </div>
                    )}

                    {/* Badge escasez */}
                    {p.unidades_disponibles !== null && p.unidades_disponibles <= 10 && (
                      <div style={{ marginBottom: 6 }}>
                        <BadgeEscasez n={p.unidades_disponibles} />
                      </div>
                    )}

                    {/* Botón Ver detalle */}
                    <Link
                      href={`/proyecto/${p.id}`}
                      style={{
                        display: 'inline-block', marginTop: 6,
                        fontSize: 11, fontWeight: 500,
                        color: '#60a5fa', textDecoration: 'none',
                      }}
                    >
                      Ver detalle →
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      )}

      {/* Conteo de pines */}
      <p className="mt-2 text-right text-xs text-zinc-600">
        {conCoords.length} de {proyectos.length} unidades con coordenadas
      </p>
    </div>
  )
}
