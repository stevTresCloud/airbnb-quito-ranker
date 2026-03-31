// POST /api/webauthn/register-verify
//
// Verifica la respuesta del browser después de que el usuario confirmó
// su huella / Face ID / Windows Hello durante el registro.
//
// Recibe: { response: AuthenticatorAttestationResponse, deviceName: string }
// Si la verificación es exitosa:
//   1. Guarda la credencial (id + public_key + counter) en webauthn_credentials
//   2. Activa webauthn_habilitado = true en configuracion
//   3. Setea la cookie de desbloqueo (el registro implica autenticación exitosa)

import { cookies } from 'next/headers'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { createSupabaseServer } from '@/lib/supabase'

const UNLOCK_DURATION_SEC = 30 * 60

export async function POST(request: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Leer el challenge guardado durante register-options
  const cookieStore = await cookies()
  const expectedChallenge = cookieStore.get('_wac_reg')?.value
  if (!expectedChallenge) {
    return Response.json({ error: 'Challenge expirado. Intenta de nuevo.' }, { status: 400 })
  }

  const body = await request.json()
  const { response, deviceName } = body

  const rpID   = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost'
  const origin = rpID === 'localhost'
    ? 'http://localhost:3000'
    : `https://${rpID}`

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch {
    return Response.json({ error: 'Verificación biométrica fallida' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return Response.json({ error: 'Registro no verificado' }, { status: 400 })
  }

  const { credential } = verification.registrationInfo

  // Guardar la credencial en DB
  // public_key se guarda como base64 para almacenarlo en texto
  const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64')

  const { error: insertError } = await supabase
    .from('webauthn_credentials')
    .insert({
      id:          credential.id,
      public_key:  publicKeyBase64,
      counter:     credential.counter,
      device_name: deviceName ?? 'Mi dispositivo',
    })

  if (insertError) {
    return Response.json({ error: 'Error al guardar credencial' }, { status: 500 })
  }

  // Activar webauthn_habilitado en configuracion
  await supabase
    .from('configuracion')
    .update({ webauthn_habilitado: true })
    .eq('id', 1)

  // Limpiar el challenge (ya usado)
  cookieStore.delete('_wac_reg')

  // El registro exitoso equivale a autenticación → setear cookie de desbloqueo
  cookieStore.set('config_unlocked', String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: UNLOCK_DURATION_SEC,
    path: '/',
    sameSite: 'strict',
  })

  return Response.json({ ok: true })
}
