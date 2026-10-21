/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" liga o modo demonstração (admin de exemplo, Acesso Demo, Google simulado) fora do `npm run dev`. */
  readonly VITE_DEMO_MODE?: string;
  /** Backend do acervo: "local" (padrão, sem nuvem) ou "firebase" (a partir da F2). */
  readonly VITE_BACKEND?: string;
}
