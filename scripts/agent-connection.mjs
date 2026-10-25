import { readFileSync } from "node:fs";

export function readConnection(path) {
  const config = JSON.parse(readFileSync(path, "utf8"));
  const url = new URL(config.endpoint);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.pathname !== "/api/external-agent/balance" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    typeof config.token !== "string" ||
    !/^abg\.[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(config.token)
  )
    throw new Error("Invalid connection file");
  return { url, token: config.token };
}

export async function callBank(path, route, method = "GET", body) {
  const { url, token } = readConnection(path);
  url.pathname = `/api/external-agent/${route}`;
  const response = await fetch(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  return {
    ok: response.ok,
    status: response.status,
    body: response.ok ? await response.json() : undefined,
  };
}
