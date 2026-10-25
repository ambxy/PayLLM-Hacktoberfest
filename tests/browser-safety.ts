import type { FullConfig } from "@playwright/test";
export default async function setup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  const response = await fetch(base + "/api/world");
  if (!response.ok) throw new Error("Test server safety status unavailable");
  const data = await response.json();
  assertBrowserMode(data, process.env.TESTNET_EXECUTION === "approved");
}
export function assertBrowserMode(
  data: { mode?: string; configuredMode?: string; persistedMode?: string },
  approved: boolean,
) {
  const isPublic =
    data.mode === "sepolia" ||
    data.configuredMode === "sepolia" ||
    data.persistedMode === "sepolia";
  if (isPublic && !approved)
    throw new Error(
      "Public server refused: explicit TESTNET_EXECUTION=approved required",
    );
  if (approved && !isPublic) throw new Error("Live test requires Sepolia mode");
}
