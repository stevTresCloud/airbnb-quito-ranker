// Página /configuracion — Server Component
//
// Por qué Server Component (sin 'use client'):
// Necesitamos obtener los datos de Supabase antes de renderizar.
// Los Server Components pueden hacer await directamente en el cuerpo de la función,
// sin useEffect ni estado de carga — el HTML se sirve ya con los datos.
//
// Flujo:
// 1. Este Server Component hace fetch a Supabase
// 2. Pasa los datos a ConfiguracionForm (Client Component) como props
// 3. ConfiguracionForm maneja la interactividad (guardar, feedback, botón recalcular)

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import ConfiguracionForm from './ConfiguracionForm'
import type { ConfiguracionRow } from './actions'

export default async function ConfiguracionPage() {
  const supabase = await createSupabaseServer()

  const { data, error } = await supabase
    .from('configuracion')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) {
    // Si no existe la fila (nunca debería pasar si el seed corrió),
    // redirigir al dashboard con un mensaje implícito de error
    redirect('/')
  }

  return <ConfiguracionForm config={data as ConfiguracionRow} />
}
