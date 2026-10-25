"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, apiPost } from "./api-client";
type Clock = {
  date: string | null;
  ready: boolean;
  stages: { date: string }[];
  recent?: { status: string };
};
export function DemoControls({
  onGrantAccess,
  onRedeem,
  chatBusy,
}: {
  onGrantAccess: () => void;
  onRedeem: () => void;
  chatBusy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [clock, setClock] = useState<Clock>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState<boolean>();
  async function load() {
    const [response, dashboard] = await Promise.all([
      apiFetch("/api/demo/clock"),
      apiFetch("/api/dashboard"),
    ]);
    if (!response.ok || !dashboard.ok)
      throw new Error("Unable to load demo controls.");
    setClock(await response.json());
    setInitialized((await dashboard.json()).initialized);
  }
  async function reset() {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) {
        const result = await r.json();
        throw new Error(result.error ?? "Unable to initialize the demo");
      }
      dialog.current?.close();
      window.dispatchEvent(new Event("agent-bank:demo-reset"));
      window.dispatchEvent(new Event("agent-bank:invoices-updated"));
      window.dispatchEvent(new Event("agent-bank:rules-updated"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const refresh = () => {
      if (dialog.current?.open) void load().catch((e) => setError(String(e)));
    };
    window.addEventListener("agent-bank:rules-updated", refresh);
    window.addEventListener("agent-bank:invoices-updated", refresh);
    return () => {
      window.removeEventListener("agent-bank:rules-updated", refresh);
      window.removeEventListener("agent-bank:invoices-updated", refresh);
    };
  }, []);
  const next = clock?.stages.find((stage) => stage.date > (clock.date ?? ""));
  async function advance() {
    if (busy || !next) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiPost(
        "/api/demo/clock",
        { date: next.date, requestId: crypto.randomUUID() },
        300000,
      );
      if (result.status !== "completed")
        throw new Error(
          "The operation needs attention. Check the current balances before continuing.",
        );
      window.dispatchEvent(new Event("agent-bank:invoices-updated"));
      window.dispatchEvent(new Event("agent-bank:rules-updated"));
      window.dispatchEvent(new Event("agent-bank:messages-updated"));
      await load();
    } catch (e) {
      setError(String(e));
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="demo-fab"
        aria-label="Open demo controls"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          setClock(undefined);
          setError("");
          void load().catch((e) => setError(String(e)));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="3" fill="currentColor" />
          <circle cx="15" cy="17" r="3" fill="currentColor" />
        </svg>
      </button>
      <dialog
        className="demo-drawer"
        ref={dialog}
        aria-labelledby="demo-controls-title"
      >
        <header className="demo-drawer-header">
          <h2 id="demo-controls-title">Demo controls</h2>
          <button
            type="button"
            className="secondary"
            aria-label="Close demo controls"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </header>
        <div className="demo-drawer-body">
          <div className="demo-actions">
            <button
              className="secondary"
              disabled={busy || chatBusy}
              onClick={() => void reset()}
            >
              {busy
                ? "Working…"
                : initialized === false
                  ? "Initialize demo"
                  : "Reset demo"}
            </button>
            <button
              disabled={busy || chatBusy}
              onClick={() => {
                dialog.current?.close();
                onGrantAccess();
              }}
            >
              Grant card &amp; invoice access
            </button>
            <button
              disabled={
                busy ||
                chatBusy ||
                !next ||
                !clock?.ready ||
                clock.recent?.status === "needs_attention"
              }
              onClick={() => void advance()}
            >
              {busy
                ? "Processing…"
                : next
                  ? `Change date · ${new Date(next.date + "T12:00:00+09:00").toLocaleDateString("en-US", { timeZone: "Asia/Tokyo", month: "short", day: "numeric" })}`
                  : "Change date"}
            </button>
            <button
              disabled={busy || chatBusy}
              onClick={() => {
                dialog.current?.close();
                onRedeem();
              }}
            >
              Redeem all investments to TD
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      </dialog>
    </>
  );
}
