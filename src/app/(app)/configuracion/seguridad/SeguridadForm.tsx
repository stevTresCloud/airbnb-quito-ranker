// SeguridadForm — Client Component para /configuracion/seguridad
//
// Tiene tres secciones:
//  1. PIN — activar, cambiar o desactivar el PIN de 6 dígitos
//  2. WebAuthn — registrar dispositivos biométricos (huella / Face ID / Windows Hello)
//  3. Dispositivos registrados — lista con opción de eliminar cada uno

'use client'

import { useActionState, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { guardarPIN, desactivarPIN, eliminarCredencialWebAuthn } from './actions'

type Credencial = {
  id: string
  device_name: string
  created_at: string
}

type Props = {
  pinHabilitado: boolean
  webauthnHabilitado: boolean
  credenciales: Credencial[]
}

// ─── Sección PIN ──────────────────────────────────────────────────────────────

function SeccionPIN({ pinHabilitado }: { pinHabilitado: boolean }) {
  const [estadoGuardar, accionGuardar, pendienteGuardar] = useActionState(guardarPIN, null)
  const [estadoDesact,  accionDesact,  pendienteDesact]  = useActionState(desactivarPIN, null)
  const [mostrarForm, setMostrarForm] = useState(!pinHabilitado)

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">PIN de 6 dígitos</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {pinHabilitado
              ? 'Activo — se pedirá al acceder a Configuración'
              : 'Sin activar — Configuración está desprotegida'}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          pinHabilitado
            ? 'bg-emerald-900/50 text-emerald-400'
            : 'bg-zinc-800 text-zinc-500'
        }`}>
          {pinHabilitado ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Formulario para activar / cambiar PIN */}
      {mostrarForm ? (
        <form action={accionGuardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Nuevo PIN</label>
              <input
                type="password"
                name="pin"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                           text-zinc-100 text-sm placeholder-zinc-600
                           focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Confirmar PIN</label>
              <input
                type="password"
                name="confirmacion"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                           text-zinc-100 text-sm placeholder-zinc-600
                           focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {estadoGuardar?.error && (
            <p className="text-xs text-red-400">{estadoGuardar.error}</p>
          )}
          {estadoGuardar?.ok && (
            <p className="text-xs text-emerald-400">PIN guardado correctamente</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pendienteGuardar}
              className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-sm
                         font-medium py-2 px-4 rounded-lg transition-colors
                         disabled:opacity-50"
            >
              {pendienteGuardar ? 'Guardando...' : pinHabilitado ? 'Cambiar PIN' : 'Activar PIN'}
            </button>
            {pinHabilitado && (
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="text-sm text-zinc-500 hover:text-zinc-300 px-3"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarForm(true)}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors
                       border border-zinc-700 rounded-lg px-3 py-1.5"
          >
            Cambiar PIN
          </button>

          {/* Desactivar PIN */}
          <form action={accionDesact}>
            <button
              type="submit"
              disabled={pendienteDesact}
              className="text-sm text-red-500 hover:text-red-400 transition-colors
                         border border-red-900/50 rounded-lg px-3 py-1.5
                         disabled:opacity-50"
            >
              {pendienteDesact ? 'Desactivando...' : 'Desactivar'}
            </button>
          </form>
        </div>
      )}

      {estadoDesact?.ok && (
        <p className="text-xs text-zinc-500">PIN desactivado.</p>
      )}
    </div>
  )
}

// ─── Sección WebAuthn ─────────────────────────────────────────────────────────

function SeccionWebAuthn({
  webauthnHabilitado,
  credenciales,
}: {
  webauthnHabilitado: boolean
  credenciales: Credencial[]
}) {
  const [estadoElim, accionElim, pendienteElim] = useActionState(eliminarCredencialWebAuthn, null)
  const [registrando, setRegistrando] = useState(false)
  const [mensajeReg, setMensajeReg]   = useState('')
  const [errorReg, setErrorReg]       = useState('')
  const [nombreDispositivo, setNombreDispositivo] = useState('Mi dispositivo')

  async function registrarDispositivo() {
    setRegistrando(true)
    setErrorReg('')
    setMensajeReg('')
    try {
      // 1. Obtener opciones del servidor
      const optRes = await fetch('/api/webauthn/register-options')
      if (!optRes.ok) throw new Error('Error al obtener opciones de registro')
      const options = await optRes.json()

      // 2. El browser invoca la API biométrica del dispositivo
      //    (Face ID en iPhone, huella en Android, Windows Hello en PC)
      const regResponse = await startRegistration({ optionsJSON: options })

      // 3. Enviar respuesta + nombre al servidor para verificar y guardar
      const verRes = await fetch('/api/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: regResponse, deviceName: nombreDispositivo }),
      })
      const result = await verRes.json()

      if (result.ok) {
        setMensajeReg('Dispositivo registrado correctamente. Recarga para ver la lista actualizada.')
      } else {
        setErrorReg(result.error ?? 'Error al registrar el dispositivo')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('cancelled') || msg.includes('abort')) {
        setErrorReg('Registro cancelado.')
      } else {
        setErrorReg('Este dispositivo no soporta autenticación biométrica, o la cancelaste.')
      }
    } finally {
      setRegistrando(false)
    }
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">Huella / Face ID / Windows Hello</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {webauthnHabilitado
              ? `${credenciales.length} dispositivo(s) registrado(s)`
              : 'Sin dispositivos — usa el lector biométrico de tu dispositivo'}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          webauthnHabilitado
            ? 'bg-emerald-900/50 text-emerald-400'
            : 'bg-zinc-800 text-zinc-500'
        }`}>
          {webauthnHabilitado ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Registrar nuevo dispositivo */}
      <div className="space-y-2">
        <input
          type="text"
          value={nombreDispositivo}
          onChange={e => setNombreDispositivo(e.target.value)}
          placeholder="Nombre del dispositivo"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                     text-zinc-100 text-sm placeholder-zinc-600
                     focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={registrarDispositivo}
          disabled={registrando}
          className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-sm
                     font-medium py-2 px-4 rounded-lg transition-colors
                     disabled:opacity-50"
        >
          {registrando ? 'Esperando biométrico...' : 'Registrar huella / Face ID'}
        </button>
      </div>

      {mensajeReg && <p className="text-xs text-emerald-400">{mensajeReg}</p>}
      {errorReg   && <p className="text-xs text-red-400">{errorReg}</p>}
      {estadoElim?.error && <p className="text-xs text-red-400">{estadoElim.error}</p>}

      {/* Lista de dispositivos registrados */}
      {credenciales.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">Dispositivos registrados:</p>
          {credenciales.map(c => (
            <div key={c.id}
              className="flex items-center justify-between py-2 px-3
                         bg-zinc-800/50 rounded-lg">
              <div>
                <p className="text-sm text-zinc-100">{c.device_name}</p>
                <p className="text-xs text-zinc-600">
                  Registrado: {new Date(c.created_at).toLocaleDateString('es-EC')}
                </p>
              </div>
              <form action={accionElim}>
                <input type="hidden" name="credential_id" value={c.id} />
                <button
                  type="submit"
                  disabled={pendienteElim}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Eliminar
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function SeguridadForm({ pinHabilitado, webauthnHabilitado, credenciales }: Props) {
  return (
    <div className="space-y-4">
      <SeccionPIN pinHabilitado={pinHabilitado} />
      <SeccionWebAuthn
        webauthnHabilitado={webauthnHabilitado}
        credenciales={credenciales}
      />
    </div>
  )
}
