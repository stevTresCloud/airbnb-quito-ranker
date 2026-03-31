// Nav — Client Component (necesita usePathname para resaltar el ítem activo)
//
// Renderiza DOS componentes de navegación:
//  • Sidebar fijo en desktop (md:flex) — siempre visible a la izquierda
//  • Bottom tab bar en móvil (md:hidden) — fijo en la parte inferior
//
// También incluye el botón de privacidad (👁) que oculta/muestra montos.
// Long-press de 1 segundo alterna el modo — útil en móvil sin hover.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useEffect } from 'react'
import { logoutAction } from '@/app/(auth)/login/actions'
import { usePrivacy } from '@/contexts/PrivacyContext'

// ─── Íconos SVG inline ───────────────────────────────────────────────────────

function IconRanking() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5"  y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
               a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
               A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
               l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
               A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
               l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
               a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
               l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
               a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function IconEye({ closed }: { closed: boolean }) {
  return closed ? (
    // Ojo cerrado (privacidad activa)
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1
               5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1
               -2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    // Ojo abierto (normal)
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// ─── Sub-ítems de Configuración ───────────────────────────────────────────────

const CONFIG_ITEMS = [
  { label: 'Config global', href: '/configuracion' },
  { label: 'Pesos scoring', href: '/configuracion/scoring' },
  { label: 'Sectores',      href: '/configuracion/sectores' },
  { label: 'Seguridad',     href: '/configuracion/seguridad' },
]

// ─── Hook para long-press (1 segundo) ────────────────────────────────────────
// Devuelve los event handlers a añadir al botón.
// En desktop: un click normal también alterna. En móvil: long-press o click.

function useLongPress(onLongPress: () => void, onClick: () => void, ms = 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressedRef = useRef(false)

  function start() {
    longPressedRef.current = false
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true
      onLongPress()
    }, ms)
  }

  function stop() {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  function handleClick() {
    if (!longPressedRef.current) onClick()
  }

  return {
    onMouseDown:  start,
    onMouseUp:    stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd:   (e: React.TouchEvent) => { stop(); e.preventDefault(); handleClick() },
    onClick:      handleClick,
  }
}

// ─── Botón de privacidad (reutilizable en sidebar y header móvil) ─────────────

function PrivacyButton({ className }: { className?: string }) {
  const { privacyMode, togglePrivacy } = usePrivacy()

  // Tanto click normal como long-press activan/desactivan
  const handlers = useLongPress(togglePrivacy, togglePrivacy)

  return (
    <button
      {...handlers}
      title={privacyMode ? 'Mostrar montos' : 'Ocultar montos'}
      className={`transition-colors select-none ${
        privacyMode
          ? 'text-amber-400 hover:text-amber-300'
          : 'text-zinc-500 hover:text-zinc-300'
      } ${className ?? ''}`}
    >
      <IconEye closed={privacyMode} />
    </button>
  )
}

// Exportamos para usar en el header móvil del layout
export { PrivacyButton }

// ─── Componente principal ─────────────────────────────────────────────────────

export function Nav({ email }: { email: string }) {
  const pathname = usePathname()
  const prevPathname = useRef(pathname)

  // Re-lock: cuando el usuario sale de /configuracion/* hacia otra sección,
  // borrar la cookie de desbloqueo para que la próxima visita pida PIN/biométrico.
  // El fetch es fire-and-forget — no bloqueamos la navegación.
  useEffect(() => {
    const wasInConfig = prevPathname.current.startsWith('/configuracion')
    const isInConfig  = pathname.startsWith('/configuracion')

    if (wasInConfig && !isInConfig) {
      fetch('/api/limpiar-config-lock', { method: 'DELETE' })
    }

    prevPathname.current = pathname
  }, [pathname])

  const isRankingActive = pathname === '/'
  const isNuevaActive   = pathname === '/nuevo'
  const isConfigActive  = pathname.startsWith('/configuracion')

  return (
    <>
      {/* ── SIDEBAR DESKTOP (md y superior) ────────────────────────────── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-56 flex-col
                        bg-zinc-900 border-r border-zinc-800 z-40">

        {/* Logo */}
        <div className="px-5 py-4 border-b border-zinc-800">
          <span className="font-semibold text-zinc-100 text-sm leading-tight">
            Airbnb Quito<br />
            <span className="text-zinc-400 font-normal">Ranker</span>
          </span>
        </div>

        {/* Links principales */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">

          {/* Ranking */}
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isRankingActive
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
            }`}
          >
            <IconRanking />
            Ranking
          </Link>

          {/* Nueva unidad */}
          <Link
            href="/nuevo"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isNuevaActive
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
            }`}
          >
            <IconPlus />
            Nueva unidad
          </Link>

          {/* Configuración — con sub-ítems siempre visibles */}
          <div className="pt-1">
            <div className={`flex items-center gap-3 px-3 py-2 text-sm ${
              isConfigActive ? 'text-zinc-300' : 'text-zinc-500'
            }`}>
              <IconSettings />
              <span>Configuración</span>
            </div>

            {/* Sub-ítems indentados */}
            <div className="ml-9 mt-0.5 space-y-0.5">
              {CONFIG_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-1.5 rounded-md text-xs transition-colors ${
                    pathname === item.href
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer — privacidad + email + logout */}
        <div className="p-4 border-t border-zinc-800 space-y-3">
          {/* Botón de privacidad con label */}
          <div className="flex items-center gap-2">
            <PrivacyButton />
            <span className="text-xs text-zinc-600">Modo privacidad</span>
          </div>

          <p className="text-xs text-zinc-500 truncate">{email}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100
                         transition-colors border border-zinc-700 hover:border-zinc-500
                         rounded-md px-3 py-1.5 w-full"
            >
              <IconLogout />
              Salir
            </button>
          </form>
        </div>
      </aside>

      {/* ── BOTTOM TAB BAR MÓVIL (solo en pantallas < md) ──────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40
                      bg-zinc-900 border-t border-zinc-800">
        <div className="flex items-stretch h-16">

          {/* Tab: Ranking */}
          <Link
            href="/"
            className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs
                        transition-colors ${
                          isRankingActive
                            ? 'text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
          >
            <IconRanking />
            <span>Ranking</span>
          </Link>

          {/* Tab central: Nueva (botón destacado) */}
          <Link
            href="/nuevo"
            className="flex-1 flex flex-col items-center justify-center gap-1"
          >
            <div className={`rounded-full p-2.5 transition-colors ${
              isNuevaActive
                ? 'bg-zinc-600 text-zinc-100'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}>
              <IconPlus />
            </div>
          </Link>

          {/* Tab: Configuración */}
          <Link
            href="/configuracion"
            className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs
                        transition-colors ${
                          isConfigActive
                            ? 'text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
          >
            <IconSettings />
            <span>Config</span>
          </Link>

        </div>
      </nav>
    </>
  )
}
