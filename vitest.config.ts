import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Regras rodam contra o emulador do Firebase: npm run test:rules
    exclude: ['tests/rules/**', 'node_modules/**']
  }
});
