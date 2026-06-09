import path from 'node:path';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), wasm()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: {
      // Cross-origin isolation for SharedArrayBuffer (Rapier SIMD WASM)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  build: {
    target: 'es2022',
    // Rapier compat runtime intentionally dominates the production bundle.
    // Manual chunking below keeps it isolated; the budget reflects that known cost.
    chunkSizeWarningLimit: 5000,
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          // Нормализуем path-разделители Windows для регекса
          const p = id.replace(/\\/g, '/');
          // Firebase SDK — отдельный lazy-чанк: грузится только при выборе
          // firebase-адаптера сетевого режима, в основной bundle не попадает.
          if (p.includes('/firebase/') || p.includes('/@firebase/')) return 'vendor-firebase';
          if (p.includes('@dimforge/rapier3d-compat')) return 'vendor-rapier-core';
          if (p.includes('@react-three/rapier')) return 'vendor-rapier-r3f';
          if (p.includes('@react-three/drei')) return 'vendor-r3f-drei';
          if (p.includes('@react-three/fiber')) return 'vendor-r3f-fiber';
          if (
            p.includes('node_modules/three/') ||
            p.includes('node_modules/three-stdlib/') ||
            /node_modules\/three\b/.test(p)
          )
            return 'vendor-three';
          if (p.includes('/react-dom/')) return 'vendor-react-dom';
          if (p.includes('/react/') && !p.includes('/react-three/')) return 'vendor-react';
          if (p.includes('/uplot')) return 'vendor-uplot';
          if (p.includes('mistreevous')) return 'vendor-bt';
          if (p.includes('/zustand') || p.includes('/valtio')) return 'vendor-state';
          return 'vendor-misc';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'playwright-report/**'],
    // pool 'threads' — worker_threads быстрее process.fork для не-native кода
    // и совместим со всеми зависимостями проекта (Rapier грузится только в e2e).
    pool: 'threads',
  },
});
