// page.tsx — Pantalla /nuevo (Server Component)
//
// Fetcha los sectores activos de la DB y los pasa al formulario.
// Así el select es dinámico: el usuario puede agregar nuevos sectores en /configuracion/sectores
// sin tocar código.

import NuevoTabs from './NuevoTabs'
import { createSupabaseServer } from '@/lib/supabase'
import type { SectorOption } from '@/types/proyecto'

export default async function NuevoPage() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('sectores_scoring')
    .select('nombre, score_base, airbnb_noche_min, airbnb_noche_max, perfil')
    .eq('activo', true)
    .order('score_base', { ascending: false })

  const sectores: SectorOption[] = data ?? []

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Nuevo proyecto</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Ingresa rápido desde voz, foto o manual. Completa el resto luego.
          </p>
        </div>

        <NuevoTabs sectores={sectores} />
      </div>
    </main>
  )
}
