import { defineConfig } from "vite"

export default defineConfig({
  server: {
    proxy: {
      "/api/integrations/acquisition": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      '/api': 'http://localhost:3000',
    },
  },
})
