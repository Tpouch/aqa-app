import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // lcov paths relative to the repo root, where sonar-scanner runs.
      reporter: ["text-summary", ["lcov", { projectRoot: ".." }]],
    },
  },
});
