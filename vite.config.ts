import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function manualChunks(id: string) {
  const normalizedId = id.split(path.sep).join('/');

  if (!normalizedId.includes('/node_modules/')) {
    return undefined;
  }

  if (
    normalizedId.includes('/react/') ||
    normalizedId.includes('/react-dom/') ||
    normalizedId.includes('/scheduler/')
  ) {
    return 'vendor-react';
  }

  if (
    normalizedId.includes('/react-router/') ||
    normalizedId.includes('/react-router-dom/') ||
    normalizedId.includes('/@remix-run/')
  ) {
    return 'vendor-router';
  }

  if (
    normalizedId.includes('/@tanstack/react-query/') ||
    normalizedId.includes('/@tanstack/query-core/')
  ) {
    return 'vendor-query';
  }

  if (
    normalizedId.includes('/@supabase/') ||
    normalizedId.includes('/@gotrue/') ||
    normalizedId.includes('/@realtime/') ||
    normalizedId.includes('/@postgrest/') ||
    normalizedId.includes('/@storage/')
  ) {
    return 'vendor-supabase';
  }

  if (
    normalizedId.includes('/@radix-ui/') ||
    normalizedId.includes('/class-variance-authority/') ||
    normalizedId.includes('/tailwind-merge/') ||
    normalizedId.includes('/clsx/')
  ) {
    return 'vendor-ui';
  }

  if (normalizedId.includes('/lucide-react/')) {
    return 'vendor-icons';
  }

  return 'vendor';
}

export default defineConfig({
  server: {
    host: true,
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      '@tanstack/query-core',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});