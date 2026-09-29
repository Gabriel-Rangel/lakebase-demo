import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Em dev, o Vite faz proxy de /api para o backend FastAPI.
// VITE_API_PROXY permite apontar para outro backend (ex.: branch dev na porta 8081).
const apiProxy = process.env.VITE_API_PROXY || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxy,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
