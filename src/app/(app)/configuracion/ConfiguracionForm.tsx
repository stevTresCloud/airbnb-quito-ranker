'use client'
// ConfiguracionForm — Client Component
//
// Por qué 'use client':
// useActionState es un hook de React — los hooks solo funcionan en Client Components.
// El Server Component (page.tsx) obtiene los datos de Supabase y se los pasa
// a este componente como props. El formulario en sí se renderiza desde el servidor
// (SSR), pero la interactividad (feedback de guardado, estado pending) necesita
// JavaScript en el browser.
//
// Patrón: Server Component carga datos → pasa como props → Client Component maneja UI.
// Esto mantiene el fetch de datos en el servidor (más rápido, más seguro) y
// la interactividad en el cliente solo donde se necesita.

import { useActionState } from 'react'
import Link from 'next/link'
import { guardarConfiguracion, recalcularRanking, type ConfiguracionRow, type ActionState } from './actions'
import { usePrivacy } from '@/contexts/PrivacyContext'

// ─── Campo numérico con soporte de privacidad ────────────────────────────────
//
// Cuando privacyMode=true:
//   - Se muestra un div visual con "••••" (no editable)
//   - Se mantiene un <input type="hidden"> con el valor real para que el form
//     siga pudiendo guardarse correctamente sin exponer el número en pantalla.
// Cuando privacyMode=false: input numérico normal, completamente editable.

function CampoNumerico({
  label,
  name,
  defaultValue,
  min,
  max,
  step = 'any',
  suffix,
  disabled,
  privacyMode,
}: {
  label: string
  name: string
  defaultValue: number
  min?: number
  max?: number
  step?: string
  suffix?: string
  disabled?: boolean
  privacyMode?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-zinc-400 mb-1">
        {label}
        {suffix && <span className="text-zinc-600 ml-1">({suffix})</span>}
      </label>

      {privacyMode ? (
        <>
          {/* Valor real oculto — el form lo enviará igual al servidor */}
          <input type="hidden" name={name} defaultValue={defaultValue} />
          {/* Máscara visual */}
          <div className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5
                          text-zinc-600 text-sm tracking-widest select-none cursor-default">
            ••••
          </div>
        </>
      ) : (
        <input
          id={name}
          name={name}
          type="number"
          defaultValue={defaultValue}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5
                     text-zinc-100 text-sm
                     focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                     disabled:opacity-50"
        />
      )}
    </div>
  )
}

// ─── Campo de texto con soporte de privacidad ─────────────────────────────────
// El banco no es un dato numérico, pero el nombre del banco también puede
// revelar información financiera sensible.

function CampoTexto({
  label,
  name,
  defaultValue,
  disabled,
  privacyMode,
}: {
  label: string
  name: string
  defaultValue: string
  disabled?: boolean
  privacyMode?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-zinc-400 mb-1">
        {label}
      </label>
      {privacyMode ? (
        <>
          <input type="hidden" name={name} defaultValue={defaultValue} />
          <div className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5
                          text-zinc-600 text-sm tracking-widest select-none cursor-default">
            ••••
          </div>
        </>
      ) : (
        <input
          id={name}
          name={name}
          type="text"
          defaultValue={defaultValue}
          disabled={disabled}
          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5
                     text-zinc-100 text-sm
                     focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent
                     disabled:opacity-50"
        />
      )}
    </div>
  )
}

// Componente reutilizable para secciones del formulario
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 pb-2 border-b border-zinc-800">
        {titulo}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children}
      </div>
    </section>
  )
}

