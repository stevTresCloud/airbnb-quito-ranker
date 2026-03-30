'use client'
// Pantalla de login — Client Component
//
// Por qué 'use client':
// useActionState es un hook de React — los hooks solo funcionan en Client Components.
// El formulario en sí se renderiza en el servidor (SSR), pero la interactividad
// (estado del pending, mostrar error) requiere JavaScript en el browser.
//
// useActionState(action, initialState) devuelve [state, actionDispatcher, isPending]:
// - state: el valor que devolvió la última ejecución de loginAction (null o string de error)
// - actionDispatcher: función que pasamos al <form action={...}>
// - isPending: true mientras el servidor está procesando la acción

import { useActionState } from 'react'
import { loginAction } from './actions'

export default function LoginPage() {
  const [error, action, pending] = useActionState(loginAction, null)

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            Airbnb Quito Ranker
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Acceso privado
          </p>
        </div>

        {/* Formulario */}
        <form action={action} className="space-y-4">

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5
                         text-zinc-100 placeholder-zinc-600 text-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                         disabled:opacity-50"
              placeholder="tu@email.com"
              disabled={pending}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-400 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5
                         text-zinc-100 placeholder-zinc-600 text-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                         disabled:opacity-50"
              placeholder="••••••••"
              disabled={pending}
            />
          </div>

          {/* Mensaje de error (viene del Server Action) */}
          {error && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600
                       text-white font-medium py-2.5 text-sm
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                       focus:ring-offset-zinc-950"
          >
            {pending ? 'Ingresando...' : 'Ingresar'}
          </button>

        </form>

      </div>
    </div>
  )
}
