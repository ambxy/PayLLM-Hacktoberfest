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
    setWorld(await status.json());
    setAuthenticated((await session.json()).authenticated);
    setReady(true);
  }
  useEffect(() => {
    void refresh().catch((e) => {
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
        <h1>Log in to Agent Bank</h1>
        <p>
          Verify you are human using the World ID linked to your account to log
          in.
        </p>
        {!ready && <p>Checking authentication settings…</p>}
        {world && (
          <>
            {!world.configured && (
              <p>
                World is not configured. Standard mode requires World setup.
              </p>
            )}
            {!world.enrolled && world.enrollTicketRequired && (
              <label className="field">
                Enrollment ticket
                <input
                  type="password"
                  autoComplete="off"
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                />
              </label>
            )}
            <button
              disabled={
                busy ||
                !world.configured ||
                (!world.enrolled &&
                  world.enrollTicketRequired &&
                  !ticket.trim())
              }
              onClick={() => void login(false)}
            >
              {world.enrolled || !world.enrollTicketRequired
                ? "Log in with World"
                : "Register account with World"}
            </button>
            {world.authMode === "local-demo" && (
              <button disabled={busy} onClick={() => void login(true)}>
                Continue as demo
              </button>
            )}
          </>
        )}
        {challenge && (
          <>
            <button
              disabled={busy}
              onClick={() => void cancel().catch((e) => setError(String(e)))}
            >
              Cancel World verification
            </button>
            <WorldWidget
              challenge={challenge}
              open={open}
              onOpenChange={(value) => {
                setOpen(value);
                if (!value && !completed.current && !finishing.current) {
                  void cancel().catch((e) => setError(String(e)));
                  setError(
                    "World verification closed. Try again or continue as a demo.",
                  );
                }
              }}
              description="Log in to Agent Bank"
              handleVerify={async (proof) => {
                const attempt = challenge.attempt;
                if (attempt !== generation.current) return;
                finishing.current = true;
                try {
                  await apiPost(`/api/auth/${challenge.purpose}/verify`, {
                    id: challenge.id,
                    proof,
                  });
                } finally {
                  finishing.current = false;
                }
                if (attempt !== generation.current) return;
                completed.current = true;
                setOpen(false);
                setChallenge(undefined);
                await refresh();
              }}
              onError={(code, report) => {
                // Identifiers only; the report payloads can carry proofs.
                console.warn("World IDKit error", code, {
                  requestId: report?.request_id,
                  sdk: report?.package_version,
                  at: report?.generated_at,
                });
                setError(
                  `World verification failed (${code}). Try again or continue as a demo.`,
                );
              }}
            />
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
