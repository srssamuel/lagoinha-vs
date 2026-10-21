/** Bindings e variaveis do Worker (wrangler.toml). */
export interface Env {
  STEMS: R2Bucket;
  REGISTRY: D1Database;
  FIREBASE_PROJECT_ID: string;
  FIRESTORE_BASE: string;
  JWKS_URL: string;
  ALLOWED_ORIGINS: string;
  VERSION?: string;
  /** 'true' liga o modo emulador de autenticacao, mas SO se FIREBASE_PROJECT_ID comecar com "demo-". */
  AUTH_EMULATOR?: string;
}

type WorkerEnv = Env;

declare global {
  // Tipa `import { env } from "cloudflare:workers"` com os bindings acima.
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
