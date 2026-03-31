// GET /api/webauthn/auth-options
//
// Genera las opciones de autenticación WebAuthn para que el browser
// pueda verificar la huella / Face ID / Windows Hello del usuario.
//
// A diferencia del registro (que crea nuevas credenciales), la autenticación
// usa las credenciales ya guardadas en webauthn_credentials.

import { cookies } from 'next/headers'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { createSupabaseServer } from '@/lib/supabase'

export async function GET() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Obtener las credenciales registradas del usuario
  const { data: credenciales } = await supabase
    .from('webauthn_credentials')
    .select('id')

  if (!credenciales || credenciales.length === 0) {
    return Response.json({ error: 'No hay dispositivos registrados' }, { status: 400 })
  }

  const rpID = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost'

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    // Indicar qué credenciales se aceptan (las del usuario)
    allowCredentials: credenciales.map(c => ({
      id: c.id,
      type: 'public-key' as const,
    })),
  })

  // Guardar el challenge en cookie httpOnly (expira en 5 min)
  const cookieStore = await cookies()
  cookieStore.set('_wac_auth', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300,
    path: '/',
    sameSite: 'strict',
  })

  return Response.json(options)
}
