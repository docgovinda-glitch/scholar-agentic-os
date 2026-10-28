import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      setupFiles: ['./src/test/vitestSetup.ts'],
      env: {
        VITE_SUPABASE_URL: '',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        DATABASE_URL: '',
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (
                id.includes('/react/') ||
                id.includes('/react-dom/') ||
                id.includes('/react-router') ||
                id.includes('/scheduler/')
              ) {
                return 'react';
              }
              if (id.includes('@tiptap') || id.includes('prosemirror')) {
                return 'tiptap';
              }
              if (id.includes('@supabase')) {
                return 'supabase';
              }
              if (id.includes('lucide-react') || id.includes('/motion/') || id.includes('framer-motion')) {
                return 'ui';
              }
              if (id.includes('node_modules/docx/')) {
                return 'docx';
              }
              if (id.includes('/pdfmake/')) {
                return 'pdfmake';
              }
              if (id.includes('/xlsx/')) {
                return 'xlsx';
              }
              if (
                id.includes('/bluebird/') ||
                id.includes('/underscore/') ||
                id.includes('/xmlbuilder/') ||
                id.includes('/dingbat-to-unicode/') ||
                id.includes('/lop/') ||
                id.includes('/jszip/')
              ) {
                return 'mammoth-deps';
              }
              if (id.includes('/mammoth/')) {
                return 'mammoth';
              }
            }
            if (
              id.includes('src/desk/assignment/services/outlineService') ||
              id.includes('src/desk/assignment/services/scholarlyDiscoveryService')
            ) {
              return 'assignment-services';
            }
            return undefined;
          },
        }
      }
    },
  };
});
