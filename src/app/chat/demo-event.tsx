"use client";
import { apiFetch } from "../api-client";
import { useState } from "react";
export function DemoEvent({
  type,
  label,
  onComplete,
  onError,
}: {
  type: string;
  label: string;
  onComplete: () => void;
  onError?: (error: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function execute() {
    setBusy(true);
    setError("");
    const requestId = crypto.randomUUID();
    try {
      const r = await apiFetch("/api/demo/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, requestId }),
      });
      if (!r.ok) throw new Error("Unable to complete the operation");
      onComplete();
    } catch (e) {
      setError(String(e));
      onError?.(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button disabled={busy} onClick={execute}>
        {busy ? "Running…" : label}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
