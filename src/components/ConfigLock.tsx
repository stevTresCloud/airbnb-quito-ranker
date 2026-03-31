// ConfigLock — overlay de seguridad para /configuracion/*
//
// Este componente aparece como una pantalla bloqueada cuando el usuario intenta
// acceder a cualquier ruta bajo /configuracion/ y tiene PIN o WebAuthn activado.
//
// Flujo:
//  1. configuracion/layout.tsx (Server Component) verifica la cookie "config_unlocked"
//     - Si cookie válida (<30 min) → renderiza los children directamente (sin ConfigLock)
//     - Si no → renderiza <ConfigLock>{children}</ConfigLock>
//  2. ConfigLock muestra el overlay con dos opciones según lo que esté configurado:
//     a) Botón "Usar huella / Face ID" → llama WebAuthn (si webauthnHabilitado)
//     b) Teclado PIN de 6 dígitos (si pinHabilitado)
//  3. Cuando el usuario se autentica con éxito:
//     - La API setea la cookie "config_unlocked" (httpOnly, 30 min)
//     - ConfigLock pone unlocked=true → muestra los children
//
// Nota sobre sessionStorage vs cookie:
//  Usamos cookies httpOnly en lugar de sessionStorage porque la cookie la lee
//  el Server Component del layout → si la cookie es válida, directamente
//  no renderiza ConfigLock (evita el overlay flash). sessionStorage solo vive
//  en el cliente — el Server Component no lo puede leer.

'use client'

import { useState, useCallback } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'

// ─── Íconos inline ───────────────────────────────────────────────────────────

function IconLock() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className="text-zinc-400">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function IconFingerprint() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a10 10 0 0 1-5-18.9" />
      <path d="M12 22c-2.7 0-5-2.2-5-5v-3.5c0-2.8 2.2-5 5-5s5 2.2 5 5V17c0 2.8-2.2 5-5 5" />
      <path d="M12 6a6 6 0 0 1 6 6v1" />
      <path d="M12 10v4" />
    </svg>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  children: React.ReactNode
  pinHabilitado: boolean
  webauthnHabilitado: boolean
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PIN_LENGTH = 6
const MAX_INTENTOS = 3
const BLOQUEO_SEG = 30

// ─── Componente principal ─────────────────────────────────────────────────────

