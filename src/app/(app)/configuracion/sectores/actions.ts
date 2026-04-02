'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase'

export interface SectorRow {
  id: string
  nombre: string
  zona: string | null
  score_base: number
  grado: string | null
  airbnb_noche_min: number
  airbnb_noche_max: number
  arriendo_lp_min: number
  arriendo_lp_max: number
  perfil: string | null
  activo: boolean
  orden: number | null
  plusvalia_anual_estimada: number
  // Sub-criterios de ubicación (0 = sin asignar → se usa score_base como fallback)
  sc_renta: number      // 0-30  Demanda Airbnb / precio noche
  sc_seguridad: number  // 0-25  Índice de seguridad del barrio
  sc_plusvalia: number  // 0-20  Apreciación histórica
  sc_acceso: number     // 0-15  Movilidad y transporte
  sc_servicios: number  // 0-10  Comercio y entretenimiento
}

export type SectoresActionState = { ok: boolean; error?: string } | null

// Guarda los scores editados de los sectores existentes
export async function guardarSectores(
  _prevState: SectoresActionState,
  formData: FormData
): Promise<SectoresActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  // Leer todos los campos del formulario para cada sector
  const updates: {
    id: string
    score_base: number
    airbnb_noche_min: number
    airbnb_noche_max: number
    plusvalia_anual_estimada: number
    sc_renta: number
    sc_seguridad: number
    sc_plusvalia: number
    sc_acceso: number
    sc_servicios: number
  }[] = []

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('score_')) {
      const id = key.replace('score_', '')
      const score = Number(value)
      if (score < 0 || score > 100) return { ok: false, error: `Score fuera de rango (0-100) en sector ${id}` }

      const sc_renta     = Number(formData.get(`sc_renta_${id}`)     ?? 0)
      const sc_seguridad = Number(formData.get(`sc_seguridad_${id}`) ?? 0)
      const sc_plusvalia = Number(formData.get(`sc_plusvalia_${id}`) ?? 0)
      const sc_acceso    = Number(formData.get(`sc_acceso_${id}`)    ?? 0)
      const sc_servicios = Number(formData.get(`sc_servicios_${id}`) ?? 0)

      // Validar rangos de sub-criterios
      if (sc_renta < 0 || sc_renta > 30)         return { ok: false, error: `Renta fuera de rango (0-30) en sector ${id}` }
      if (sc_seguridad < 0 || sc_seguridad > 25)  return { ok: false, error: `Seguridad fuera de rango (0-25) en sector ${id}` }
      if (sc_plusvalia < 0 || sc_plusvalia > 20)  return { ok: false, error: `Plusvalía fuera de rango (0-20) en sector ${id}` }
      if (sc_acceso < 0 || sc_acceso > 15)        return { ok: false, error: `Acceso fuera de rango (0-15) en sector ${id}` }
      if (sc_servicios < 0 || sc_servicios > 10)  return { ok: false, error: `Servicios fuera de rango (0-10) en sector ${id}` }

      updates.push({
        id,
        score_base: score,
        airbnb_noche_min: Number(formData.get(`airbnb_min_${id}`) ?? 0),
        airbnb_noche_max: Number(formData.get(`airbnb_max_${id}`) ?? 0),
        plusvalia_anual_estimada: Number(formData.get(`plusvalia_${id}`) ?? 5),
        sc_renta, sc_seguridad, sc_plusvalia, sc_acceso, sc_servicios,
      })
    }
  }

  for (const u of updates) {
    const { error } = await supabase
      .from('sectores_scoring')
      .update({
        score_base: u.score_base,
        airbnb_noche_min: u.airbnb_noche_min,
        airbnb_noche_max: u.airbnb_noche_max,
        plusvalia_anual_estimada: u.plusvalia_anual_estimada,
        sc_renta: u.sc_renta,
        sc_seguridad: u.sc_seguridad,
        sc_plusvalia: u.sc_plusvalia,
        sc_acceso: u.sc_acceso,
        sc_servicios: u.sc_servicios,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id)

    if (error) return { ok: false, error: `Error al guardar ${u.id}: ${error.message}` }
  }

  revalidatePath('/configuracion/sectores')
  revalidatePath('/nuevo')
  return { ok: true }
}

// Agrega un sector nuevo desde la pantalla de configuración
export async function agregarSector(
  _prevState: SectoresActionState,
  formData: FormData
): Promise<SectoresActionState> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const nombre = (formData.get('nuevo_nombre') as string | null)?.trim()
  const zona = (formData.get('nuevo_zona') as string | null)?.trim() || null
  const score_base = Number(formData.get('nuevo_score') ?? 0)
  const airbnb_min = Number(formData.get('nuevo_airbnb_min') ?? 0)
  const airbnb_max = Number(formData.get('nuevo_airbnb_max') ?? 0)

  if (!nombre) return { ok: false, error: 'El nombre es obligatorio' }
  if (score_base < 0 || score_base > 100) return { ok: false, error: 'El score debe ser entre 0 y 100' }

  // Verificar que no exista ya (case-insensitive)
  const { data: existente } = await supabase
    .from('sectores_scoring')
    .select('nombre')
    .ilike('nombre', nombre)
    .maybeSingle()

  if (existente) return { ok: false, error: `Ya existe un sector con ese nombre: "${existente.nombre}"` }

  const plusvalia = Number(formData.get('nuevo_plusvalia') ?? 5)

  const { error } = await supabase
    .from('sectores_scoring')
    .insert({ nombre, zona, score_base, airbnb_noche_min: airbnb_min, airbnb_noche_max: airbnb_max, plusvalia_anual_estimada: plusvalia, activo: true })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracion/sectores')
  revalidatePath('/nuevo')
  return { ok: true }
}
