import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/kanban/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Mi Kanban',
        short_name: 'Kanban',
        description: 'Capa visual Kanban conectada en tiempo real con Google Tasks.',
        theme_color: '#1d4ed8',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%232563eb%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><rect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/><path d=%22M9 3v18%22/><path d=%22M15 3v18%22/></svg>',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%232563eb%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><rect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/><path d=%22M9 3v18%22/><path d=%22M15 3v18%22/></svg>',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
});
