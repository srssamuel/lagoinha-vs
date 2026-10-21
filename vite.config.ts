import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  define: {
    // Identifica o build no aviso de atualização; o e2e offline gera dois builds diferentes com isto.
    __BUILD_TAG__: JSON.stringify(process.env.LAGOINHA_BUILD_TAG ?? 'dev')
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a versão nova fica em espera até a pessoa aceitar. Sem skipWaiting/clientsClaim automáticos,
      // para nunca trocar o app no meio de um culto (docs/architecture/politica-offline.md).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Lagoinha VS',
        short_name: 'Lagoinha VS',
        description: 'Multitracks, click e guia para o louvor da Lagoinha João Pessoa.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0a0d14',
        theme_color: '#0a0d14',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Todo o build: documento, chunks (inclusive os carregados sob demanda), CSS, fontes, ícones, WASM.
        globPatterns: ['**/*.{html,js,mjs,css,svg,png,ico,webmanifest,woff,woff2,ttf,wasm}'],
        // public/stems/ são faixas de desenvolvimento (fora do git, ~100 MB); em produção os stems vêm do IndexedDB.
        globIgnores: ['stems/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Navegação offline cai no index.html; a página de retorno do login do Firebase não é do app.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/__\//, /\/stems\//],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        // Sem runtimeCaching de propósito: Firebase (Auth/Firestore) e o Worker de stems são autenticados
        // e nunca passam pelo cache do service worker.
        runtimeCaching: []
      }
    })
  ],
  server: {
    port: 3000,
    open: false
  }
});
