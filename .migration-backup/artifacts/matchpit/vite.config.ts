import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT and BASE_PATH are required in Replit dev/preview mode.
// In Vercel static build mode they are not set — that's fine because
// the build output is served as static files, not by Vite's dev server.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    // Output to repo root /dist so Vercel's outputDirectory resolution is unambiguous.
    // vercel.json#outputDirectory is set to "dist" (repo root relative).
    outDir: path.resolve(import.meta.dirname, "../../dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Proxy /api to backend in local dev when VITE_API_BASE_URL is not set
    proxy: process.env.VITE_API_BASE_URL
      ? undefined
      : {
          "/api": {
            target: `http://localhost:${process.env.API_PORT ?? 8080}`,
            changeOrigin: true,
          },
        },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
