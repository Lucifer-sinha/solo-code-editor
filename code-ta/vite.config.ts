import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react()
  ],
  define: {
    'process.env': {},
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // Allow external connections
    open: true,
    cors: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.trycloudflare.com', // Allow all Cloudflare tunnel domains
      '.ngrok.io', // Allow ngrok domains
      '.loca.lt', // Allow localtunnel domains
      '.serveo.net', // Allow serveo.net domains
    ],
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
          });
        }
      },
      '/socket.io': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Socket.IO proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Socket.IO proxy request:', req.method, req.url);
          });
        }
      },
      '/ws': {
        target: process.env.VITE_WS_URL || 'ws://localhost:5000',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist'
  },
  optimizeDeps: {
    include: ['monaco-editor']
  },
  esbuild: {
    loader: 'tsx',
    include: /src\/.*\.tsx?$/,
    exclude: [],
  },
})
