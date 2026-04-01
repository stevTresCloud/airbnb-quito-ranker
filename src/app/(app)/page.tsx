// Dashboard — Server Component
//
// Por qué Server Component:
//   Fetcha los proyectos directamente desde Supabase en el servidor, antes de enviar HTML
//   al browser. Sin loading spinner, sin useEffect, sin API route intermedia.
//   Una vez cargados, pasa los datos a RankingDashboard (Client Component) como props.
//
// La separación Server/Client es el patrón central de Next.js App Router:
//   Server Component  → accede a datos (Supabase, fs, env server-side)
//   Client Component  → maneja estado interactivo (filtros, clicks, useState)

import { createSupabaseServer } from '@/lib/supabase'
import RankingDashboard, { type ProyectoRanking } from './RankingDashboard'

// Campos que necesita el dashboard (subconjunto de la tabla proyectos).
// Listar explícitamente los campos en select() es más eficiente que select('*')
// — Supabase solo envía lo que pedimos.
const CAMPOS_SELECT = [
  'id', 'nombre', 'tipo', 'sector', 'estado', 'preferencia',
  'unidades_disponibles', 'permite_airbnb',
  'latitud', 'longitud',
  'score_total', 'score_roi', 'score_ubicacion', 'score_constructora',
  'score_entrega', 'score_precio_m2', 'score_calidad', 'score_confianza',
  'roi_anual', 'cobertura_con_airbnb', 'precio_base', 'precio_m2',
  'cuota_mensual', 'flujo_con_airbnb', 'meses_espera',
].join(', ')

export default async function DashboardPage() {
  const supabase = await createSupabaseServer()

  // Sin .order() aquí — el ordenamiento lo hace RankingDashboard client-side.
  // Esto permite cambiar el orden con los filtros sin round-trip al servidor.
  const { data, error } = await supabase
    .from('proyectos')
    .select(CAMPOS_SELECT)

  if (error) {
    // En producción: loggear el error server-side, mostrar UI amigable al usuario.
    console.error('[DashboardPage] Error fetching proyectos:', error.message)
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-400 text-sm">Error al cargar el ranking.</p>
        <p className="text-zinc-600 text-xs mt-1">{error.message}</p>
      </div>
    )
  }

  // Supabase infiere un tipo genérico basado en el string select() — casteamos
  // explícitamente vía unknown para que TypeScript acepte la conversión.
  const proyectos = (data ?? []) as unknown as ProyectoRanking[]

  return <RankingDashboard proyectos={proyectos} />
}
