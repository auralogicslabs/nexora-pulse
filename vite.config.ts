import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { writeFileSync } from 'fs';

// emptyOutDir wipes assets/dist on every build — re-emit the directory-listing
// guard WordPress.org expects in every web-reachable folder.
function emitSilenceIndex(): Plugin {
  return {
    name: 'emit-silence-index',
    closeBundle() {
      writeFileSync(
        path.resolve(__dirname, 'assets/dist/index.php'),
        '<?php\n// Silence is golden.\n'
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), emitSilenceIndex()],
  root: 'frontend',
  build: {
    outDir: '../assets/dist',
    emptyOutDir: true,
    // Single IIFE bundle — required for WordPress script loading (no type="module" support).
    rollupOptions: {
      input: path.resolve(__dirname, 'frontend/main.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'nexora-pulse.js',
        // No code splitting: inline everything into the entry bundle.
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'nexora-pulse.css';
          return assetInfo.name ?? 'asset-[hash]';
        },
      },
    },
    sourcemap: false,
    minify: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend'),
    },
  },
});
