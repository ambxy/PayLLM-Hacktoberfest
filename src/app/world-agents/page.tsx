"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isWorldAgentsPreview } from "./preview";

type Status = {
  configured: boolean;
  status:
    | "idle"
    | "pending"
    | "verifying"
    | "verified"
    | "used"
    | "cancelled"
    | "expired"
    | "failed";
};
type Connection = {
  initialized: boolean;
  accountLabel: string;
  redemptionQuote: { hash: string } | null;
};
const failures = {
  cancelled: "Verification cancelled. No agent access was granted.",
  expired: "Verification expired. Review the connection and try again.",
  failed: "Verification failed. No agent access was granted.",
};
const draftKey = "agent-bank-connection-draft";
export default function WorldAgentsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>();
  const [connection, setConnection] = useState<Connection>();
  const [name, setName] = useState("My external agent");
  const [allowOperations, setAllowOperations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewVerification, setPreviewVerification] = useState(false);
  useEffect(() => {
    const draft = sessionStorage.getItem(draftKey);
    if (draft) {
      try {
        const saved = JSON.parse(draft);
        if (typeof saved.name === "string") setName(saved.name);
        setAllowOperations(saved.allowOperations === true);
      } catch {
        sessionStorage.removeItem(draftKey);
      }
    }
    if (isWorldAgentsPreview()) {
      setPreview(true);
      setStatus({ configured: true, status: "idle" });
      setConnection({
        initialized: true,
        accountLabel: "Account A",
        redemptionQuote: { hash: "design-preview" },
      });
      return;
    }
    let active = true;
    async function load() {
      const [s, c] = await Promise.all([
        fetch("/api/world-agents/status", { cache: "no-store" }),
        fetch("/api/world-agents/connection", { cache: "no-store" }),
      ]);
      if (!s.ok || !c.ok)
        throw new Error(
          "Unable to load connection settings. Check your bank login and try again.",
        );
      const [nextStatus, nextConnection] = await Promise.all([
        s.json(),
        c.json(),
      ]);
      if (active) {
        setStatus(nextStatus);
        setConnection(nextConnection);
      }
    }
    void load().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, []);
  async function begin() {
    setError("");
    sessionStorage.setItem(draftKey, JSON.stringify({ name, allowOperations }));
    if (isWorldAgentsPreview()) {
      setPreviewVerification(true);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/world-agents/begin-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(allowOperations
            ? { redemptionHash: connection?.redemptionQuote?.hash }
            : {}),
        }),
      });
      if (!response.ok)
        throw new Error(
          "Unable to start verification. Refresh the page to review the latest connection settings and try again.",
        );
      const result = await response.json();
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function cancel() {
    if (isWorldAgentsPreview()) {
      setPreviewVerification(false);
      setStatus({ configured: true, status: "cancelled" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/world-agents/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok)
        throw new Error("Unable to cancel verification. Please try again.");
      setStatus((previous) => previous && { ...previous, status: "cancelled" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const failed =
    status && status.status in failures
      ? failures[status.status as keyof typeof failures]
      : undefined;
  return (
    <div className="agent-connections-page">
      <header>
        <h1>Agent connections</h1>
      </header>
      <section className="panel">
        {preview && (
          <p>Design preview · No World verification or bank access</p>
        )}
        {previewVerification ? (
          <>
            <h2>World verification</h2>
            <p>Preview the verification step before connecting your agent.</p>
            <button
              onClick={() =>
                router.push(
                  `/world-agents/connect?preview=1${allowOperations ? "&operations=1" : ""}`,
                )
              }
            >
              Complete preview verification
            </button>
            <button className="secondary" onClick={() => void cancel()}>
              Cancel verification
            </button>
          </>
        ) : (
          <>
            <h2>Connect your agent</h2>
            <p>
              Review access, then verify with World to connect your agent to
              Agent Bank.
            </p>
            {!connection && !error && (
              <p role="status">Loading connection settings…</p>
            )}
            {connection && (
              <>
                <p>
                  Account · <strong>{connection.accountLabel}</strong>
                </p>
                <label className="field">
                  Agent name
                  <input
                    value={name}
                    maxLength={60}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <p>Balance access · Available and locked TD</p>
                <label className="agent-operation-permission">
                  <input
                    type="checkbox"
                    checked={allowOperations}
                    disabled={busy || !connection.redemptionQuote}
                    onChange={(e) => setAllowOperations(e.target.checked)}
                  />
                  Allow deposit and token account operations
                </label>
                <p>
                  Access expires {allowOperations ? 5 : 15} minutes after
                  connection.
                </p>
                {!connection.initialized && (
                  <p>
                    Initialize your demo account first.{" "}
                    <Link href="/">Open Accounts</Link>
                  </p>
                )}
                {!connection.redemptionQuote && (
                  <p>No invested positions are available to return.</p>
                )}
              </>
            )}
            {status && !status.configured && (
              <p>A developer needs to configure the World connection.</p>
            )}
            {failed && <p role="status">{failed}</p>}
            <button
              disabled={
                busy ||
                !status?.configured ||
                !connection?.initialized ||
                !name.trim() ||
                (allowOperations && !connection.redemptionQuote)
              }
              onClick={() => void begin()}
            >
              {busy ? "Connecting…" : "Verify with World and allow"}
            </button>
            {status && ["pending", "verifying"].includes(status.status) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void cancel()}
              >
                Cancel verification
              </button>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
