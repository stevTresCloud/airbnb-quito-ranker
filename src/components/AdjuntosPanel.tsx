'use client'
// AdjuntosPanel.tsx — Panel de gestión de archivos adjuntos
//
// Drag & drop: el usuario puede arrastrar uno o varios archivos sobre la zona de drop.
// Selección múltiple: <input type="file" multiple> incluye todos los archivos en FormData.
// El Server Action subirAdjunto itera sobre formData.getAll('archivo') y sube cada uno.
//
// Por qué useEffect para el reset:
//   Llamar setState directamente en el render body causaría un loop. useEffect garantiza
//   que el reset ocurre solo cuando subirState cambia a ok=true.
//
// Preview inline:
//   El modal vive en AdjuntosPanel (un solo nodo), no en cada AdjuntoItem.
//   AdjuntoItem llama onPreview(url, tipo) → el panel actualiza el estado y muestra el modal.

import { useActionState, useRef, useState, useEffect, useCallback } from 'react'
import { subirAdjunto, eliminarAdjunto } from '@/app/(app)/proyecto/[id]/actions'
import type { ActionState } from '@/app/(app)/proyecto/[id]/actions'

export type AdjuntoRow = {
  id: string
  proyecto_id: string
  tipo: string
  nombre: string
  storage_path: string | null
  url_externa: string | null
  descripcion: string | null
  created_at: string
  // URL firmada generada por el Server Component (válida 24h)
  url_firmada?: string | null
}

const TIPOS_ADJUNTO = [
  { value: 'brochure_pdf', label: 'Brochure PDF' },
  { value: 'plano_pdf',    label: 'Plano PDF' },
  { value: 'foto',         label: 'Foto' },
  { value: 'render',       label: 'Render' },
  { value: 'link_video',   label: 'Link video' },
  { value: 'otro',         label: 'Otro' },
]

// Tipos de adjunto que tienen preview inline disponible
type PreviewTipo = 'imagen' | 'pdf'
type PreviewState = { url: string; nombre: string; tipo: PreviewTipo } | null

function resolverPreviewTipo(adjunto: AdjuntoRow): PreviewTipo | null {
  if (adjunto.tipo === 'foto' || adjunto.tipo === 'render') return 'imagen'
  if (adjunto.tipo === 'brochure_pdf' || adjunto.tipo === 'plano_pdf') return 'pdf'
  return null
}

interface Props {
  proyectoId: string
  adjuntosIniciales: AdjuntoRow[]
}

