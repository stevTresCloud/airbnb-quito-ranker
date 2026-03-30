// proxy.ts — Protección de rutas a nivel de servidor (antes de renderizar)
//
// NOTA NEXT.JS 16: "middleware.ts" fue renombrado a "proxy.ts".
// La función exportada también se llama "proxy" en lugar de "middleware".
//
// Cómo funciona:
// 1. El proxy corre antes de cada request (incluso antes de renderizar la página)
// 2. Lee el token de sesión de Supabase desde las cookies
// 3. Si no hay sesión → redirige a /login
// 4. Si ya está logueado y va a /login → redirige al dashboard
// 5. También refresca el token si está próximo a vencer (Supabase lo maneja en setAll)

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Creamos una respuesta base que podemos modificar si Supabase necesita refrescar cookies
  let supabaseResponse = NextResponse.next({ request })

  // Crear cliente de Supabase que puede leer Y escribir cookies desde el proxy
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Cuando Supabase refresca el token, lo escribe en la respuesta
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() verifica el token con el servidor de Supabase (más seguro que getSession())
  // En proxy esto es aceptable — ocurre una vez por request, no por render
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isLoginPage = path.startsWith('/login')

  // Sin sesión y no está en /login → redirigir a login
  if (!user && !isLoginPage) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Ya autenticado y va a /login → redirigir al dashboard
  if (user && isLoginPage) {
    const dashboardUrl = new URL('/', request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

// El matcher excluye archivos estáticos de Next.js para no correr el proxy en cada imagen/fuente
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
