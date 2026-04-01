// SemaforoROI.tsx — Indicador de semáforo para ROI y cobertura
//
// ROI anual:       Verde ≥8% | Amarillo 5-8% | Rojo <5%
// Cobertura c/A:   Verde ≥120% | Amarillo 100-120% | Rojo <100%
//
// Muestra un círculo de color + valor formateado.
// Sin estado — componente puramente visual.

type TipoSemaforo = 'roi' | 'cobertura'

interface Props {
  tipo: TipoSemaforo
  valor: number | null
  className?: string
}

function calcularColor(tipo: TipoSemaforo, valor: number): 'verde' | 'amarillo' | 'rojo' {
  if (tipo === 'roi') {
    if (valor >= 8) return 'verde'
    if (valor >= 5) return 'amarillo'
    return 'rojo'
  }
  // cobertura
  if (valor >= 120) return 'verde'
  if (valor >= 100) return 'amarillo'
  return 'rojo'
}

const COLORES = {
  verde:    'bg-emerald-500',
  amarillo: 'bg-amber-400',
  rojo:     'bg-red-500',
}

export function SemaforoROI({ tipo, valor, className = '' }: Props) {
  if (valor === null || valor === undefined) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-zinc-700 inline-block" />
        <span className="text-xs text-zinc-600">—</span>
      </div>
    )
  }

  const color = calcularColor(tipo, valor)
  const label = tipo === 'roi'
    ? `${valor.toFixed(1)}%`
    : `${Math.round(valor)}%`

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${COLORES[color]}`} />
      <span className="text-xs text-zinc-300 font-mono">{label}</span>
    </div>
  )
}
