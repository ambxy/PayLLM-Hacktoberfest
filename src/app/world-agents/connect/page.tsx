"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isWorldAgentsPreview } from "../preview";

type Credential = {
  token: string;
  grantId: string;
  expiresAt: number;
  scope: string;
};
export default function ConnectAccountPage() {
  const [credential, setCredential] = useState<Credential>();
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const completion = useRef<Promise<Credential> | null>(null);
  useEffect(() => {
    if (isWorldAgentsPreview()) {
      setPreview(true);
      setCredential({
        token: "design-preview-not-a-valid-credential",
        grantId: "design-preview",
        expiresAt: 0,
        scope:
          new URLSearchParams(window.location.search).get("operations") === "1"
            ? "balance:read redemption:execute"
            : "balance:read",
      });
      sessionStorage.removeItem("agent-bank-connection-draft");
      return;
    }
    let active = true;
    completion.current ??= fetch("/api/world-agents/complete-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then(async (response) => {
      if (!response.ok)
        throw new Error(
          "This connection could not be completed or has already been issued. Review the connection settings and verify with World again.",
        );
      return response.json();
    });
    void completion.current
      .then((value) => {
        if (active) {
          setCredential(value);
          sessionStorage.removeItem("agent-bank-connection-draft");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  function download() {
    if (!credential) return;
    const file = {
      ...(preview ? { preview: true } : {}),
      endpoint: new URL("/api/external-agent/balance", window.location.origin)
        .href,
      ...credential,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = preview
      ? "agent-bank-connection-preview.json"
      : "agent-bank-connection.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="agent-connections-page">
      <header>
        <h1>Agent connections</h1>
      </header>
      <section className="panel">
        {preview && (
          <p>Design preview · No World verification or bank access</p>
        )}
        <h2>
          {credential
            ? "Agent connected"
            : error
              ? "Connection not completed"
              : "Connecting your agent…"}
        </h2>
        {!credential && !error && (
          <p role="status">Completing your approved connection.</p>
        )}
        {credential && (
          <>
            <p>Download the connection file and give it to your agent.</p>
            <p>
              Keep this file private. It is available only until you leave or
              reload this page.
            </p>
            <button onClick={download}>Download connection file</button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <p>
          <Link href={preview ? "/world-agents?preview=1" : "/world-agents"}>
            Back to connection settings
          </Link>{" "}
          · <Link href="/">Back to bank</Link>
        </p>
      </section>
    </div>
  );
}
