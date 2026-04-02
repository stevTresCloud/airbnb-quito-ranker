# Airbnb Quito Ranker

Comparador privado de proyectos inmobiliarios en Quito para inversión Airbnb.

---

## Fase 8 — Fixes Móvil (PENDIENTE — detectados 2026-04-01)

Bugs visuales encontrados en dispositivo real. Orden de implementación por impacto:

### Bug 6 — Botón "Salir" no existe en móvil ⚠️ CRÍTICO
- **Causa:** El logout está solo en el sidebar desktop (`Nav.tsx` ~línea 395). El bottom tab bar de móvil no tiene logout.
- **Fix:** Importar `logoutAction` y agregar botón ícono en el header móvil — `src/app/(app)/layout.tsx` línea 50–57. El ícono `IconLogout` ya está definido en `Nav.tsx` (línea 68).

### Bug 2 — Botón "Ver →" invisible en móvil ⚠️ CRÍTICO
- **Causa:** `opacity-0 group-hover:opacity-100` no funciona en pantallas táctiles — `RankingDashboard.tsx` línea 684.
- **Fix:** Cambiar a `md:opacity-0 md:group-hover:opacity-100` para que sea visible en móvil, oculto en desktop hasta hover. O mejor: estilizarlo como botón con fondo (bg-zinc-700 rounded px-2 py-1) siempre visible.

### Bug 1 — Ranking pantalla cortada / zoom forzado
- **Causa:** El header "Ranking + botones Lista|Mapa|Nueva" desborda el ancho en móvil — `RankingDashboard.tsx` línea 831–877.
- **Fix:** Usar `flex-wrap` o `flex-col sm:flex-row` en el contenedor del header. Los botones deben ir debajo del título en móvil.

### Bug 4 — Checkboxes de características/amenidades sin contraste visible
- **Causa:** `accent-zinc-300` (gris) sobre fondo oscuro. Con modo claro (CSS filter invert) queda invisible — `DetalleProyecto.tsx` líneas 890 y 1314.
- **Fix:** Cambiar `accent-zinc-300` → `accent-indigo-500` en `CheckboxField` y en el checkbox de amoblado_financiado.

### Bug 3 — Campo teléfono/WhatsApp se ve en 3 columnas en móvil
- **Causa:** El campo está en grid-cols-2 pero internamente tiene `flex` con input + BtnWhatsApp que desborda — `DetalleProyecto.tsx` ~línea 725–729.
- **Fix:** `flex-col sm:flex-row` dentro del campo, o mostrar BtnWhatsApp solo en vista Resumen (donde ya existe) y quitarlo del formulario de edición.

### Bug 5 — Lista de adjuntos muy extensa, propuesta cuadrícula
- **Causa:** `<ul className="space-y-2">` con ítems altos — `AdjuntosPanel.tsx` línea 197.
- **Fix:** Cambiar a `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2`. Hacer el AdjuntoItem más compacto (descripción con `line-clamp-1`, botones apilados o reducidos).

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
