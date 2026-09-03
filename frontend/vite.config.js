import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * Proxy de desenvolvimento: o navegador chama `/api/...` na própria
     * origem do Vite e ele repassa para o backend. Assim o front funciona
     * localmente sem depender de configuração de CORS.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
});
