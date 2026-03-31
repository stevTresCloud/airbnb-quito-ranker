import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Solo tests de lib/ — TypeScript puro, sin DOM, sin React
    // Si algún día necesitamos tests de UI, agregaremos environment: 'jsdom' en otro config
    environment: 'node',
    include: ['src/lib/__tests__/**/*.test.ts'],
  },
})
