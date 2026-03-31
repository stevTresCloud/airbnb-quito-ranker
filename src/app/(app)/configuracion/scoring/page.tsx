// Página /configuracion/scoring — Server Component
//
// Obtiene los 7 criterios de scoring desde Supabase y los pasa a ScoringForm.
// Ordenados por el campo 'orden' para mantener consistencia visual.

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import ScoringForm from './ScoringForm'
import type { CriterioRow } from './actions'

export default async function ScoringPage() {
  const supabase = await createSupabaseServer()

  const { data, error } = await supabase
    .from('criterios_scoring')
    .select('*')
    .order('orden', { ascending: true })

  if (error || !data || data.length === 0) {
    redirect('/configuracion')
  }

  return <ScoringForm criterios={data as CriterioRow[]} />
}
