// /configuracion/sectores — Server Component
//
// Fetcha todos los sectores activos ordenados por score descendente
// y los pasa a SectoresForm para edición.

import { createSupabaseServer } from '@/lib/supabase'
import SectoresForm from './SectoresForm'
import type { SectorRow } from './actions'

export default async function SectoresPage() {
  const supabase = await createSupabaseServer()

  const { data } = await supabase
    .from('sectores_scoring')
    .select('*')
    .order('score_base', { ascending: false })

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <SectoresForm sectores={(data ?? []) as SectorRow[]} />
      </div>
    </main>
  )
}
