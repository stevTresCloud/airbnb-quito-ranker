import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Límite ampliado para subida de archivos (PDFs, fotos, renders)
      // 20 MB por archivo × hasta 3 archivos simultáneos + overhead de form = 50 MB
      bodySizeLimit: '50mb',
    },
  },
  async headers() {
    return [
      {
        // Aplica a todas las rutas
        source: '/(.*)',
        headers: [
          // ── Anti-clickjacking ──────────────────────────────────────────────
          // Impide que la app sea embebida en un <iframe> de otro dominio.
          // CSP frame-ancestors es el sucesor, pero X-Frame-Options cubre navegadores viejos.
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },

          // ── Anti-MIME sniffing ─────────────────────────────────────────────
          // Impide que el browser "adivine" el tipo de archivo si el servidor no lo declara.
          // Sin esto, un PDF malicioso podría ejecutarse como script.
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },

          // ── HSTS (HTTP Strict Transport Security) ─────────────────────────
          // Le dice al browser que SIEMPRE use HTTPS para este dominio.
          // max-age=31536000 = 1 año. includeSubDomains protege subdominios.
          // Solo tiene efecto en producción (sobre HTTPS).
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },

          // ── Referrer Policy ───────────────────────────────────────────────
          // Cuando el usuario hace clic en un link externo, el browser no envía
          // la URL completa como referrer — solo el origen (dominio).
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },

          // ── Permissions Policy ────────────────────────────────────────────
          // Desactiva APIs del browser que esta app no necesita.
          // Reduce la superficie de ataque si hay una inyección de código.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },

          // ── Content Security Policy ───────────────────────────────────────
          // Declara qué orígenes pueden cargar recursos (scripts, estilos, imágenes, etc.)
          // frame-ancestors 'none' es el equivalente moderno de X-Frame-Options: DENY
          // connect-src incluye Supabase (REST + WebSocket para Realtime)
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js necesita 'unsafe-inline' para hydration y 'unsafe-eval' en dev
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              // Supabase Storage para imágenes subidas por el usuario
              // OpenStreetMap tiles para el mapa (Fase 7)
              "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
              // next/font descarga las fuentes y las sirve desde el propio servidor (/self)
              "font-src 'self'",
              // Supabase API (HTTPS) + Realtime (WSS) + OpenStreetMap tiles
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              // Bloquea que la app sea embebida en iframes (más moderno que X-Frame-Options)
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
