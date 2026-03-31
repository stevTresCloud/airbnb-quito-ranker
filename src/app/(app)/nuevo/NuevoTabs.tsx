'use client'
// NuevoTabs.tsx — Tabs de ingreso: Foto | Voz | Manual
//
// Por qué Client Component:
// - El estado del tab activo (useState) vive en el cliente
// - GrabadorVoz y CamaraCaptura usan APIs de browser (MediaRecorder, <input capture>)
// - Al recibir datos de voz/foto, pre-llenamos el FormularioRapido sin recargar la página

import { useState } from 'react'
import FormularioRapido from './FormularioRapido'
import type { DatosPrellenados } from './FormularioRapido'
import GrabadorVoz from '@/components/GrabadorVoz'
import CamaraCaptura from '@/components/CamaraCaptura'
import type { SectorOption } from '@/types/proyecto'

type Tab = 'foto' | 'voz' | 'manual'

interface Props {
  sectores: SectorOption[]
}

export default function NuevoTabs({ sectores }: Props) {
  const [tabActivo, setTabActivo] = useState<Tab>('manual')
  const [datosPrellenados, setDatosPrellenados] = useState<DatosPrellenados>({})
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  // Cuando voz o foto retornan datos, pre-llenamos el formulario manual
  function handleDatosExtraidos(datos: DatosPrellenados) {
    setDatosPrellenados(datos)
    setMostrarFormulario(true)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'foto', label: '📷 Foto' },
    { id: 'voz', label: '🎤 Voz' },
    { id: 'manual', label: '✏️ Manual' },
  ]

  return (
    <div className="space-y-4">
      {/* Selector de tabs */}
      <div className="flex rounded-lg bg-zinc-800 p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setTabActivo(tab.id)
              // Al cambiar de tab, resetear el formulario pre-llenado
              if (tab.id === 'manual') {
                setDatosPrellenados({})
                setMostrarFormulario(true)
              } else {
                setMostrarFormulario(false)
              }
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors
              ${tabActivo === tab.id
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido del tab activo */}
      {tabActivo === 'foto' && (
        <div className="space-y-4">
          <CamaraCaptura onDatosExtraidos={handleDatosExtraidos} />
          {mostrarFormulario && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-3">
                Revisa los datos extraídos y guarda:
              </h3>
              <FormularioRapido datosIniciales={datosPrellenados} sectores={sectores} />
            </div>
          )}
        </div>
      )}

      {tabActivo === 'voz' && (
        <div className="space-y-4">
          <GrabadorVoz onDatosExtraidos={handleDatosExtraidos} />
          {mostrarFormulario && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-3">
                Revisa los datos extraídos y guarda:
              </h3>
              <FormularioRapido datosIniciales={datosPrellenados} sectores={sectores} />
            </div>
          )}
        </div>
      )}

      {tabActivo === 'manual' && (
        <FormularioRapido datosIniciales={{}} sectores={sectores} />
      )}
    </div>
  )
}
