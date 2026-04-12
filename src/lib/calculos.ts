// lib/calculos.ts — Fórmulas financieras en TypeScript puro
//
// PRINCIPIO: Esta función no toca la DB ni APIs.
// Recibe los datos del proyecto + defaults de configuracion → devuelve métricas calculadas.
// Los valores null en el proyecto se resuelven con los defaults antes de calcular.

import type { InputCalculos, MetricasCalculadas } from '@/types/proyecto'

export function calcularMetricas(p: InputCalculos): MetricasCalculadas {
  // ── 0. Descuento sobre precio base ──────────────────────────────────────────
  // Se aplica ANTES de todo cálculo. El precio_base original se preserva en DB.
  const precio_base_efectivo = p.descuento_valor > 0
    ? (p.descuento_tipo === 'porcentaje'
        ? p.precio_base * (1 - p.descuento_valor / 100)
        : p.precio_base - p.descuento_valor)
    : p.precio_base

  // ── 1. Precio y área ─────────────────────────────────────────────────────────
  const area_total_m2 = p.area_interna_m2 + p.area_balcon_m2
  const precio_total = precio_base_efectivo + p.costo_parqueadero
  // precio_m2 se calcula sobre área INTERNA (nunca incluye balcón)
  const precio_m2 = precio_base_efectivo / p.area_interna_m2

  // ── 1a. Estructura de pago (con fallback a defaults de configuracion) ─────────
  const reserva_efectiva = p.reserva ?? p.reserva_default
  const pct_entrada = p.porcentaje_entrada ?? p.porcentaje_entrada_default
  const pct_durante = p.porcentaje_durante_construccion ?? p.porcentaje_durante_construccion_default
  const pct_contra = p.porcentaje_contra_entrega ?? p.porcentaje_contra_entrega_default
  const num_cuotas = p.num_cuotas_construccion ?? p.num_cuotas_construccion_default

  const monto_entrada_total = precio_total * pct_entrada / 100
  const monto_durante_total = precio_total * pct_durante / 100
  const monto_financiar = precio_total * pct_contra / 100
  // La reserva ya se abonará a la entrada → el día de la firma se paga solo la diferencia
  const pago_entrada_neto = monto_entrada_total - reserva_efectiva
  const cuota_construccion = num_cuotas > 0 ? monto_durante_total / num_cuotas : 0

  // ── 1b. Amoblamiento ─────────────────────────────────────────────────────────
  const costo_amoblado_efectivo = p.viene_amoblado
    ? 0
    : (p.costo_amoblado ?? p.costo_amoblado_default)

  // ── 1c. Préstamo de amoblado ──────────────────────────────────────────────────
  // Si el amoblado no se puede pagar en efectivo al momento de la entrega,
  // se modela como un préstamo personal: agrega cuota al flujo mensual e
  // intereses al costo total (reducen ganancia_neta y ROI).
  // Si viene_amoblado=true, no hay costo de amoblado → no hay préstamo.
  let cuota_prestamo_amoblado = 0
  let intereses_prestamo_amoblado = 0

  if (p.amoblado_financiado && !p.viene_amoblado && costo_amoblado_efectivo > 0
      && p.meses_prestamo_amoblado > 0) {
    const tasa_m = p.tasa_prestamo_amoblado / 100 / 12
    if (tasa_m > 0) {
      // PMT estándar para el préstamo personal
      cuota_prestamo_amoblado = costo_amoblado_efectivo * tasa_m
        / (1 - Math.pow(1 + tasa_m, -p.meses_prestamo_amoblado))
    } else {
      // Sin intereses: pago parejo
      cuota_prestamo_amoblado = costo_amoblado_efectivo / p.meses_prestamo_amoblado
    }
    intereses_prestamo_amoblado = (cuota_prestamo_amoblado * p.meses_prestamo_amoblado)
      - costo_amoblado_efectivo
  }

  // ── 2. Cuota mensual bancaria (fórmula PMT estándar) ─────────────────────────
  // Caso especial: tasa_anual = 0 → financiamiento directo sin intereses
  // En ese caso cuota = monto_financiar / total_meses (división simple)
  const meses_credito = p.anos_credito * 12
  let cuota_mensual: number
  let total_pagado_credito: number
  let total_intereses: number

  if (p.tasa_anual === 0 || meses_credito === 0) {
    cuota_mensual = meses_credito > 0 ? monto_financiar / meses_credito : 0
    total_pagado_credito = monto_financiar
    total_intereses = 0
  } else {
    const tasa_mensual = p.tasa_anual / 100 / 12
    // PMT: pago mensual de una anualidad ordinaria
    cuota_mensual = monto_financiar * tasa_mensual / (1 - Math.pow(1 + tasa_mensual, -meses_credito))
    total_pagado_credito = cuota_mensual * meses_credito
    total_intereses = total_pagado_credito - monto_financiar
  }

  // ── 2b. Seguro hipotecario ─────────────────────────────────────────────────
  // Costo fijo mensual exigido por el banco para el crédito hipotecario.
  // Si el proyecto no tiene valor propio, usa el default de configuración.
  const seguro_mensual_efectivo = p.seguro_mensual ?? p.seguro_mensual_default

  // ── 3. Ingresos Airbnb ───────────────────────────────────────────────────────
  // Si el edificio gestiona el Airbnb, su % reemplaza al % global de gastos
  const pct_gastos_efectivo = p.tiene_administracion_airbnb_incluida
    ? (p.porcentaje_gestion_airbnb ?? p.porcentaje_gastos_airbnb)
    : p.porcentaje_gastos_airbnb

  const ingreso_bruto_mensual = p.precio_noche_estimado * 30 * (p.ocupacion_estimada / 100)
  const gastos_operativos = ingreso_bruto_mensual * (pct_gastos_efectivo / 100)
  const ingreso_neto_mensual = ingreso_bruto_mensual - gastos_operativos

  // ── 4. Flujo mensual ─────────────────────────────────────────────────────────
  // La alícuota y el seguro salen del flujo siempre (no importa si hay Airbnb o no).
  // La cuota del préstamo de amoblado también sale si aplica.
  const sueldo_disponible = p.sueldo_neto * (p.porcentaje_ahorro / 100)
  const flujo_sin_airbnb = sueldo_disponible - cuota_mensual - p.alicuota_mensual - seguro_mensual_efectivo - cuota_prestamo_amoblado
  const flujo_con_airbnb = sueldo_disponible + ingreso_neto_mensual - cuota_mensual - p.alicuota_mensual - seguro_mensual_efectivo - cuota_prestamo_amoblado

  // Cobertura: cuánto representa el ingreso disponible vs la obligación mensual total
  // Incluye cuota banco + alícuota + seguro + cuota préstamo amoblado (si aplica)
  const obligacion_mensual = cuota_mensual + p.alicuota_mensual + seguro_mensual_efectivo + cuota_prestamo_amoblado
  const cobertura_sin_airbnb = obligacion_mensual > 0
    ? (sueldo_disponible / obligacion_mensual) * 100
    : 100
  const cobertura_con_airbnb = obligacion_mensual > 0
    ? ((sueldo_disponible + ingreso_neto_mensual) / obligacion_mensual) * 100
    : 100

  // ── 5. Proyección a N años ────────────────────────────────────────────────────
  const meses_productivos = (p.anos_proyeccion * 12) - p.meses_espera
  const airbnb_acumulado = ingreso_neto_mensual * Math.max(0, meses_productivos)
  // Plusvalía compuesta sobre precio_base (no incluye parqueadero ni amoblado)
  // Plusvalía compuesta sobre precio_base_efectivo (precio real de compra con descuento)
  const plusvalia_acumulada = precio_base_efectivo * (Math.pow(1 + p.plusvalia_anual / 100, p.anos_proyeccion) - 1)
  const ganancia_bruta = plusvalia_acumulada + airbnb_acumulado
  // Los intereses del préstamo de amoblado son un costo real que reduce la ganancia
  const ganancia_neta = ganancia_bruta - total_intereses - intereses_prestamo_amoblado

  // ── 6. ROI ────────────────────────────────────────────────────────────────────
  // aporte_propio_total = todo el dinero del bolsillo del comprador antes de operar
  // monto_entrada_total ya incluye la reserva (la reserva se abona a la entrada)
  // → NO hay doble conteo: reserva + pago_entrada_neto = monto_entrada_total
  const aporte_propio_total = monto_entrada_total + monto_durante_total + costo_amoblado_efectivo
  const roi_anual = precio_total > 0
    ? ((ganancia_neta / precio_total) / p.anos_proyeccion) * 100
    : 0
  const roi_aporte_propio = aporte_propio_total > 0
    ? (ganancia_neta / aporte_propio_total) * 100
    : 0

  return {
    precio_base_efectivo,
    area_total_m2,
    precio_total,
    precio_m2,
    reserva_efectiva,
    pct_entrada,
    pct_durante,
    pct_contra,
    num_cuotas,
    monto_entrada_total,
    monto_durante_total,
    monto_financiar,
    pago_entrada_neto,
    cuota_construccion,
    costo_amoblado_efectivo,
    seguro_mensual_efectivo,
    cuota_prestamo_amoblado,
    intereses_prestamo_amoblado,
    cuota_mensual,
    total_pagado_credito,
    total_intereses,
    ingreso_bruto_mensual,
    gastos_operativos,
    ingreso_neto_mensual,
    sueldo_disponible,
    flujo_sin_airbnb,
    flujo_con_airbnb,
    cobertura_sin_airbnb,
    cobertura_con_airbnb,
    meses_productivos,
    airbnb_acumulado,
    plusvalia_acumulada,
    ganancia_bruta,
    ganancia_neta,
    aporte_propio_total,
    roi_anual,
    roi_aporte_propio,
  }
}