export function AdjuntosPanel({ proyectoId, adjuntosIniciales }: Props) {
  const [preview, setPreview] = useState<PreviewState>(null)

  const abrirPreview = useCallback((url: string, nombre: string, tipo: PreviewTipo) => {
    setPreview({ url, nombre, tipo })
  }, [])

  const cerrarPreview = useCallback(() => setPreview(null), [])
  const subirAction = subirAdjunto.bind(null, proyectoId)
  const [subirState, subirFormAction, subiendo] = useActionState<ActionState, FormData>(subirAction, null)
  const formRef     = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([])
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null)

  const MAX_POR_ARCHIVO_MB = 20
  const MAX_TOTAL_MB = 45

  // Limpiar formulario y lista de archivos tras subida exitosa
  useEffect(() => {
    if (subirState?.ok) {
      formRef.current?.reset()
      setArchivosSeleccionados([])
      setErrorArchivos(null)
    }
  }, [subirState])

  const aplicarArchivos = (files: FileList | File[]) => {
    const arr = Array.from(files)

    // Validar tamaño por archivo
    const sobrePorArchivo = arr.find(f => f.size > MAX_POR_ARCHIVO_MB * 1024 * 1024)
    if (sobrePorArchivo) {
      setErrorArchivos(`"${sobrePorArchivo.name}" supera el límite de ${MAX_POR_ARCHIVO_MB} MB`)
      return
    }

    // Validar tamaño total
    const totalMB = arr.reduce((s, f) => s + f.size, 0) / 1024 / 1024
    if (totalMB > MAX_TOTAL_MB) {
      setErrorArchivos(`El total (${totalMB.toFixed(1)} MB) supera el límite de ${MAX_TOTAL_MB} MB. Sube los archivos en tandas.`)
      return
    }

    setErrorArchivos(null)
    setArchivosSeleccionados(arr)
    // Sincronizar con el input nativo para que FormData los incluya al hacer submit
    if (fileInputRef.current) {
      const dt = new DataTransfer()
      arr.forEach(f => dt.items.add(f))
      fileInputRef.current.files = dt.files
    }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => {
    // Solo quitar el estado si el cursor sale del contenedor (no de un hijo)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    aplicarArchivos(e.dataTransfer.files)
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    aplicarArchivos(e.target.files ?? [])
  }

  const totalMB = archivosSeleccionados.reduce((s, f) => s + f.size, 0) / 1024 / 1024

  return (
    <div className="space-y-6">

      {/* ── Modal de preview inline ───────────────────────────────────────── */}
      {preview && (
        // Overlay: clic fuera del contenido cierra el modal
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={cerrarPreview}
        >
          <div
            className="relative bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
            // Detener propagación para que clic dentro no cierre el modal
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 flex-shrink-0">
              <p className="text-sm font-medium text-zinc-200 truncate pr-4">{preview.nombre}</p>
              <div className="flex items-center gap-3 flex-shrink-0">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Abrir en nueva pestaña ↗
                </a>
                <button
                  type="button"
                  onClick={cerrarPreview}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors text-lg leading-none"
                  aria-label="Cerrar preview"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Contenido: imagen o PDF */}
            <div className="flex-1 overflow-auto p-2 flex items-center justify-center min-h-0">
              {preview.tipo === 'imagen' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.nombre}
                  className="max-h-[75vh] max-w-full object-contain rounded"
                />
              ) : (
                // iframe para PDF — el browser nativo ya tiene controles de zoom y descarga
                <iframe
                  src={preview.url}
                  title={preview.nombre}
                  className="w-full rounded"
                  style={{ height: '75vh' }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de adjuntos existentes ─────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">
          {adjuntosIniciales.length === 0 ? 'Sin adjuntos aún' : `${adjuntosIniciales.length} adjunto(s)`}
        </h3>

        {adjuntosIniciales.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {adjuntosIniciales.map(adj => (
              <AdjuntoItem
                key={adj.id}
                adjunto={adj}
                onPreview={abrirPreview}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Formulario de subida ─────────────────────────────────────────── */}
      <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-200 mb-4">Subir archivos</h3>

        <form ref={formRef} action={subirFormAction} className="space-y-3">

          {/* Zona de drag & drop */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer
                        transition-colors select-none
                        ${isDragging
                          ? 'border-indigo-500 bg-indigo-950/30'
                          : 'border-zinc-600 hover:border-zinc-500 hover:bg-zinc-800/50'}`}
          >
            {archivosSeleccionados.length === 0 ? (
              <>
                <p className="text-sm text-zinc-400">
                  Arrastra archivos aquí o <span className="text-indigo-400 underline">haz clic para seleccionar</span>
                </p>
                <p className="text-xs text-zinc-600 mt-1">PDF, imágenes o video · Múltiples archivos · Máx 20 MB c/u · 45 MB total</p>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-300 font-medium mb-2">
                  {archivosSeleccionados.length === 1
                    ? `1 archivo seleccionado`
                    : `${archivosSeleccionados.length} archivos seleccionados`}
                  <span className="text-zinc-500 font-normal ml-2">({totalMB.toFixed(1)} MB total)</span>
                </p>
                <ul className="text-xs text-zinc-500 space-y-0.5 text-left inline-block">
                  {archivosSeleccionados.map((f, i) => (
                    <li key={i} className="truncate max-w-xs">
                      📎 {f.name}
                      <span className="ml-1 text-zinc-600">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-zinc-600 mt-2">Haz clic para cambiar la selección</p>
              </>
            )}

            {/* Input oculto — se activa con el click del contenedor */}
            <input
              ref={fileInputRef}
              type="file"
              name="archivo"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Tipo y nombre (el nombre solo aplica si se sube un único archivo) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Tipo</label>
              <select
                name="tipo"
                defaultValue="otro"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5
                           text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {TIPOS_ADJUNTO.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Nombre visible
                {archivosSeleccionados.length > 1 && (
                  <span className="text-zinc-600 ml-1">(ignorado con varios archivos)</span>
                )}
              </label>
              <input
                type="text"
                name="nombre"
                placeholder="Brochure Mayo 2025"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5
                           text-sm text-zinc-200 placeholder-zinc-600
                           focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Descripción opcional */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Descripción (opcional)</label>
            <input
              type="text"
              name="descripcion"
              placeholder="ej: Planos del piso 8, unidad B"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5
                         text-sm text-zinc-200 placeholder-zinc-600
                         focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Mensajes de estado */}
          {errorArchivos && (
            <p className="text-xs text-red-400">{errorArchivos}</p>
          )}
          {subirState?.error && (
            <p className="text-xs text-red-400">{subirState.error}</p>
          )}
          {subirState?.ok && (
            <p className="text-xs text-emerald-400">{subirState.mensaje}</p>
          )}

          {/* Botón */}
          <button
            type="submit"
            disabled={subiendo || archivosSeleccionados.length === 0 || !!errorArchivos}
            className="w-full py-2 px-4 rounded bg-zinc-700 hover:bg-zinc-600
                       text-sm font-medium text-zinc-200 disabled:opacity-40
                       transition-colors"
          >
            {subiendo
              ? 'Subiendo...'
              : archivosSeleccionados.length === 0
                ? 'Selecciona archivos primero'
                : archivosSeleccionados.length === 1
                  ? 'Subir archivo'
                  : `Subir ${archivosSeleccionados.length} archivos`}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Fila individual de adjunto ────────────────────────────────────────────────
function AdjuntoItem({
  adjunto,
  onPreview,
}: {
  adjunto: AdjuntoRow
  onPreview: (url: string, nombre: string, tipo: PreviewTipo) => void
}) {
  const deleteAction = eliminarAdjunto.bind(null, adjunto.id, adjunto.storage_path)
  const [deleteState, deleteFormAction, eliminando] = useActionState<ActionState, FormData>(deleteAction, null)

  const tipoLabel = TIPOS_ADJUNTO.find(t => t.value === adjunto.tipo)?.label ?? adjunto.tipo
  const previewTipo = resolverPreviewTipo(adjunto)

  return (
    <li className="flex flex-col gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
      {/* Icono + nombre */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0">
          {adjunto.tipo === 'foto' || adjunto.tipo === 'render' ? '🖼' :
           adjunto.tipo.includes('pdf') ? '📄' :
           adjunto.tipo === 'link_video' ? '🎬' : '📎'}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-200 truncate">{adjunto.nombre}</p>
          <p className="text-[11px] text-zinc-500">{tipoLabel}</p>
        </div>
      </div>

      {/* Descripción truncada a 1 línea */}
      {adjunto.descripcion && (
        <p className="text-[11px] text-zinc-400 truncate">{adjunto.descripcion}</p>
      )}
      {deleteState?.error && (
        <p className="text-[11px] text-red-400">{deleteState.error}</p>
      )}

      {/* Acciones en fila compacta */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {adjunto.url_firmada && previewTipo ? (
          <button
            type="button"
            onClick={() => onPreview(adjunto.url_firmada!, adjunto.nombre, previewTipo)}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-0.5
                       rounded border border-zinc-700 hover:border-zinc-500"
          >
            Ver
          </button>
        ) : adjunto.url_firmada ? (
          <a
            href={adjunto.url_firmada}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-0.5
                       rounded border border-zinc-700 hover:border-zinc-500"
          >
            Ver
          </a>
        ) : null}

        {adjunto.url_externa && (
          <a
            href={adjunto.url_externa}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-0.5
                       rounded border border-zinc-700 hover:border-zinc-500"
          >
            Abrir
          </a>
        )}

        <form action={deleteFormAction}>
          <button
            type="submit"
            disabled={eliminando}
            className="text-[11px] text-red-500 hover:text-red-400 disabled:opacity-50
                       transition-colors px-2 py-0.5 rounded border border-red-900/50
                       hover:border-red-700/50"
            onClick={e => {
              if (!confirm(`¿Eliminar "${adjunto.nombre}"?`)) e.preventDefault()
            }}
          >
            {eliminando ? '...' : 'Eliminar'}
          </button>
        </form>
      </div>
    </li>
  )
}
