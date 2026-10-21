import { defineConfig } from 'vitest/config';

// Suite das regras do Firestore/Storage e dos adaptadores Firebase (F2). Roda dentro de `firebase emulators:exec` (npm run test:rules).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/rules/**/*.test.ts', 'tests/firebase/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000
  }
});
