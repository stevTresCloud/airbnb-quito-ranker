'use server'
// Server Action para autenticación
//
// "use server" al inicio del archivo marca TODAS las exports como Server Functions.
// Esto significa que el código corre en el servidor aunque sea llamado desde el cliente.
// El browser nunca ve el código de este archivo — solo el resultado de la función.
//
// Por qué está separado de page.tsx:
// En Next.js 16, los Client Components ('use client') no pueden DEFINIR Server Functions.
// Solo pueden importarlas desde archivos marcados con 'use server'.

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase'

// loginAction recibe el estado anterior (_prevState, requerido por useActionState)
// y el FormData del formulario.
// Devuelve un string con el error, o null si todo salió bien.
export async function loginAction(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return 'Email y contraseña son requeridos'
  }

  const supabase = await createSupabaseServer()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Mensaje amigable en español (Supabase devuelve mensajes en inglés)
    if (error.message.includes('Invalid login credentials')) {
      return 'Email o contraseña incorrectos'
    }
    return error.message
  }

  // redirect() lanza una excepción interna de Next.js — el código después no se ejecuta.
  // No devuelve nada porque la respuesta es la redirección.
  redirect('/')
}

// logoutAction — se llama desde el botón de cerrar sesión en el layout protegido
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  redirect('/login')
}
