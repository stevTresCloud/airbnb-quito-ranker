'use server'
// Server Actions para /configuracion/scoring

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase'

export type CriterioRow = {
  id: string
  clave: string
  nombre: string
  descripcion: string | null
  peso: number
  activo: boolean
  orden: number
}

export type ScoringActionState = { ok: boolean; error?: string } | null

export async function guardarPesos(
  _prevState: ScoringActionState,
  formData: FormData
): Promise<ScoringActionState> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  // Leer los criterios actuales para saber sus IDs
  const { data: criterios, error: errorLectura } = await supabase
    .from('criterios_scoring')
    .select('id, clave')

  if (errorLectura || !criterios) {
    return { ok: false, error: 'No se pudieron cargar los criterios' }
  }

  // Construir los nuevos pesos desde el FormData
  // El formulario envía un campo por criterio con name="peso_<id>"
  const actualizaciones = criterios.map((criterio) => ({
    id: criterio.id,
    peso: Number(formData.get(`peso_${criterio.id}`)) / 100,
    // Dividimos por 100 porque el formulario usa porcentajes (0-100)
    // pero la DB almacena decimales (0.00 a 1.00)
    updated_at: new Date().toISOString(),
  }))

  // Validar que la suma sea exactamente 1.00 (con margen para punto flotante)
  const suma = actualizaciones.reduce((acc, u) => acc + u.peso, 0)
  if (Math.abs(suma - 1) > 0.001) {
    const sumaDisplay = (suma * 100).toFixed(1)
    return {
      ok: false,
      error: `Los pesos deben sumar exactamente 100% (ahora suman ${sumaDisplay}%)`,
    }
  }

  // Actualizar cada criterio con su nuevo peso usando update individual.
  // No usamos upsert porque upsert hace INSERT ... ON CONFLICT UPDATE — el INSERT
  // fallaba con "null value in column clave" ya que solo enviábamos {id, peso, updated_at}.
  // Con update solo se modifican los campos indicados; los demás quedan intactos.
  const resultados = await Promise.all(
    actualizaciones.map(({ id, peso }) =>
      supabase
        .from('criterios_scoring')
        .update({ peso, updated_at: new Date().toISOString() })
        .eq('id', id)
    )
  )

  const fallido = resultados.find((r) => r.error)
  if (fallido?.error) return { ok: false, error: fallido.error.message }

  // Reordenar criterios por peso descendente (el de mayor peso queda en orden=1).
  // Esto actualiza el campo `orden` que determina la secuencia visual en el desglose.
  const ordenados = [...actualizaciones].sort((a, b) => b.peso - a.peso)
  await Promise.all(
    ordenados.map(({ id }, idx) =>
      supabase
        .from('criterios_scoring')
        .update({ orden: idx + 1 })
        .eq('id', id)
    )
  )

  revalidatePath('/configuracion/scoring')
  revalidatePath('/configuracion')
  return { ok: true }
}

// ─── Activar / desactivar criterio ───────────────────────────────────────────
// Permite excluir un criterio del ranking sin borrarlo de la DB.
// El peso del criterio desactivado queda en 0 efectivo — los pesos de los demás
// no se redistribuyen automáticamente; el usuario debe reajustarlos manualmente.
export async function toggleCriterio(
  _prevState: ScoringActionState,
  formData: FormData
): Promise<ScoringActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const id     = formData.get('id') as string
  const activo = formData.get('activo') === 'true'  // valor que viene del form

  const { error } = await supabase
    .from('criterios_scoring')
    .update({ activo, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracion/scoring')
  revalidatePath('/')
  return { ok: true }
}

// ─── Editar nombre y descripción de un criterio ───────────────────────────────
export async function editarCriterio(
  _prevState: ScoringActionState,
  formData: FormData
): Promise<ScoringActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const id          = formData.get('id') as string
  const nombre      = (formData.get('nombre') as string | null)?.trim()
  const descripcion = (formData.get('descripcion') as string | null)?.trim() || null

  if (!nombre) return { ok: false, error: 'El nombre no puede estar vacío' }

  const { error } = await supabase
    .from('criterios_scoring')
    .update({ nombre, descripcion, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracion/scoring')
  return { ok: true }
}
