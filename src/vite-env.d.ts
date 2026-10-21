/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" liga o modo demonstração (admin de exemplo, Acesso Demo, Google simulado) fora do `npm run dev`. */
  readonly VITE_DEMO_MODE?: string;
}
