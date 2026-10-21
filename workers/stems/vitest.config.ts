import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

// FIRESTORE_EMULATOR_HOST so existe sob `npm run test:emu` (firebase emulators:exec).
// Sem emulador, os testes que dependem do Firestore sao marcados como skipped (nunca passam em falso).
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(here, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        remoteBindings: false,
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            FIREBASE_PROJECT_ID: 'demo-lagoinha-vs',
            FIRESTORE_BASE: emulatorHost ? `http://${emulatorHost}` : 'http://127.0.0.1:1',
            // Host ficticio: o teste intercepta a busca do JWKS (nunca existe no codigo de producao).
            JWKS_URL: 'https://jwks.test/securetoken.jwk',
            EMULATOR: emulatorHost ? '1' : ''
          }
        }
      })
    ],
    test: {
      include: ['test/**/*.test.ts'],
      testTimeout: 60_000,
      hookTimeout: 60_000
    }
  };
});