export function ConfigLock({ children, pinHabilitado, webauthnHabilitado }: Props) {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [intentos, setIntentos] = useState(0)
  const [bloqueadoHasta, setBloqueadoHasta] = useState<number | null>(null)
  const [cargando, setCargando] = useState(false)

  // Todos los hooks y callbacks deben definirse ANTES de cualquier early return.
  // Regla de React: los hooks deben llamarse el mismo número de veces en cada render.

  const estaBloqueado = bloqueadoHasta !== null && Date.now() < bloqueadoHasta
  const segundosRestantes = bloqueadoHasta
    ? Math.ceil((bloqueadoHasta - Date.now()) / 1000)
    : 0

  // ── PIN: verificación contra servidor ──────────────────────────────────
  const verificarPIN = useCallback(async (pinIngresado: string) => {
    setCargando(true)
    try {
      const res = await fetch('/api/verificar-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinIngresado }),
      })
      const data = await res.json()

      if (data.ok) {
        setUnlocked(true)
      } else {
        const nuevosIntentos = intentos + 1
        setIntentos(nuevosIntentos)
        setPin('')
        if (nuevosIntentos >= MAX_INTENTOS) {
          setBloqueadoHasta(Date.now() + BLOQUEO_SEG * 1000)
          setIntentos(0)
          setError(`Demasiados intentos. Espera ${BLOQUEO_SEG} segundos.`)
        } else {
          setError(`PIN incorrecto. Intentos restantes: ${MAX_INTENTOS - nuevosIntentos}`)
        }
      }
    } catch {
      setPin('')
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [intentos])

  // ── PIN: presionar dígito ───────────────────────────────────────────────
  function presionarDigito(d: string) {
    if (estaBloqueado || cargando) return
    if (pin.length >= PIN_LENGTH) return
    const nuevoPIN = pin + d
    setPin(nuevoPIN)
    setError('')
    if (nuevoPIN.length === PIN_LENGTH) {
      verificarPIN(nuevoPIN)
    }
  }

  // ── PIN: borrar último dígito ───────────────────────────────────────────
  function borrar() {
    if (estaBloqueado || cargando) return
    setPin(p => p.slice(0, -1))
    setError('')
  }

  // ── WebAuthn: autenticación biométrica ────────────────────────────────
  async function autenticarWebAuthn() {
    setCargando(true)
    setError('')
    try {
      // 1. Pedir opciones al servidor (incluye el challenge)
      const optRes = await fetch('/api/webauthn/auth-options')
      if (!optRes.ok) throw new Error('Error al obtener opciones')
      const options = await optRes.json()

      // 2. Browser invoca la autenticación biométrica del dispositivo
      //    startAuthentication lanza Face ID / huella / Windows Hello
      const authResponse = await startAuthentication({ optionsJSON: options })

      // 3. Enviar la respuesta al servidor para verificar
      const verRes = await fetch('/api/webauthn/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResponse),
      })
      const result = await verRes.json()

      if (result.ok) {
        setUnlocked(true)
      } else {
        setError('Autenticación biométrica fallida. Prueba el PIN.')
      }
    } catch (e: unknown) {
      // El usuario canceló o el dispositivo no soporta WebAuthn
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('cancelled') || msg.includes('abort')) {
        setError('Cancelado. Puedes usar el PIN.')
      } else {
        setError('No se pudo usar la huella. Prueba el PIN.')
      }
    } finally {
      setCargando(false)
    }
  }

  // Early returns DESPUÉS de todos los hooks y funciones.
  // Si no hay seguridad configurada o ya está desbloqueado → mostrar contenido directo.
  if (!pinHabilitado && !webauthnHabilitado) return <>{children}</>
  if (unlocked) return <>{children}</>

  // ── Render: overlay de bloqueo ────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-zinc-950/95 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-zinc-900 rounded-2xl border border-zinc-800
                      shadow-2xl p-8 flex flex-col items-center gap-6">

        {/* Icono de candado */}
        <div className="flex flex-col items-center gap-2">
          <IconLock />
          <h2 className="text-lg font-semibold text-zinc-100">Configuración protegida</h2>
          <p className="text-xs text-zinc-500 text-center">
            Esta sección contiene datos financieros sensibles
          </p>
        </div>

        {/* Botón WebAuthn (biométrico) — visible si está registrado */}
        {webauthnHabilitado && (
          <button
            onClick={autenticarWebAuthn}
            disabled={cargando || estaBloqueado}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                       bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-sm font-medium
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconFingerprint />
            {cargando ? 'Verificando...' : 'Usar huella / Face ID'}
          </button>
        )}

        {/* Separador — solo si hay ambos métodos */}
        {webauthnHabilitado && pinHabilitado && (
          <div className="w-full flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">o</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
        )}

        {/* PIN — visible si está habilitado */}
        {pinHabilitado && (
          <div className="w-full flex flex-col items-center gap-4">

            {/* Indicadores de dígitos ingresados */}
            <div className="flex gap-3">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-all ${
                    i < pin.length
                      ? 'bg-zinc-100 scale-110'
                      : 'bg-zinc-700'
                  }`}
                />
              ))}
            </div>

            {/* Teclado numérico */}
            <div className="grid grid-cols-3 gap-2 w-full">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button
                  key={d}
                  onClick={() => presionarDigito(d)}
                  disabled={cargando || estaBloqueado}
                  className="py-3 text-lg font-medium text-zinc-100 bg-zinc-800
                             hover:bg-zinc-700 rounded-xl transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed
                             active:scale-95"
                >
                  {d}
                </button>
              ))}

              {/* Fila inferior: vacío | 0 | borrar */}
              <div />
              <button
                onClick={() => presionarDigito('0')}
                disabled={cargando || estaBloqueado}
                className="py-3 text-lg font-medium text-zinc-100 bg-zinc-800
                           hover:bg-zinc-700 rounded-xl transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed
                           active:scale-95"
              >
                0
              </button>
              <button
                onClick={borrar}
                disabled={cargando || estaBloqueado || pin.length === 0}
                className="py-3 text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700
                           rounded-xl transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed
                           active:scale-95"
              >
                ←
              </button>
            </div>
          </div>
        )}

        {/* Mensajes de error / bloqueo */}
        {(error || estaBloqueado) && (
          <p className="text-xs text-red-400 text-center">
            {estaBloqueado
              ? `Bloqueado. Espera ${segundosRestantes} seg.`
              : error}
          </p>
        )}

        {cargando && !error && (
          <p className="text-xs text-zinc-500">Verificando...</p>
        )}
      </div>
    </div>
  )
}
