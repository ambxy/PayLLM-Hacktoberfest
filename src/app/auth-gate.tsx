"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { WorldWidget } from "./world-widget";
import { BrandLogo } from "./brand-logo";
import { apiPost } from "./api-client";
import type { Challenge, WorldStatus } from "./world-approval";
const LogoutContext = createContext<{
  logout: () => Promise<void>;
  busy: boolean;
  error: string;
} | null>(null);
export function LogoutButton() {
  const auth = useContext(LogoutContext);
  if (!auth) return null;
  return (
    <div className="sidebar-logout">
      <button disabled={auth.busy} onClick={() => void auth.logout()}>
        Log out
      </button>
      {auth.error && <p role="alert">{auth.error}</p>}
    </div>
  );
}
export function AuthGate({ children }: { children: React.ReactNode }) {
  const generation = useRef(0);
  const completed = useRef(false);
  const finishing = useRef(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const [world, setWorld] = useState<WorldStatus>();
  const [ticket, setTicket] = useState("");
  const [challenge, setChallenge] = useState<
    Challenge & { purpose: "login" | "enroll"; attempt: number }
  >();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    const [session, status] = await Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch("/api/world", { cache: "no-store" }),
    ]);
    if (!session.ok || !status.ok)
      throw new Error("Unable to load authentication settings.");
    const sessionData = await session.json();
    const worldData = await status.json();
    setWorld(worldData);
    setAuthenticated(sessionData.authenticated);
    setReady(true);
  }
  useEffect(() => {
    void refresh()
      .then(async () => {
        // Auto-login if local-demo mode
        const res = await fetch("/api/world", { cache: "no-store" });
        const w = await res.json();
        if (w.authMode === "local-demo") {
          await apiPost("/api/auth/demo-login", {});
          await refresh();
        }
      })
      .catch((e) => {
        setError(String(e));
        setReady(true);
      });
    const expired = () => {
      generation.current++;
      setAuthenticated(false);
      setChallenge(undefined);
      setOpen(false);
      setError("Your session has expired. Please log in again.");
      void refresh().catch((e) => setError(String(e)));
    };
    window.addEventListener("agent-bank:session-expired", expired);
    return () =>
      window.removeEventListener("agent-bank:session-expired", expired);
  }, []);
  async function cancel() {
    generation.current++;
    if (challenge)
      await apiPost(`/api/auth/${challenge.purpose}/cancel`, {
        id: challenge.id,
      });
    setChallenge(undefined);
    setOpen(false);
  }
  async function login(demo: boolean) {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        generation.current++;
        setOpen(false);
        setChallenge(undefined);
        await apiPost("/api/auth/demo-login", {});
        setTicket("");
        await refresh();
      } else {
        const attempt = ++generation.current;
        completed.current = false;
        const purpose = world?.enrolled ? "login" : "enroll";
        const needsTicket =
          purpose === "enroll" && world?.enrollTicketRequired !== false;
        if (needsTicket && !/^[a-f0-9]{64}$/.test(ticket.trim())) {
          setError(
            "Invalid enrollment ticket. Paste exactly 64 hexadecimal characters (0-9, a-f), without trailing symbols such as %.",
          );
          return;
        }
        const result = await apiPost(
          `/api/auth/${purpose}/begin`,
          needsTicket ? { ticket: ticket.trim() } : {},
        );
        setTicket("");
        if (attempt !== generation.current) return;
        setChallenge({ ...result, attempt });
        setOpen(true);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/auth/logout", {});
      generation.current++;
      setAuthenticated(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (authenticated)
    return (
      <LogoutContext.Provider value={{ logout, busy, error }}>
        {children}
      </LogoutContext.Provider>
    );
  return (
    <main id="main" className="auth-screen">
      <section className="panel">
        <span className="auth-logo">
          <BrandLogo size={56} />
        </span>
        <h1>PayLLM Local Assistant</h1>
        <p>
          Local AI-powered invoice management and automated payment scheduling. No World ID required.
        </p>
        {!ready && <p>Initializing local session…</p>}
        {ready && (
          <button disabled={busy} onClick={() => void login(true)}>
            Launch PayLLM Dashboard
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
