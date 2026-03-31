'use client'
// GrabadorVoz.tsx — Transcripción con Web Speech API (browser nativo, sin API key)
//
// Flujo:
// 1. Web Speech API transcribe en tiempo real mientras el usuario habla (funciona en Chrome/Safari)
// 2. El texto transcripto se muestra para revisión
// 3. El transcript se envía a /api/transcribir → Claude extrae el JSON estructurado
// 4. El formulario se pre-llena con los datos extraídos
//
// Por qué Web Speech API y no enviar audio a Claude:
// - Claude API no acepta archivos de audio binario
// - La Web Speech API es gratuita, funciona offline-lite y está disponible en Chrome Android
//   (perfecto para usar en ferias desde el celular)

import { useState, useRef, useEffect } from 'react'
import type { DatosPrellenados } from '@/app/(app)/nuevo/FormularioRapido'

interface Props {
  onDatosExtraidos: (datos: DatosPrellenados) => void
}

type Estado = 'idle' | 'grabando' | 'confirmando' | 'procesando' | 'error' | 'no_soportado'

// Web Speech API no tiene tipos en TypeScript estándar — declaramos lo mínimo necesario
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
declare class SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
declare const webkitSpeechRecognition: typeof SpeechRecognition

export default function GrabadorVoz({ onDatosExtraidos }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [transcript, setTranscript] = useState('')
  const [transcriptParcial, setTranscriptParcial] = useState('')
  const [mensajeError, setMensajeError] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    // Verificar soporte del browser al montar el componente
    const SpeechRecognitionClass =
      typeof SpeechRecognition !== 'undefined' ? SpeechRecognition :
      typeof webkitSpeechRecognition !== 'undefined' ? webkitSpeechRecognition :
      null
    if (!SpeechRecognitionClass) setEstado('no_soportado')
  }, [])

  function iniciarGrabacion() {
    const SpeechRecognitionClass =
      typeof SpeechRecognition !== 'undefined' ? SpeechRecognition :
      typeof webkitSpeechRecognition !== 'undefined' ? webkitSpeechRecognition :
      null
    if (!SpeechRecognitionClass) { setEstado('no_soportado'); return }

    setTranscript('')
    setTranscriptParcial('')
    setMensajeError('')

    const recognition = new SpeechRecognitionClass()
    recognition.lang = 'es-EC'          // español Ecuador
    recognition.continuous = true       // sigue escuchando hasta que el usuario pare
    recognition.interimResults = true   // muestra texto parcial mientras habla

    let transcriptAcumulado = ''

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let final = ''
      let parcial = ''
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          final += result[0].transcript + ' '
        } else {
          parcial += result[0].transcript
        }
      }
      transcriptAcumulado = final
      setTranscript(final.trim())
      setTranscriptParcial(parcial)
    }

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setMensajeError('Permiso de micrófono denegado. Habilítalo en los ajustes del navegador.')
      } else {
        setMensajeError(`Error de reconocimiento: ${e.error}`)
      }
      setEstado('error')
    }

    recognition.onend = () => {
      // Cuando se detiene, pasamos al estado de confirmación
      if (transcriptAcumulado.trim()) {
        setTranscript(transcriptAcumulado.trim())
        setEstado('confirmando')
      } else {
        setMensajeError('No se detectó voz. Habla más cerca del micrófono e intenta de nuevo.')
        setEstado('error')
      }
    }

    recognition.start()
    recognitionRef.current = recognition
    setEstado('grabando')
  }

  function detenerGrabacion() {
    recognitionRef.current?.stop()
    // el estado cambia a 'confirmando' en el handler onend
  }

  async function extraerDatos() {
    if (!transcript.trim()) return
    setEstado('procesando')

    try {
      const res = await fetch('/api/transcribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al procesar')
      onDatosExtraidos(json)
      setEstado('idle')
      setTranscript('')
    } catch (err: unknown) {
      setMensajeError(err instanceof Error ? err.message : 'Error desconocido')
      setEstado('error')
    }
  }

  if (estado === 'no_soportado') {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-6 text-center space-y-2">
        <p className="text-zinc-400 text-sm">
          Tu navegador no soporta reconocimiento de voz.
        </p>
        <p className="text-zinc-500 text-xs">
          Usa Chrome o Safari en Android/iOS para esta función.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-6 space-y-4">
      <p className="text-zinc-300 text-sm text-center">
        Habla ~30 segundos: nombre del proyecto, precio, área, sector, meses de espera...
      </p>

      {/* Transcript en tiempo real */}
      {(transcript || transcriptParcial) && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-600 p-3 min-h-[60px]">
          <p className="text-white text-sm">{transcript}</p>
          {transcriptParcial && (
            <p className="text-zinc-500 text-sm italic">{transcriptParcial}</p>
          )}
        </div>
      )}

      {estado === 'idle' && (
        <button
          onClick={iniciarGrabacion}
          className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-4 rounded-xl
                     text-lg transition-colors flex items-center justify-center gap-2"
        >
          <span>🎤</span> Iniciar grabación
        </button>
      )}

      {estado === 'grabando' && (
        <button
          onClick={detenerGrabacion}
          className="w-full bg-zinc-600 hover:bg-zinc-500 text-white font-semibold py-4 rounded-xl
                     text-lg transition-colors animate-pulse flex items-center justify-center gap-2"
        >
          <span>⏹</span> Detener
        </button>
      )}

      {estado === 'confirmando' && (
        <div className="space-y-3">
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 text-white
                       text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEstado('idle')}
              className="flex-1 border border-zinc-600 text-zinc-300 hover:text-white
                         py-2 rounded-lg text-sm transition-colors"
            >
              Volver a grabar
            </button>
            <button
              onClick={extraerDatos}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white
                         py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Extraer datos con IA
            </button>
          </div>
        </div>
      )}

      {estado === 'procesando' && (
        <div className="py-4 text-zinc-400 text-sm text-center">
          Procesando con Claude... un momento.
        </div>
      )}

      {estado === 'error' && (
        <div className="space-y-3 text-center">
          <p className="text-red-400 text-sm">{mensajeError}</p>
          <button
            onClick={() => { setEstado('idle'); setTranscript(''); setTranscriptParcial('') }}
            className="text-zinc-400 hover:text-white text-sm underline"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  )
}
