// PrivacyContext — estado global de modo privacidad
//
// Cuando privacyMode = true, todos los componentes <MontoPrivado> muestran "••••"
// en lugar del valor real. Útil cuando usas la app en público (ferias, reuniones).
//
// Se guarda en localStorage para persistir entre recargas.
// localStorage es seguro aquí porque solo almacena un booleano (no datos sensibles).
//
// Patrón: Context + Provider + hook personalizado (usePrivacy).
// El Provider se monta en AppProviders.tsx, que está en el layout raíz de (app).

'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type PrivacyContextType = {
  privacyMode: boolean
  togglePrivacy: () => void
}

const PrivacyContext = createContext<PrivacyContextType>({
  privacyMode: false,
  togglePrivacy: () => {},
})

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [privacyMode, setPrivacyMode] = useState(false)

  // Al montar, leer el estado guardado en localStorage
  useEffect(() => {
    const saved = localStorage.getItem('privacy_mode')
    if (saved === 'true') setPrivacyMode(true)
  }, [])

  function togglePrivacy() {
    setPrivacyMode(prev => {
      const next = !prev
      localStorage.setItem('privacy_mode', String(next))
      return next
    })
  }

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  )
}

// Hook para consumir el contexto en cualquier Client Component
export function usePrivacy() {
  return useContext(PrivacyContext)
}
