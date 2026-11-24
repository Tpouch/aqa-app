/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// In dev, /api and /firmware go to the API (npm run dev -w server). It listens on
// PORT, read like the server does: the shell first, then the repo's .env, else 3000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const api = `http://localhost:${env.PORT || 3000}`;
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": api,
        "/firmware": api,
      },
    },
    // Local-time tests (Bilan week bounds, clock changes) assume one fixed zone.
    test: {
      env: { TZ: "Europe/Paris" },
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}"],
        // lcov paths relative to the repo root, where sonar-scanner runs.
        reporter: ["text-summary", ["lcov", { projectRoot: ".." }]],
      },
    },
  };
});
