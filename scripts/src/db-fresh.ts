/**
 * Reset + seed in one command.
 * CONFIRM_DB_RESET=yes pnpm --filter @workspace/scripts db:fresh
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(__dirname, "..");

function run(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", path.join("src", script)],
      {
        cwd: scriptsDir,
        stdio: "inherit",
        env: { ...process.env, CONFIRM_DB_RESET: "yes" },
        shell: true,
      },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function main() {
  await run("db-reset.ts");
  await run("seed.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
