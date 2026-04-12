'use server'
// Server Actions para /configuracion
//
// Todas las funciones en este archivo corren en el servidor (marcadas implícitamente
// por el 'use server' al inicio del archivo).
//
// IMPORTANTE: Siempre verificamos la sesión dentro del Server Action,
// aunque la página ya esté protegida por proxy.ts y el layout.
// Esto evita que alguien llame al Server Action directamente vía fetch.

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase'

// Tipo que representa la fila única de la tabla configuracion
export type ConfiguracionRow = {
  id: number
  sueldo_neto: number
  porcentaje_ahorro: number
  porcentaje_gastos_airbnb: number
  banco_default: string
  tasa_default: number
  anos_credito_default: number
  anos_proyeccion: number
  costo_amoblado_default: number
  reserva_default: number
  porcentaje_entrada_default: number
  porcentaje_durante_construccion_default: number
  num_cuotas_construccion_default: number
  porcentaje_contra_entrega_default: number
  seguro_mensual_default: number
}

// Estado que devuelven las acciones — null = sin feedback aún
export type ActionState = { ok: boolean; error?: string } | null

// ── Guardar configuración ─────────────────────────────────────────────────────
// Recibe _prevState (requerido por useActionState) y el FormData del formulario.
export async function guardarConfiguracion(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()

  // Verificación de sesión dentro del Server Action (regla de seguridad)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const entrada = Number(formData.get('porcentaje_entrada_default'))
  const durante = Number(formData.get('porcentaje_durante_construccion_default'))
  const contra = Number(formData.get('porcentaje_contra_entrega_default'))

  // Validación: los tres porcentajes de pago deben sumar exactamente 100%
  if (Math.abs(entrada + durante + contra - 100) > 0.01) {
    return {
      ok: false,
      error: `Los porcentajes de pago deben sumar 100% (ahora suman ${entrada + durante + contra}%)`,
    }
  }

  const { error } = await supabase
    .from('configuracion')
    .update({
      sueldo_neto: Number(formData.get('sueldo_neto')),
      porcentaje_ahorro: Number(formData.get('porcentaje_ahorro')),
      porcentaje_gastos_airbnb: Number(formData.get('porcentaje_gastos_airbnb')),
      banco_default: formData.get('banco_default') as string,
      tasa_default: Number(formData.get('tasa_default')),
      anos_credito_default: Number(formData.get('anos_credito_default')),
      anos_proyeccion: Number(formData.get('anos_proyeccion')),
      costo_amoblado_default: Number(formData.get('costo_amoblado_default')),
      seguro_mensual_default: Number(formData.get('seguro_mensual_default')),
      reserva_default: Number(formData.get('reserva_default')),
      porcentaje_entrada_default: entrada,
      porcentaje_durante_construccion_default: durante,
      num_cuotas_construccion_default: Number(formData.get('num_cuotas_construccion_default')),
      porcentaje_contra_entrega_default: contra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { ok: false, error: error.message }

  // revalidatePath invalida el caché del Server Component de esta ruta.
  // La próxima vez que alguien visite /configuracion, Next.js vuelve a
  // hacer fetch desde Supabase en lugar de usar la versión cacheada.
  revalidatePath('/configuracion')
  return { ok: true }
}

// ── Recalcular ranking ────────────────────────────────────────────────────────
// La lógica real se implementa en Fase 3 cuando existan proyectos.
// Por ahora el botón existe y confirma que funciona.
export async function recalcularRanking(
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  // TODO Fase 3: leer todos los proyectos, recalcular métricas y scores, upsert masivo
  return { ok: true }
}
