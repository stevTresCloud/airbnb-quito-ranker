// ScoreBar.tsx — Barra visual de score 0-100
// Verde ≥70 | Amarillo 50-69 | Rojo <50
// Sin estado, sin efectos — componente puramente visual.

interface Props {
  score: number | null
  mostrarNumero?: boolean
  className?: string
}

function colorBarraPorScore(score: number): string {
  if (score >= 70) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-400'
  return 'bg-red-500'
}

function colorTextoPorScore(score: number): string {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

export function ScoreBar({ score, mostrarNumero = true, className = '' }: Props) {
  if (score === null || score === undefined) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full" />
        <span className="text-xs text-zinc-600 w-7 text-right">—</span>
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, score))

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Barra de progreso */}
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorBarraPorScore(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Número */}
      {mostrarNumero && (
        <span className={`text-xs font-mono font-semibold w-7 text-right ${colorTextoPorScore(pct)}`}>
          {Math.round(pct)}
        </span>
      )}
    </div>
  )
}
