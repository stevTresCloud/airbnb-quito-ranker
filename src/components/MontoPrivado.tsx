// MontoPrivado — renderiza un número o "••••" según el modo privacidad
//
// Uso: <MontoPrivado valor={82500} prefijo="$" decimales={0} />
//       → "$82.500"  (modo normal)
//       → "$••••"    (modo privacidad activo)
//
// La idea es envolver con este componente cualquier dato financiero sensible
// visible en pantalla: precios, ROI, flujos, cuotas, etc.
// Los nombres de proyectos y sectores NO se ocultan (no son datos financieros).

'use client'

import { usePrivacy } from '@/contexts/PrivacyContext'

type Props = {
  valor: number | null | undefined
  prefijo?: string    // ej: "$" o "%"
  sufijo?: string     // ej: "%" o "/mes"
  decimales?: number  // dígitos decimales (default: 2)
  className?: string
}

export function MontoPrivado({
  valor,
  prefijo = '',
  sufijo = '',
  decimales = 2,
  className,
}: Props) {
  const { privacyMode } = usePrivacy()

  if (valor === null || valor === undefined) {
    return <span className={className}>—</span>
  }

  if (privacyMode) {
    return (
      <span className={className}>
        {prefijo}
        <span className="tracking-widest">••••</span>
        {sufijo}
      </span>
    )
  }

  // Formateo con separador de miles (punto) y decimales (coma) — estilo Latinoamérica
  const formateado = valor.toLocaleString('es-EC', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })

  return (
    <span className={className}>
      {prefijo}{formateado}{sufijo}
    </span>
  )
}
