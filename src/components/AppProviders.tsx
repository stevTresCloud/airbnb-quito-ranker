// AppProviders — wrapper Client Component para contextos globales de la app
//
// El layout (app)/layout.tsx es un Server Component y no puede proveer contextos
// de React directamente. La solución es un Client Component "envoltorio" que
// solo sirve para montar los providers y pasar los children hacia adentro.
//
// Este patrón es el estándar en Next.js App Router para contextos globales.

'use client'

import { PrivacyProvider } from '@/contexts/PrivacyContext'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider>
      {children}
    </PrivacyProvider>
  )
}
