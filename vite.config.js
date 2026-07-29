import { defineConfig } from 'vite'

// Builds a single main.js + main.css that Webflow loads via custom code.
// During dev, the Webflow site points at http://localhost:5173/src/main.js instead.
export default defineConfig({
  server: {
    port: 5173,
    cors: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.js',
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (asset) =>
          asset.names?.some((n) => n.endsWith('.css'))
            ? 'main.css'
            : '[name][extname]',
      },
    },
  },
})