export default function ConfiguracionForm({ config }: { config: ConfiguracionRow }) {
  const [estado, accion, pendiente] = useActionState<ActionState, FormData>(guardarConfiguracion, null)
  const [estadoRecalc, accionRecalc, pendienteRecalc] = useActionState<ActionState, FormData>(recalcularRanking, null)

  // Lee el modo privacidad global — mismo estado que oculta montos en el ranking.
  // Si privacyMode=true, los campos financieros muestran •••• en lugar del valor real.
  const { privacyMode } = usePrivacy()

  // Props comunes que reciben todos los campos
  const privacy = privacyMode

  return (
    <div className="space-y-8">

      {/* Encabezado con navegación a scoring */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Configuración Global</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Valores por defecto usados para calcular métricas de todos los proyectos
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/configuracion/sectores"
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors
                       border border-indigo-900 hover:border-indigo-700 rounded-lg px-3 py-2"
          >
            Sectores →
          </Link>
          <Link
            href="/configuracion/scoring"
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors
                       border border-emerald-900 hover:border-emerald-700 rounded-lg px-3 py-2"
          >
            Pesos del scoring →
          </Link>
          <Link
            href="/configuracion/seguridad"
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors
                       border border-amber-900 hover:border-amber-700 rounded-lg px-3 py-2"
          >
            Seguridad →
          </Link>
        </div>
      </div>

      {/* Formulario principal */}
      <form action={accion} className="space-y-8">

        <Seccion titulo="Perfil financiero">
          <CampoNumerico
            label="Sueldo neto mensual"
            name="sueldo_neto"
            defaultValue={config.sueldo_neto}
            min={0}
            step="0.01"
            suffix="USD"
            disabled={pendiente}
            privacyMode={privacy}
          />
          <CampoNumerico
            label="% sueldo disponible para cuota"
            name="porcentaje_ahorro"
            defaultValue={config.porcentaje_ahorro}
            min={0}
            max={100}
            step="0.1"
            suffix="%"
            disabled={pendiente}
            privacyMode={privacy}
          />
          <CampoNumerico
            label="% gastos operativos Airbnb"
            name="porcentaje_gastos_airbnb"
            defaultValue={config.porcentaje_gastos_airbnb}
            min={0}
            max={100}
            step="0.1"
            suffix="% del ingreso bruto"
            disabled={pendiente}
            privacyMode={privacy}
          />
        </Seccion>

        <Seccion titulo="Financiamiento por defecto">
          <CampoTexto
            label="Banco"
            name="banco_default"
            defaultValue={config.banco_default}
            disabled={pendiente}
            privacyMode={privacy}
          />
          <CampoNumerico
            label="Tasa de interés anual"
            name="tasa_default"
            defaultValue={config.tasa_default}
            min={0}
            max={100}
            step="0.1"
            suffix="% anual"
            disabled={pendiente}
            privacyMode={privacy}
          />
          <CampoNumerico
            label="Años del crédito"
            name="anos_credito_default"
            defaultValue={config.anos_credito_default}
            min={1}
            max={30}
            step="1"
            suffix="años"
            disabled={pendiente}
            privacyMode={privacy}
          />
          <CampoNumerico
            label="Años de proyección"
            name="anos_proyeccion"
            defaultValue={config.anos_proyeccion}
            min={1}
            max={20}
            step="1"
            suffix="años"
            disabled={pendiente}
            privacyMode={privacy}
          />
        </Seccion>

        <Seccion titulo="Costos por defecto">
          <CampoNumerico
            label="Costo de amoblado"
            name="costo_amoblado_default"
            defaultValue={config.costo_amoblado_default}
            min={0}
            step="100"
            suffix="USD"
            disabled={pendiente}
            privacyMode={privacy}
          />
          <CampoNumerico
            label="Seguro hipotecario mensual"
            name="seguro_mensual_default"
            defaultValue={config.seguro_mensual_default}
            min={0}
            step="1"
            suffix="USD/mes"
            disabled={pendiente}
            privacyMode={privacy}
          />
        </Seccion>

        {/* Estructura de pago — sección especial con validación de suma 100% */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-1 pb-2 border-b border-zinc-800">
            Estructura de pago por defecto
          </h2>
          <p className="text-xs text-zinc-600 mb-4">
            Entrada + Durante construcción + Contra entrega debe sumar exactamente 100%
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoNumerico
              label="Reserva (monto fijo)"
              name="reserva_default"
              defaultValue={config.reserva_default}
              min={0}
              step="100"
              suffix="USD"
              disabled={pendiente}
              privacyMode={privacy}
            />
            <CampoNumerico
              label="% Entrada"
              name="porcentaje_entrada_default"
              defaultValue={config.porcentaje_entrada_default}
              min={0}
              max={100}
              step="0.1"
              suffix="% del total"
              disabled={pendiente}
              privacyMode={privacy}
            />
            <CampoNumerico
              label="% Durante construcción"
              name="porcentaje_durante_construccion_default"
              defaultValue={config.porcentaje_durante_construccion_default}
              min={0}
              max={100}
              step="0.1"
              suffix="% del total"
              disabled={pendiente}
              privacyMode={privacy}
            />
            <CampoNumerico
              label="Cuotas durante construcción"
              name="num_cuotas_construccion_default"
              defaultValue={config.num_cuotas_construccion_default}
              min={0}
              step="1"
              suffix="cuotas mensuales"
              disabled={pendiente}
              privacyMode={privacy}
            />
            <CampoNumerico
              label="% Contra entrega (banco)"
              name="porcentaje_contra_entrega_default"
              defaultValue={config.porcentaje_contra_entrega_default}
              min={0}
              max={100}
              step="0.1"
              suffix="% del total"
              disabled={pendiente}
              privacyMode={privacy}
            />
          </div>
        </section>

        {/* Feedback del Server Action */}
        {estado?.ok === true && (
          <p className="text-sm text-emerald-400 bg-emerald-950/50 border border-emerald-900 rounded-lg px-3 py-2">
            Configuración guardada correctamente
          </p>
        )}
        {estado?.ok === false && (
          <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
            {estado.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg bg-emerald-700 hover:bg-emerald-600
                     text-white font-medium px-6 py-2.5 text-sm
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                     focus:ring-offset-zinc-950"
        >
          {pendiente ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </form>

      {/* Botón Recalcular — formulario separado con su propio Server Action */}
      {/* Por qué formulario separado: cada <form> tiene su propio useActionState.
          Si usáramos el mismo, no sabríamos qué acción disparó cada feedback. */}
      <div className="border-t border-zinc-800 pt-8">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-zinc-300">Recalcular todo el ranking</h3>
            <p className="text-xs text-zinc-600 mt-1">
              Recalcula métricas financieras y scores de todos los proyectos usando
              la configuración y pesos actuales. Usar tras cambiar configuración o pesos.
            </p>
          </div>
          <form action={accionRecalc}>
            <button
              type="submit"
              disabled={pendienteRecalc}
              className="rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700
                         text-zinc-200 font-medium px-4 py-2 text-sm whitespace-nowrap
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2
                         focus:ring-offset-zinc-950"
            >
              {pendienteRecalc ? 'Recalculando...' : 'Recalcular todo'}
            </button>
          </form>
        </div>
        {estadoRecalc?.ok === true && (
          <p className="text-sm text-emerald-400 bg-emerald-950/50 border border-emerald-900 rounded-lg px-3 py-2 mt-3">
            Ranking recalculado correctamente
          </p>
        )}
        {estadoRecalc?.ok === false && (
          <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mt-3">
            {estadoRecalc.error}
          </p>
        )}
      </div>

    </div>
  )
}
