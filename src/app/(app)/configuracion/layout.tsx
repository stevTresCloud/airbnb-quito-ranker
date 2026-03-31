// Layout para todas las rutas bajo /configuracion/*
//
// Este Server Component actúa como la primera línea de defensa del bloqueo:
//  1. Lee la cookie "config_unlocked" (httpOnly — solo el servidor puede leerla)
//  2. Si la cookie es válida (< 30 min): renderiza los children directamente (sin overlay)
//  3. Si no: envuelve con <ConfigLock> que muestra el overlay de PIN/WebAuthn
//
// Ventaja de hacer el check en el servidor: no hay flash de overlay — el servidor
// decide antes de renderizar si el usuario necesita autenticarse o no.
//
// Las rutas afectadas: /configuracion, /configuracion/scoring,
//                       /configuracion/sectores, /configuracion/seguridad

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import { ConfigLock } from '@/components/ConfigLock'

const UNLOCK_DURATION_MS = 30 * 60 * 1000 // 30 minutos

export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Verificar sesión (segunda línea de defensa, además del proxy.ts)
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Leer configuración de seguridad de la DB
  const { data: config } = await supabase
    .from('configuracion')
    .select('pin_habilitado, webauthn_habilitado')
    .single()

  const pinHabilitado      = config?.pin_habilitado      ?? false
  const webauthnHabilitado = config?.webauthn_habilitado ?? false

  // Si no hay ningún método activo → pasar directo (sin bloqueo)
  if (!pinHabilitado && !webauthnHabilitado) {
    return <>{children}</>
  }

  // Verificar si ya existe una sesión de desbloqueo válida (cookie httpOnly)
  const cookieStore = await cookies()
  const unlockedAt = cookieStore.get('config_unlocked')?.value
  const isUnlocked = unlockedAt && (Date.now() - Number(unlockedAt)) < UNLOCK_DURATION_MS

  // Si está desbloqueado → renderizar directo (sin overlay, sin flash)
  if (isUnlocked) {
    return <>{children}</>
  }

  // Si está bloqueado → envolver con ConfigLock (muestra overlay al cliente)
  return (
    <ConfigLock pinHabilitado={pinHabilitado} webauthnHabilitado={webauthnHabilitado}>
      {children}
    </ConfigLock>
  )
}
