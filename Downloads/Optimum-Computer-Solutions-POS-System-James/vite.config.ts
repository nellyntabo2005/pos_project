import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Modern ESM equivalent of __dirname for Vite environments
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    // Added explicit string type to 'id' to fix ts(7006)
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/app'),
    },
  },
  server: {
    watch: {
      ignored: [
        '**/*.log',
        '**/*.err',
        '**/django.log',
        '**/django.err',
        '**/vite.log',
        '**/vite.err',
        '**/frontend-*.log',
        '**/frontend-*.err',
        '**/backend/**/db.sqlite3',
        '**/backend/**/logs/**',
        '**/backend/**/media/**',
        '**/dist/**'
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_error, _request, response) => {
            if (!response.headersSent) {
              response.writeHead(503, { 'Content-Type': 'application/json' })
            }

            response.end(JSON.stringify({
              message: 'Cannot reach the backend API. Make sure Django is running on http://127.0.0.1:8000.',
            }))
          })
        },
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
