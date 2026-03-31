// app/api/analizar-foto/route.ts — Route Handler
//
// Recibe una imagen en base64, la envía a Claude Vision y devuelve JSON con datos del proyecto.
// Mismo contrato de respuesta que /api/transcribir, más el campo confianza_baja[].

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServer } from '@/lib/supabase'

const SYSTEM_PROMPT_FOTO = `
Eres un asistente experto en inversión inmobiliaria en Quito, Ecuador.
El usuario tomó una foto de una cotización, brochure o tabla de precios.

Extrae toda la información visible y devuelve ÚNICAMENTE un JSON válido sin markdown
con exactamente estos campos:
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
  "alerta": "",
  "confianza_baja": []
}

confianza_baja debe listar los NOMBRES de los campos que no pudiste leer con claridad
(texto borroso, manuscrito ilegible, dato ambiguo).
Ejemplo: "confianza_baja": ["precio_base", "tasa_anual"]

Sectores válidos: Quicentro | González Suárez | La Coruña | Quito Tenis |
Granda Centeno | Bellavista | Iñaquito | El Batán | La Floresta | Guangüiltagua | Otro

Tipos válidos: estudio | minisuite | suite | 1 dormitorio | 2 dormitorios

Si un campo no aparece en la imagen, usa null (números) o "" (texto).
No inventes datos que no estén visibles.
`

export async function POST(request: NextRequest) {
  // Verificar sesión
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  let imagen: string
  let mediaType: string

  try {
    const body = await request.json()
    if (!body.imagen) return Response.json({ error: 'No se recibió imagen' }, { status: 400 })
    imagen = body.imagen
    mediaType = body.mediaType || 'image/jpeg'
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT_FOTO,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imagen,
              },
            },
            {
              type: 'text',
              text: 'Extrae los datos de esta imagen de cotización inmobiliaria.',
            },
          ],
        },
      ],
    })

    const textoRespuesta = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonLimpio = textoRespuesta
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const datos = JSON.parse(jsonLimpio)

    // Mapeamos al formato de DatosPrellenados + camposInciertos
    return Response.json({
      nombre: datos.nombre || '',
      sector: datos.sector || '',
      tipo: datos.tipo || '',
      precio_base: datos.precio_base || undefined,
      area_interna_m2: datos.area_interna_m2 || undefined,
      meses_espera: datos.meses_espera || undefined,
      unidades_disponibles: datos.unidades_disponibles ?? null,
      preferencia: datos.preferencia ?? null,
      camposInciertos: datos.confianza_baja ?? [],
    })
  } catch {
    return Response.json({ error: 'Error al analizar la imagen. Intenta de nuevo.' }, { status: 500 })
  }
}
