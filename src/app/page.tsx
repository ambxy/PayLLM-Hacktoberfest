"use client";
import { apiFetch } from "./api-client";
import { formatUsdc } from "@/shared/format";
import type { AccountMovement } from "@/shared/domain";
import { useCallback, useEffect, useRef, useState } from "react";

type View = {
  initialized: boolean;
  mode?: string;
  profile?: string;
  td?: string;
  positionUsdc?: string;
  looseUsdc?: string;
  movements?: AccountMovement[];
};

function yen(value: string) {
  return `¥${BigInt(value).toLocaleString("en-US")}`;
}

function AccountCard({
  title,
  subtitle,
  balance,
  movements,
  tone,
  fresh,
}: {
  title: string;
  subtitle?: string;
  balance: string;
  movements: AccountMovement[];
  tone: "deposit" | "token" | "aave";
  fresh: ReadonlySet<string>;
}) {
  return (
    <section className={`account-card ${tone}`}>
      <div className="account-card-header">
        <span className="account-icon" aria-hidden="true">
          {title.slice(0, 1)}
        </span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <strong key={balance} className="account-balance">
          {balance}
        </strong>
      </div>
      <div className="account-activity">
        <h3>Transactions</h3>
        {movements.length ? (
          <ul>
            {movements.slice(0, 4).map((movement, index) => (
              <li
                key={movement.id}
                className={fresh.has(movement.id) ? "fresh" : undefined}
                style={
                  fresh.has(movement.id)
                    ? { animationDelay: `${index * 120}ms` }
                    : undefined
                }
              >
                <span
                  className={`movement-direction ${movement.direction}`}
                  aria-label={movement.direction === "in" ? "Credit" : "Debit"}
                >
                  {movement.direction === "in" ? "↑" : "↓"}
                </span>
                <span className="movement-label">{movement.label}</span>
                <strong className={movement.direction}>
                  {movement.direction === "in" ? "+" : "−"}
                  {movement.unit === "JPY"
                    ? yen(movement.amount)
                    : `${formatUsdc(movement.amount)} USDC`}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="account-empty">No transactions yet.</p>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [data, setData] = useState<View>({ initialized: false });
  const [refreshError, setRefreshError] = useState("");
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const freshTimer = useRef<number | undefined>(undefined);
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await apiFetch("/api/dashboard", {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error("Unable to refresh balances.");
      setData(await r.json());
      setRefreshError("");
    } catch {
      setRefreshError("Unable to refresh balances. Waiting to reconnect.");
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    const refresh = () => void load();
    void load();
    const poll = window.setInterval(refresh, 1500);
    window.addEventListener("agent-bank:invoices-updated", refresh);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("agent-bank:invoices-updated", refresh);
    };
  }, [load]);
  const movements = data.movements ?? [];
  useEffect(() => {
    const ids = data.movements?.map((m) => m.id) ?? [];
    if (seen.current === null) {
      if (ids.length) seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    seen.current = new Set(ids);
    if (!added.length) return;
    setFresh(new Set(added));
    window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), 2600);
  }, [data.movements]);
  useEffect(() => () => window.clearTimeout(freshTimer.current), []);
  const forAccount = (account: AccountMovement["account"]) =>
    movements.filter((movement) => movement.account === account);
  return (
    <>
      <header className="page-header">
        <h1>Accounts</h1>
        <div className="toolbar">
          {(data.mode === "sepolia" || data.profile === "ten-usdc") && (
            <span className="badge">
              {data.mode === "sepolia" ? "Sepolia demo" : "Local demo"}
              {data.profile === "ten-usdc" ? " · 10 USDC starter" : ""}
            </span>
          )}
        </div>
      </header>
      {refreshError && <p role="status">{refreshError}</p>}

      <div className="account-list">
        <AccountCard
          title="Deposit account"
          subtitle="Account A"
          tone="deposit"
          balance={yen(data.td ?? "0")}
          movements={forAccount("deposit")}
          fresh={fresh}
        />
        <AccountCard
          title="Token account"
          tone="token"
          balance={`${formatUsdc(data.looseUsdc ?? "0")} USDC`}
          movements={forAccount("token")}
          fresh={fresh}
        />
        <AccountCard
          title="Aave"
          tone="aave"
          subtitle={data.mode === "sepolia" ? "Base Sepolia" : "Local stub"}
          balance={`${formatUsdc(data.positionUsdc ?? "0")} USDC`}
          movements={forAccount("aave")}
          fresh={fresh}
        />
      </div>
    </>
  );
}
