import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, the API runs on :3000 (npm run dev -w server).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/firmware": "http://localhost:3000",
    },
  },
});
