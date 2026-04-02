// Layout del grupo de rutas protegidas: (app)
//
// Server Component — verifica sesión y monta la estructura principal.
//
// AppProviders: Client Component wrapper que provee el PrivacyContext global.
//   El layout es Server Component y no puede contener createContext directamente,
//   por eso delega en AppProviders que es 'use client'.
//
// Nav: sidebar en desktop + bottom bar en móvil.
// PrivacyButton: botón de ojo 👁 en el header móvil — importado de Nav.tsx.

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import { AppProviders } from '@/components/AppProviders'
import { Nav, PrivacyButton, RecalcularButton, ThemeButton, LogoutButton } from '@/components/Nav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    // AppProviders monta el PrivacyContext — disponible en todo (app)
    <AppProviders>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">

        {/* Sidebar (desktop) + Bottom bar (móvil) */}
        <Nav email={user.email ?? ''} />

        {/* Área de contenido */}
        <div className="flex-1 md:ml-56 flex flex-col min-h-screen">

          {/* Header móvil: solo visible en pantallas < md */}
          {/*
            El botón 👁 (PrivacyButton) está aquí para acceso rápido en móvil.
            En desktop está en el footer del sidebar.
          */}
          <header className="md:hidden flex items-center justify-between
                             px-4 py-3 border-b border-zinc-800 bg-zinc-900">
            <span className="font-semibold text-zinc-100 text-sm">
              Airbnb Quito Ranker
            </span>
            <div className="flex items-center gap-3">
              <RecalcularButton />
              <PrivacyButton />
              <ThemeButton />
              <LogoutButton />
            </div>
          </header>

          {/* Contenido de la página */}
          {/*
            pb-24: espacio inferior en móvil para no quedar tapado por el bottom bar.
            md:pb-8: en desktop vuelve al padding normal.
          */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 md:pb-8">
            {children}
          </main>

        </div>
      </div>
    </AppProviders>
  )
}
