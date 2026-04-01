import { describe, it, expect } from 'vitest'
import { calcularMetricas } from '../calculos'
import type { InputCalculos } from '../../types/proyecto'

// Datos base reutilizables — representan un proyecto típico de Quito
const CONFIG_DEFAULTS = {
  reserva_default: 2000,
  porcentaje_entrada_default: 10,
  porcentaje_durante_construccion_default: 20,
  num_cuotas_construccion_default: 30,
  porcentaje_contra_entrega_default: 70,
  sueldo_neto: 1400,
  porcentaje_ahorro: 40,
  porcentaje_gastos_airbnb: 30,
  costo_amoblado_default: 6000,
  anos_proyeccion: 5,
}

const BASE: InputCalculos = {
  precio_base: 80000,
  area_interna_m2: 40,
  area_balcon_m2: 5,
  costo_parqueadero: 10000,
  reserva: null,
  porcentaje_entrada: null,
  porcentaje_durante_construccion: null,
  num_cuotas_construccion: null,
  porcentaje_contra_entrega: null,
  tasa_anual: 6,
  anos_credito: 6,
  viene_amoblado: false,
  costo_amoblado: null,
  amoblado_financiado: false,
  tasa_prestamo_amoblado: 12,
  meses_prestamo_amoblado: 24,
  tiene_administracion_airbnb_incluida: false,
  porcentaje_gestion_airbnb: null,
  alicuota_mensual: 80,
  precio_noche_estimado: 55,
  ocupacion_estimada: 70,
  meses_espera: 18,
  plusvalia_anual: 5,
  ...CONFIG_DEFAULTS,
}

describe('calculos.ts', () => {
  it('precio_m2 usa area_interna_m2, nunca area_total_m2', () => {
    const r = calcularMetricas(BASE)
    // precio_m2 = precio_base / area_interna = 80000 / 40 = 2000
    // NO debe dividir entre 45 (área total con balcón)
    expect(r.precio_m2).toBeCloseTo(2000)
    expect(r.area_total_m2).toBe(45)  // el campo sí se calcula, pero no influye en precio_m2
  })

  it('reserva=null → reserva_efectiva = reserva_default ($2,000)', () => {
    const r = calcularMetricas({ ...BASE, reserva: null })
    expect(r.reserva_efectiva).toBe(2000)
  })

  it('reserva=0 → pago_entrada_neto = monto_entrada_total (sin descuento de reserva)', () => {
    const r = calcularMetricas({ ...BASE, reserva: 0 })
    expect(r.reserva_efectiva).toBe(0)
    // monto_entrada_total = precio_total * 10% = 90000 * 10% = 9000
    expect(r.pago_entrada_neto).toBeCloseTo(r.monto_entrada_total)
  })

  it('tasa_anual=0 → cuota_mensual = monto_financiar / (anos_credito × 12)', () => {
    const r = calcularMetricas({ ...BASE, tasa_anual: 0, anos_credito: 5 })
    // monto_financiar = 90000 * 70% = 63000
    // cuota = 63000 / (5 * 12) = 63000 / 60 = 1050
    expect(r.cuota_mensual).toBeCloseTo(1050)
    expect(r.total_intereses).toBe(0)
  })

  it('pct_durante=0 → cuota_construccion = 0', () => {
    const r = calcularMetricas({ ...BASE, porcentaje_durante_construccion: 0 })
    expect(r.cuota_construccion).toBe(0)
    expect(r.monto_durante_total).toBe(0)
  })

  it('pct_entrada + pct_durante + pct_contra = 100 con valores default', () => {
    const r = calcularMetricas(BASE)
    expect(r.pct_entrada + r.pct_durante + r.pct_contra).toBe(100)
  })

  it('viene_amoblado=true → costo_amoblado_efectivo = 0', () => {
    const r = calcularMetricas({ ...BASE, viene_amoblado: true })
    expect(r.costo_amoblado_efectivo).toBe(0)
  })

  it('amoblado_financiado=false → cuota_prestamo_amoblado = 0, intereses = 0', () => {
    const r = calcularMetricas({ ...BASE, amoblado_financiado: false })
    expect(r.cuota_prestamo_amoblado).toBe(0)
    expect(r.intereses_prestamo_amoblado).toBe(0)
  })

  it('amoblado_financiado=true → genera cuota mensual e intereses que reducen ganancia_neta', () => {
    const sinPrestamo = calcularMetricas({ ...BASE, amoblado_financiado: false })
    const conPrestamo = calcularMetricas({
      ...BASE,
      amoblado_financiado: true,
      tasa_prestamo_amoblado: 12,
      meses_prestamo_amoblado: 24,
    })
    // Debe haber cuota mensual positiva
    expect(conPrestamo.cuota_prestamo_amoblado).toBeGreaterThan(0)
    // Los intereses son positivos
    expect(conPrestamo.intereses_prestamo_amoblado).toBeGreaterThan(0)
    // La ganancia neta es menor con el préstamo
    expect(conPrestamo.ganancia_neta).toBeLessThan(sinPrestamo.ganancia_neta)
    // El flujo mensual es menor (descuenta la cuota del préstamo)
    expect(conPrestamo.flujo_con_airbnb).toBeLessThan(sinPrestamo.flujo_con_airbnb)
    // La diferencia en flujo es exactamente la cuota del préstamo
    expect(sinPrestamo.flujo_con_airbnb - conPrestamo.flujo_con_airbnb)
      .toBeCloseTo(conPrestamo.cuota_prestamo_amoblado)
  })

  it('amoblado_financiado=true + viene_amoblado=true → sin préstamo (viene amoblado, no hay costo)', () => {
    const r = calcularMetricas({
      ...BASE,
      viene_amoblado: true,
      amoblado_financiado: true,
      tasa_prestamo_amoblado: 12,
      meses_prestamo_amoblado: 24,
    })
    expect(r.cuota_prestamo_amoblado).toBe(0)
    expect(r.intereses_prestamo_amoblado).toBe(0)
  })

  it('aporte_propio_total no cuenta la reserva dos veces', () => {
    const r = calcularMetricas(BASE)
    // aporte_propio = monto_entrada_total + monto_durante_total + costo_amoblado_efectivo
    // La reserva ya está DENTRO de monto_entrada_total.
    // El doble conteo sería: reserva + monto_entrada_total (suma la reserva dos veces).
    const esperado = r.monto_entrada_total + r.monto_durante_total + r.costo_amoblado_efectivo
    expect(r.aporte_propio_total).toBeCloseTo(esperado)
    // El total no debe incluir la reserva encima de monto_entrada_total
    const conDobleConteo = r.reserva_efectiva + r.monto_entrada_total + r.monto_durante_total + r.costo_amoblado_efectivo
    expect(r.aporte_propio_total).not.toBeCloseTo(conDobleConteo)
  })
})
