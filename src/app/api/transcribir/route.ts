// app/api/transcribir/route.ts — Route Handler
//
// Recibe el transcript de texto (ya transcripto por la Web Speech API del browser),
// lo envía a Claude para extraer datos estructurados del proyecto.
//
// Por qué separar transcripción (browser) de extracción de datos (Claude):
// - Claude API no acepta audio binario
// - La Web Speech API del browser es gratuita y funciona en tiempo real
// - Claude es excelente para entender lenguaje natural ambiguo y producir JSON limpio

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServer } from '@/lib/supabase'

const SYSTEM_PROMPT_VOZ = `
Eres un asistente experto en inversión inmobiliaria en Quito, Ecuador.
El usuario dictó una nota de voz en una feria de vivienda. Se te entrega la transcripción.

Devuelve ÚNICAMENTE un JSON válido sin markdown con estos campos:
{
  "nombre": "", "constructora": "", "direccion": "", "sector": "",
  "tipo": "", "area_interna_m2": 0, "dormitorios": 1, "piso": null,
  "tiene_parqueadero": false, "costo_parqueadero": 0, "tiene_bodega": false,
  "precio_base": 0, "reserva": 0, "entrada": 0,
  "banco": "", "tasa_anual": 0, "anos_credito": 0,
  "precio_noche_estimado": 0, "ocupacion_estimada": 70,
  "fecha_entrega": "", "meses_espera": 0, "plusvalia_anual": 5,
  "amenidades": [], "forma_pago": "", "notas": "",
  "unidades_disponibles": null,
  "preferencia": null,
  "datos_faltantes": [],
  "que_preguntar": ["...", "..."],
  "alerta": ""
}

Sectores válidos: Quicentro | González Suárez | La Coruña | Quito Tenis |
Granda Centeno | Bellavista | Iñaquito | El Batán | La Floresta | Guangüiltagua | Otro

Tipos válidos: estudio | minisuite | suite | 1 dormitorio | 2 dormitorios

Si un dato no se menciona, usa null (números) o "" (texto). No inventes datos.
`

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  let transcript: string
  try {
    const body = await request.json()
    if (!body.transcript?.trim()) return Response.json({ error: 'No se recibió texto' }, { status: 400 })
    transcript = body.transcript
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT_VOZ,
      messages: [
        {
          role: 'user',
          content: `Transcripción de nota de voz:\n\n${transcript}`,
        },
      ],
    })

    const textoRespuesta = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonLimpio = textoRespuesta
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const datos = JSON.parse(jsonLimpio)

    return Response.json({
      nombre: datos.nombre || '',
      sector: datos.sector || '',
      tipo: datos.tipo || '',
      precio_base: datos.precio_base || undefined,
      area_interna_m2: datos.area_interna_m2 || undefined,
      meses_espera: datos.meses_espera || undefined,
      unidades_disponibles: datos.unidades_disponibles ?? null,
      preferencia: datos.preferencia ?? null,
      camposInciertos: [],
    })
  } catch {
    return Response.json({ error: 'Error al procesar con IA. Intenta de nuevo.' }, { status: 500 })
  }
}
