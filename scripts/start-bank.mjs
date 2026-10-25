import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const [command, ...args] = process.argv.slice(2);
if (!["dev", "start"].includes(command))
  throw new Error("Expected dev or start");
if (
  args.some(
    (a) =>
      a.startsWith("-H") || a.startsWith("--hostname") || a.startsWith("-H="),
  )
)
  throw new Error("Bank launcher requires loopback hostname");
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
nextRequire("@next/env").loadEnvConfig(process.cwd(), command === "dev");
process.env.BANK_BIND_HOST = "127.0.0.1";
const initialized = spawnSync(
  process.execPath,
  ["--conditions=react-server", "--import", "tsx", "scripts/auth-start.ts"],
  { stdio: "inherit", env: process.env },
);
if (initialized.status !== 0) process.exit(initialized.status ?? 1);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    command,
    ...args,
    "--hostname",
    "127.0.0.1",
  ],
  { stdio: "inherit", env: { ...process.env, BANK_BIND_HOST: "127.0.0.1" } },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
