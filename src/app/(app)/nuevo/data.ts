// Constantes compartidas entre FormularioRapido (Client) y actions.ts (Server)
// Este archivo NO tiene 'use server' ni 'use client' — se puede importar desde ambos lados

export const SECTORES = [
  'Quicentro', 'González Suárez', 'La Coruña', 'Benalcázar', 'Quito Tenis',
  'Granda Centeno', 'Bellavista', 'Iñaquito', 'El Batán', 'La Pradera',
  'La Floresta', 'Guangüiltagua', 'Otro',
] as const

export const TIPOS = ['estudio', 'minisuite', 'suite', '1 dormitorio', '2 dormitorios'] as const
export const PREFERENCIAS = ['primera_opcion', 'alternativa'] as const
