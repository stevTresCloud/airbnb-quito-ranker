// Layout del grupo de rutas protegidas: (app)
//
// Este layout es un Server Component (sin 'use client').
// Server Components pueden hacer fetch de datos, leer cookies y acceder a variables de entorno
// de servidor directamente — sin APIs extra. Se renderizan solo en el servidor.
//
// Aquí verificamos la sesión como segunda línea de defensa:
// - Primera línea: proxy.ts redirige si no hay sesión (ocurre antes de renderizar)
// - Segunda línea: este layout verifica la sesión antes de renderizar contenido sensible
//
// Si alguien bypasea el proxy (poco probable, pero posible en edge cases),
// este check garantiza que no se muestre nada sin sesión válida.

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'
import { logoutAction } from '@/app/(auth)/login/actions'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  // Segunda línea de defensa: si no hay sesión, redirigir
  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* Barra de navegación superior */}
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-zinc-100 text-sm">
            Airbnb Quito Ranker
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 hidden sm:block">
              {user.email}
            </span>
            {/* Botón de logout: llama al Server Action logoutAction */}
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors
                           border border-zinc-700 rounded px-2 py-1"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Contenido de la página */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>

    </div>
  )
}
