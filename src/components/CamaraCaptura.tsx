'use client'
// CamaraCaptura.tsx — Captura foto de una cotización y extrae datos con Claude Vision
//
// Usamos <input type="file" accept="image/*" capture="environment"> porque:
// - Funciona en todos los móviles sin librerías extra
// - capture="environment" abre directamente la cámara trasera (no la galería)
// - En desktop abre el explorador de archivos (útil para subir cotizaciones desde el PC)

import { useState, useRef } from 'react'
import type { DatosPrellenados } from '@/app/(app)/nuevo/FormularioRapido'

interface Props {
  onDatosExtraidos: (datos: DatosPrellenados) => void
}

type Estado = 'idle' | 'procesando' | 'error'

export default function CamaraCaptura({ onDatosExtraidos }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [mensajeError, setMensajeError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFotoSeleccionada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Mostrar preview de la imagen seleccionada
    const url = URL.createObjectURL(file)
    setPreview(url)
    setEstado('procesando')
    setMensajeError('')

    // Convertir a base64 para enviar como JSON (más simple que FormData para imágenes)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]   // quitar "data:image/jpeg;base64,"
      const mediaType = file.type || 'image/jpeg'

      try {
        const res = await fetch('/api/analizar-foto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagen: base64, mediaType }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Error al analizar')

        onDatosExtraidos(json)
        setEstado('idle')
      } catch (err: unknown) {
        setMensajeError(err instanceof Error ? err.message : 'Error desconocido')
        setEstado('error')
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-6 space-y-4">
      {/* Preview de la foto */}
      {preview && (
        <div className="rounded-lg overflow-hidden border border-zinc-600">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Foto de cotización" className="w-full max-h-48 object-contain bg-black" />
        </div>
      )}

      <div className="text-center space-y-3">
        <p className="text-zinc-300 text-sm">
          Toma una foto de la cotización, brochure o tabla de precios.
          Claude extrae los datos automáticamente.
        </p>

        {estado === 'idle' && (
          <>
            {/* El input está oculto — el botón lo activa programáticamente */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFotoSeleccionada}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4
                         rounded-xl text-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>📷</span> {preview ? 'Tomar otra foto' : 'Tomar foto / seleccionar imagen'}
            </button>
          </>
        )}

        {estado === 'procesando' && (
          <div className="py-4 text-zinc-400 text-sm">
            Analizando con Claude Vision... esto tarda unos segundos.
          </div>
        )}

        {estado === 'error' && (
          <div className="space-y-3">
            <p className="text-red-400 text-sm">{mensajeError}</p>
            <button
              onClick={() => { setEstado('idle'); setPreview(null) }}
              className="text-zinc-400 hover:text-white text-sm underline"
            >
              Intentar de nuevo
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-500 text-center">
        La imagen se envía a Claude Vision para extraer los datos. No se almacena.
      </p>
    </div>
  )
}
