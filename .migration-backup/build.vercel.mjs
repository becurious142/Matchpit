/**
 * Vercel API Bundle Builder
 *
 * Bundles the Express app into api/index.mjs for Vercel serverless deployment.
 * Runs from the workspace root but resolves modules from artifacts/api-server.
 *
 * The Vercel entry exports the Express app as default (no app.listen).
 * Vercel's Node runtime wraps it automatically.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rm, mkdir, writeFile, unlink } from "node:fs/promises";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const apiServerDir = path.resolve(rootDir, "artifacts/api-server");
const apiDir = path.resolve(rootDir, "api");

// Use require from api-server dir so pino and other deps resolve correctly
const apiServerRequire = createRequire(path.resolve(apiServerDir, "package.json"));
globalThis.require = apiServerRequire;

// Import esbuild and plugin from api-server's node_modules
const esbuildPath = pathToFileURL(apiServerRequire.resolve("esbuild")).href;
const { build: esbuild } = await import(esbuildPath);

const pluginPath = pathToFileURL(apiServerRequire.resolve("esbuild-plugin-pino")).href;
const { default: esbuildPluginPino } = await import(pluginPath);

// ─── Vercel serverless entry source ──────────────────────────────────────────
// Thin wrapper: imports Express app (no app.listen), seeds referral config,
// exports app as default for Vercel Node runtime.
const VERCEL_ENTRY_SRC = `
import app from "${path.resolve(apiServerDir, "src/app.ts").replace(/\\/g, "/")}";
import { seedDefaultReferralConfig } from "${path.resolve(apiServerDir, "src/lib/wallet.ts").replace(/\\/g, "/")}";

// Seed on cold start (idempotent, non-fatal)
seedDefaultReferralConfig().catch(() => {});

export default app;
`;

async function buildVercel() {
  console.log("🔨 Building Vercel API bundle...");

  // Clean and recreate api/ dir
  await rm(apiDir, { recursive: true, force: true });
  await mkdir(apiDir, { recursive: true });

  // Write temp entry file inside api-server so relative imports resolve
  const entryFile = path.resolve(apiServerDir, "index.vercel.ts");
  await writeFile(entryFile, VERCEL_ENTRY_SRC);

  try {
    await esbuild({
      entryPoints: [entryFile],
      platform: "node",
      bundle: true,
      format: "esm",
      outdir: apiDir,
      outExtension: { ".js": ".mjs" },
      logLevel: "info",
      // Resolve node_modules from api-server directory
      nodePaths: [path.resolve(apiServerDir, "node_modules")],
      external: [
        "*.node",
        "sharp",
        "better-sqlite3",
        "sqlite3",
        "canvas",
        "bcrypt",
        "argon2",
        "fsevents",
        "re2",
        "farmhash",
        "bufferutil",
        "utf-8-validate",
        "pg-native",
        "lightningcss",
      ],
      sourcemap: false,
      plugins: [
        esbuildPluginPino({ transports: ["pino-pretty"] }),
      ],
      banner: {
        js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
      },
    });

    console.log("✅ Vercel API bundle written to api/index.mjs");
  } finally {
    await unlink(entryFile).catch(() => {});
    // Rename the output to index.mjs if pino plugin renamed it
    const { rename, access } = await import("node:fs/promises");
    const expectedOut = path.resolve(apiDir, "index.vercel.mjs");
    const finalOut = path.resolve(apiDir, "index.mjs");
    try {
      await access(expectedOut);
      await rename(expectedOut, finalOut);
    } catch { /* already named correctly */ }
  }
}

buildVercel().catch((err) => {
  console.error(err);
  process.exit(1);
});
