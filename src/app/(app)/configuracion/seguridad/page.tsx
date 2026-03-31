// /configuracion/seguridad — gestión de PIN y WebAuthn
//
// Server Component: fetcha el estado actual de seguridad y la lista
// de dispositivos registrados, luego pasa todo al Client Component.

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import { SeguridadForm } from './SeguridadForm'
import Link from 'next/link'

export default async function SeguridadPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Estado actual de los métodos de seguridad
  const { data: config } = await supabase
    .from('configuracion')
    .select('pin_habilitado, webauthn_habilitado')
    .single()

  // Dispositivos WebAuthn registrados
  const { data: credenciales } = await supabase
    .from('webauthn_credentials')
    .select('id, device_name, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/configuracion"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Configuración
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Seguridad</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Protege el acceso a esta sección con PIN o biométrico.
          Sin ningún método activo, Configuración es accesible libremente.
        </p>
      </div>

      <SeguridadForm
        pinHabilitado={config?.pin_habilitado ?? false}
        webauthnHabilitado={config?.webauthn_habilitado ?? false}
        credenciales={credenciales ?? []}
      />
    </div>
  )
}
