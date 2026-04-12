// Comparador — Server Component
//
// Por qué Server Component:
//   Lee los ids de searchParams, fetcha los proyectos de Supabase con criterios_scoring,
//   y pasa todo al Client Component. Sin estado, sin interactividad aquí.
//
// searchParams es Promise en Next.js 15+: debe usarse await antes de leer sus propiedades.
// redirect('/') lanza una excepción especial de Next.js — no se puede usar dentro de try/catch.

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import { ComparadorTabla, type ProyectoComparar, type CriterioComparar } from '@/components/ComparadorTabla'

interface PageProps {
  searchParams: Promise<{ ids?: string }>
}

// Campos que necesita el comparador (subconjunto de la tabla proyectos)
const CAMPOS_SELECT = [
  'id', 'nombre', 'tipo', 'sector', 'estado', 'preferencia',
  // Financiero
  // aporte_propio_total no se almacena — se reconstruye en cliente con monto_entrada + monto_durante_construccion
  'precio_base', 'descuento_valor', 'descuento_tipo', 'precio_total', 'cuota_mensual', 'alicuota_mensual', 'flujo_con_airbnb', 'cobertura_con_airbnb',
  'roi_anual', 'ganancia_neta', 'monto_entrada', 'monto_durante_construccion',
  'seguro_mensual',
  // Amoblado / préstamo de amoblado (cuota se calcula en cliente con PMT)
  'amoblado_financiado', 'costo_amoblado', 'tasa_prestamo_amoblado', 'meses_prestamo_amoblado',
  // Airbnb
  'precio_noche_estimado', 'ocupacion_estimada', 'ingreso_neto_mensual',
  // Unidad
  'area_interna_m2', 'area_balcon_m2', 'precio_m2', 'piso', 'pisos_totales',
  'meses_espera', 'tiene_parqueadero', 'tiene_bodega', 'viene_amoblado', 'walkability', 'amenidades',
  // Scores
  'score_total', 'score_roi', 'score_ubicacion', 'score_constructora',
  'score_entrega', 'score_equipamiento', 'score_precio_m2', 'score_calidad', 'score_confianza',
].join(', ')

export default async function CompararPage({ searchParams }: PageProps) {
  // searchParams es Promise en Next.js 16 — hay que hacer await
  const { ids: idsParam } = await searchParams

  // Parsear y validar ids
  const ids = (idsParam ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  // Mínimo 2, máximo 3 — si no se cumple, volver al ranking
  if (ids.length < 2 || ids.length > 3) redirect('/')

  const supabase = await createSupabaseServer()

  // Fetch proyectos + criterios en paralelo para minimizar latencia
  const [{ data: proyectosRaw, error }, { data: criteriosRaw }] = await Promise.all([
    supabase.from('proyectos').select(CAMPOS_SELECT).in('id', ids),
    supabase.from('criterios_scoring')
      .select('clave, nombre, peso, orden')
      .eq('activo', true)
      .order('orden'),
  ])

  if (error || !proyectosRaw) {
    console.error('[CompararPage] Supabase error:', error?.message)
    redirect('/')
  }

  // Necesitamos al menos 2 proyectos válidos encontrados en DB
  if (proyectosRaw.length < 2) redirect('/')

  // Preservar el orden original de los ids (el usuario los seleccionó en ese orden).
  // Cast via unknown: Supabase infiere un tipo genérico basado en el string select()
  // que no solapa con ProyectoComparar — igual que en DashboardPage y ProyectoDetallePage.
  const rawList = proyectosRaw as unknown as ProyectoComparar[]
  const proyectosOrdenados = ids
    .map(id => rawList.find(p => p.id === id))
    .filter(Boolean) as ProyectoComparar[]

  if (proyectosOrdenados.length < 2) redirect('/')

  return (
    <ComparadorTabla
      proyectos={proyectosOrdenados}
      criterios={(criteriosRaw ?? []) as CriterioComparar[]}
      ids={ids}
    />
  )
}
