// POST /api/verificar-pin
//
// Recibe { pin: string } → compara con el hash almacenado en DB → si coincide,
// setea la cookie "config_unlocked" (httpOnly, 30 min) y devuelve { ok: true }.
//
// La cookie httpOnly permite que el Server Component del layout de /configuracion/*
// detecte que el usuario ya se autenticó sin necesidad de una petición al cliente.

import { cookies } from 'next/headers'
import { createSupabaseServer } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

const UNLOCK_DURATION_SEC = 30 * 60 // 30 minutos

export async function POST(request: Request) {
  // Verificar sesión
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const pin: string = body?.pin ?? ''

  if (!/^\d{6}$/.test(pin)) {
    return Response.json({ ok: false, error: 'PIN inválido' }, { status: 400 })
  }

  // Obtener el hash almacenado
  const { data: config } = await supabase
    .from('configuracion')
    .select('pin_hash, pin_habilitado')
    .single()

  if (!config?.pin_habilitado || !config?.pin_hash) {
    return Response.json({ ok: false, error: 'PIN no configurado' }, { status: 400 })
  }

  // Comparar con bcrypt (timing-safe — bcryptjs lo maneja internamente)
  const match = await bcrypt.compare(pin, config.pin_hash)
  if (!match) {
    return Response.json({ ok: false, error: 'PIN incorrecto' })
  }

  // Establecer cookie de desbloqueo (httpOnly — solo el servidor puede leerla)
  const cookieStore = await cookies()
  cookieStore.set('config_unlocked', String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: UNLOCK_DURATION_SEC,
    path: '/',
    sameSite: 'strict',
  })

  return Response.json({ ok: true })
}
