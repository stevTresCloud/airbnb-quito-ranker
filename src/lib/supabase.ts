// lib/supabase.ts — Clientes de Supabase para browser y servidor
//
// Supabase tiene dos modos de uso en Next.js:
// 1. Browser (Client Components): usa createBrowserClient — mantiene la sesión en cookies
// 2. Server (Server Components, Server Actions, proxy): usa createServerClient — lee cookies del servidor
//
// IMPORTANTE: SUPABASE_SERVICE_ROLE_KEY nunca se usa aquí.
// Solo se usa en Route Handlers que necesitan saltarse RLS (no aplica en Fase 1).

import { createBrowserClient } from '@supabase/ssr'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ── Cliente para Client Components ────────────────────────────────────────────
// Llama esta función dentro de un Client Component ('use client').
// Crea una instancia por render — @supabase/ssr la cachea internamente.
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── Cliente para Server Components y Server Actions ───────────────────────────
// Es async porque cookies() en Next.js 16 devuelve una Promise.
// El bloque try/catch en setAll existe porque Server Components no pueden
// escribir cookies — solo el proxy y los Server Actions pueden hacerlo.
// Si un Server Component intenta refrescar el token, el error se ignora;
// el proxy.ts (que corre antes) ya habrá refrescado el token.
export async function createSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // En Server Components esto falla silenciosamente — el proxy refresca el token
          }
        },
      },
    }
  )
}
