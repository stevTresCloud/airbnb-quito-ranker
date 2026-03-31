// POST /api/webauthn/auth-verify
//
// Verifica la respuesta del browser después de que el usuario confirmó
// su huella / Face ID / Windows Hello durante la autenticación.
//
// Si la verificación es exitosa:
//   1. Actualiza el counter en DB (protección anti-replay — si el counter
//      baja, significa que alguien está tratando de reutilizar una firma antigua)
//   2. Setea la cookie "config_unlocked" (30 min)
//   3. Devuelve { ok: true }

import { cookies } from 'next/headers'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { createSupabaseServer } from '@/lib/supabase'

const UNLOCK_DURATION_SEC = 30 * 60

export async function POST(request: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cookieStore = await cookies()
  const expectedChallenge = cookieStore.get('_wac_auth')?.value
  if (!expectedChallenge) {
    return Response.json({ error: 'Challenge expirado. Intenta de nuevo.' }, { status: 400 })
  }

  const body = await request.json()

  // Buscar la credencial que el browser usó (identificada por body.id)
  const { data: credencial } = await supabase
    .from('webauthn_credentials')
    .select('id, public_key, counter')
    .eq('id', body.id)
    .single()

  if (!credencial) {
    return Response.json({ error: 'Credencial no encontrada' }, { status: 404 })
  }

  const rpID   = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost'
  const origin = rpID === 'localhost'
    ? 'http://localhost:3000'
    : `https://${rpID}`

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id:        credencial.id,
        publicKey: Buffer.from(credencial.public_key, 'base64'),
        counter:   credencial.counter,
      },
      requireUserVerification: true,
    })
  } catch {
    return Response.json({ error: 'Autenticación biométrica fallida' }, { status: 400 })
  }

  if (!verification.verified) {
    return Response.json({ error: 'Verificación fallida' }, { status: 400 })
  }

  // Actualizar el counter (anti-replay: cada autenticación incrementa el contador)
  await supabase
    .from('webauthn_credentials')
    .update({ counter: verification.authenticationInfo.newCounter })
    .eq('id', credencial.id)

  // Limpiar el challenge usado
  cookieStore.delete('_wac_auth')

  // Setear cookie de desbloqueo
  cookieStore.set('config_unlocked', String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: UNLOCK_DURATION_SEC,
    path: '/',
    sameSite: 'strict',
  })

  return Response.json({ ok: true })
}
