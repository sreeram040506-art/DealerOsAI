import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    port: 8081,
    strictPort: false,
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    target: 'es2020',
    minify: 'terser',
    // Enable CSS code splitting for smaller initial CSS
    cssCodeSplit: true,
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: true,
        // Additional terser optimizations
        passes: 2,        // Multiple compression passes for smaller output
        pure_getters: true,
      },
      format: {
        comments: false,  // Strip all comments from production build
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'chart-vendor': ['recharts'],
          // Split Radix UI into its own chunk — these are used across many pages
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-alert-dialog',
          ],
          // PDF generation is heavy (~100KB) and only used on specific pages
          'pdf-vendor': ['jspdf', 'jspdf-autotable'],
        },
      },
    },
    // Generate source maps only in dev for faster prod builds
    sourcemap: mode !== 'production',
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'lucide-react',
    ],
  },
  // CSS optimization
  css: {
    devSourcemap: true,
  },
}));
