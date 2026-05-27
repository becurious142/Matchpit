import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load DATABASE_URL from repo root .env (if present). */
export function loadEnv(): void {
  config({ path: path.resolve(__dirname, "../../.env") });
}

export function requireDatabaseUrl(): string {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env or export it before running db scripts.",
    );
  }
  return url;
}
