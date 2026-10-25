"use client";
export async function apiFetch(input: string, init?: RequestInit) {
  const response = await fetch(input, { ...init, cache: "no-store" });
  if (response.status === 401)
    window.dispatchEvent(new Event("agent-bank:session-expired"));
  return response;
}
export async function apiPost(path: string, body: object, timeoutMs = 30000) {
  const response = await apiFetch(path, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "The terms have changed or verification has expired. Start a new verification."
        : "Unable to complete the operation. Check your settings and current status.",
    );
  return response.json();
}
