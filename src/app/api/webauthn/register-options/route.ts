// GET /api/webauthn/register-options
//
// Genera las opciones de registro WebAuthn para que el browser pueda registrar
// la huella / Face ID / Windows Hello del usuario.
//
// El "challenge" (número aleatorio único) se guarda en una cookie httpOnly
// para que el endpoint register-verify pueda comparar la respuesta del browser.
//
// RP ID (Relying Party ID): dominio de la app.
//   - En desarrollo: "localhost"
//   - En producción: el dominio real (ej: "airbnb-quito-ranker.vercel.app")
//   Configurar la variable de entorno NEXT_PUBLIC_APP_DOMAIN en Vercel.

import { cookies } from 'next/headers'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { createSupabaseServer } from '@/lib/supabase'

export async function GET() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Credenciales ya registradas (para excluirlas y no registrar el mismo dispositivo dos veces)
  const { data: existentes } = await supabase
    .from('webauthn_credentials')
    .select('id')

  const rpID = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost'

  const options = await generateRegistrationOptions({
    rpName: 'Airbnb Quito Ranker',
    rpID,
    userName: user.email ?? 'usuario',
    userDisplayName: user.email ?? 'usuario',
    attestationType: 'none',
    authenticatorSelection: {
      // 'platform' = biométrico del dispositivo (huella, Face ID, Windows Hello)
      // vs 'cross-platform' = llaves de seguridad físicas (YubiKey, etc.)
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    // Excluir credenciales ya registradas para evitar duplicados
    excludeCredentials: (existentes ?? []).map(c => ({
      id: c.id,
      type: 'public-key' as const,
    })),
  })

  // Guardar el challenge en cookie httpOnly (expira en 5 min — solo para este registro)
  const cookieStore = await cookies()
  cookieStore.set('_wac_reg', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300,
    path: '/',
    sameSite: 'strict',
  })

  return Response.json(options)
}
