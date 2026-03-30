// Layout del grupo de rutas de autenticación: (auth)
//
// Los paréntesis en "(auth)" son una convención de Next.js App Router llamada "route group".
// El nombre entre paréntesis NO aparece en la URL — /login, no /(auth)/login.
// Sirve para agrupar archivos y aplicar layouts distintos sin afectar las URLs.
//
// Este layout es mínimo: solo pasa {children} sin estructura adicional.
// El fondo oscuro y el diseño están en la propia página de login.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
