import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "../..",
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**", "src/routes/**"],
      exclude: ["src/lib/logger.ts", "src/lib/razorpay.ts"],
      thresholds: {
        lines: 90,
        // Applied only to critical financial modules
        perFile: false,
      },
    },
  },
  resolve: {
    // Allow importing from workspace packages in tests
    conditions: ["node"],
  },
});
