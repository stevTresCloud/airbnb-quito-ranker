'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

type ActionState = { ok: boolean; error?: string } | null

// ── Activar / cambiar PIN ─────────────────────────────────────────────────────
export async function guardarPIN(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const pin         = formData.get('pin')?.toString().trim() ?? ''
  const confirmacion = formData.get('confirmacion')?.toString().trim() ?? ''

  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: 'El PIN debe tener exactamente 6 dígitos numéricos' }
  }
  if (pin !== confirmacion) {
    return { ok: false, error: 'Los PINs no coinciden' }
  }

  // Hashear con bcrypt (coste 10 — rápido en app personal, seguro para un PIN)
  const pin_hash = await bcrypt.hash(pin, 10)

  const { error } = await supabase
    .from('configuracion')
    .update({ pin_hash, pin_habilitado: true })
    .eq('id', 1)

  if (error) return { ok: false, error: 'Error al guardar el PIN' }

  revalidatePath('/configuracion/seguridad')
  return { ok: true }
}

// ── Desactivar PIN ────────────────────────────────────────────────────────────
export async function desactivarPIN(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const { error } = await supabase
    .from('configuracion')
    .update({ pin_habilitado: false, pin_hash: null })
    .eq('id', 1)

  if (error) return { ok: false, error: 'Error al desactivar el PIN' }

  revalidatePath('/configuracion/seguridad')
  return { ok: true }
}

// ── Eliminar dispositivo WebAuthn ─────────────────────────────────────────────
export async function eliminarCredencialWebAuthn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const id = formData.get('credential_id')?.toString()
  if (!id) return { ok: false, error: 'ID de credencial inválido' }

  const { error } = await supabase
    .from('webauthn_credentials')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: 'Error al eliminar el dispositivo' }

  // Si no quedan credenciales, desactivar WebAuthn
  const { count } = await supabase
    .from('webauthn_credentials')
    .select('*', { count: 'exact', head: true })

  if ((count ?? 0) === 0) {
    await supabase
      .from('configuracion')
      .update({ webauthn_habilitado: false })
      .eq('id', 1)
  }

  revalidatePath('/configuracion/seguridad')
  return { ok: true }
}
