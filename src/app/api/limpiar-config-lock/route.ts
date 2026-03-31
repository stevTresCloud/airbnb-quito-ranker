// DELETE /api/limpiar-config-lock
//
// Borra la cookie "config_unlocked" para que la próxima visita a /configuracion/*
// vuelva a pedir PIN o biométrico.
//
// Se llama desde Nav.tsx cuando el usuario navega fuera de /configuracion/*:
//   /configuracion → /          → borrar cookie → re-lock
//   /configuracion → /nuevo     → borrar cookie → re-lock
//   /configuracion → /configuracion/scoring → NO se llama (mismo grupo)

import { cookies } from 'next/headers'
import { createSupabaseServer } from '@/lib/supabase'

export async function DELETE() {
  // Verificar sesión — no permitir que nadie externo borre cookies
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.delete('config_unlocked')

  return Response.json({ ok: true })
}
