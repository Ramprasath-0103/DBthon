import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Laptop-only project: no --host, no mobile. 5174 because 5173 is already in use.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
