// Detalle de Unidad — Server Component
//
// Por qué Server Component:
//   Fetcha todos los datos necesarios (proyecto completo + criterios + adjuntos + config)
//   directamente desde Supabase antes de renderizar. Sin loading spinners, sin
//   useEffect, sin API routes intermedias.
//
// Decisión de arquitectura — URL firmadas para adjuntos:
//   El bucket 'adjuntos-proyectos' es privado — los archivos no tienen URL pública.
//   El Server Component genera URLs firmadas (válidas 24 h) antes de pasar los
//   adjuntos al Client Component. Así el cliente puede descargar sin exponer credenciales.
//
// Por qué pasamos `config` al formulario de edición:
//   Los campos de pago (porcentaje_entrada, reserva, etc.) se guardan como null en DB
//   cuando el usuario usa el formulario rápido. Null significa "usa el default de config".
//   Pasamos config para que el formulario muestre el valor efectivo en el placeholder,
//   evitando que el usuario vea campos vacíos sin entender por qué.
//
// params es Promise en Next.js 15+ (breaking change del App Router)
// → debe usarse await antes de acceder a los segmentos dinámicos.

import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import { DetalleProyecto, type ProyectoDetalle, type CriterioRow } from './DetalleProyecto'
import type { AdjuntoRow } from '@/components/AdjuntosPanel'
import type { ConfiguracionRow } from '@/app/(app)/configuracion/actions'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProyectoDetallePage({ params }: PageProps) {
  // Await params antes de desestructurar (Next.js 16 — params es Promise)
  const { id } = await params

  const supabase = await createSupabaseServer()

  // Fetchar todo en paralelo con Promise.all para minimizar latencia
  const [
    { data: proyecto, error: errProyecto },
    { data: criterios },
    { data: adjuntosRaw },
    { data: config },
  ] = await Promise.all([
    supabase.from('proyectos').select('*').eq('id', id).single(),
    supabase.from('criterios_scoring')
      .select('id, clave, nombre, descripcion, peso, orden')
      .eq('activo', true)
      .order('orden'),
    supabase.from('adjuntos')
      .select('*')
      .eq('proyecto_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('configuracion').select('*').single(),
  ])

  // Proyecto no encontrado → 404 estándar de Next.js
  if (errProyecto || !proyecto) {
    notFound()
  }

  // Generar URLs firmadas (24 h) para los adjuntos con storage_path
  // Los adjuntos con url_externa simplemente no necesitan firma
  const adjuntos: AdjuntoRow[] = await Promise.all(
    (adjuntosRaw ?? []).map(async (adj) => {
      let url_firmada: string | null = null
      if (adj.storage_path) {
        const { data } = await supabase.storage
          .from('adjuntos-proyectos')
          .createSignedUrl(adj.storage_path, 60 * 60 * 24) // 24 horas
        url_firmada = data?.signedUrl ?? null
      }
      return { ...adj, url_firmada }
    })
  )

  return (
    <DetalleProyecto
      proyecto={proyecto as unknown as ProyectoDetalle}
      criterios={(criterios ?? []) as CriterioRow[]}
      adjuntos={adjuntos}
      config={(config ?? undefined) as ConfiguracionRow | undefined}
    />
  )
}
