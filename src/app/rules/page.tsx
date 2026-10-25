"use client";
import { apiFetch, apiPost } from "../api-client";
import { useEffect, useState } from "react";
import { operatingAmount } from "@/features/rules/operating-amount";
import type { Rule } from "@/shared/domain";
type RuleView = Rule & {
  status: "active" | "stopped" | "reapproval-required";
  investmentTarget: { protocol: string; mode: string; chainId: number } | null;
};
type Grant = {
  id: string;
  status: string;
  mailIds: string[];
  cardIds?: string[];
  authorization: {
    approvalId?: string;
    scopes: string[];
    agentId: string;
    approvalMethod: string;
  };
};
const yen = (value: string) => `¥${BigInt(value).toLocaleString("en-US")}`;
export default function Rules() {
  const [rules, setRules] = useState<RuleView[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function load() {
    try {
      const [r, g] = await Promise.all([
        apiFetch("/api/rules"),
        apiFetch("/api/delegations"),
      ]);
      if (!r.ok || !g.ok) throw new Error("Unable to load settings.");
      const [nextRules, nextGrants] = await Promise.all([r.json(), g.json()]);
      setRules(nextRules);
      setGrants(nextGrants);
      setLoaded(true);
    } catch (e) {
      setLoaded(false);
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("agent-bank:rules-updated", refresh);
    return () =>
      window.removeEventListener("agent-bank:rules-updated", refresh);
  }, []);
  async function revoke(id: string) {
    try {
      await apiPost(`/api/delegations/${encodeURIComponent(id)}/revoke`, {});
      setError("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }
  const dataGrants = grants.filter((grant) =>
    grant.authorization.scopes.some((scope) =>
      ["mail", "card", "read"].includes(scope),
    ),
  );
  return (
    <>
      <header className="page-header">
        <h1>Automation rules</h1>
        <p>
          The amount your agent is authorized to manage across your accounts.
        </p>
      </header>
      <section
        className="panel internal-agent"
        aria-labelledby="internal-agent-title"
      >
        <h2 id="internal-agent-title">Internal Agent</h2>
        <section
          className="automation-amount"
          aria-labelledby="manageable-amount"
        >
          <h3 id="manageable-amount">Manageable amount</h3>
          <strong className="automation-total" aria-live="polite">
            {loaded ? yen(operatingAmount(rules, grants)) : "—"}
          </strong>
          <p className="automation-note">
            Payment and investment limits. Balances and approved terms still
            apply.
          </p>
        </section>
        <section className="automation-access" aria-labelledby="data-access">
          <h3 id="data-access">Data Access</h3>
          {dataGrants.length ? (
            dataGrants.map((grant) => (
              <div className="automation-access-row" key={grant.id}>
                <div>
                  <p>
                    {[
                      grant.authorization.scopes.includes("mail") &&
                        "Emails & invoices",
                      grant.authorization.scopes.includes("card") &&
                        "Card statements",
                      grant.authorization.scopes.includes("read") &&
                        "Account information",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {grant.status !== "active" && (
                    <span className="muted">
                      {grant.status === "revoked"
                        ? "Revoked"
                        : "Awaiting reapproval"}
                    </span>
                  )}
                </div>
                <button
                  disabled={grant.status === "revoked"}
                  onClick={() => void revoke(grant.id)}
                >
                  Revoke permission
                </button>
              </div>
            ))
          ) : (
            <p className="muted">No access granted.</p>
          )}
        </section>
      </section>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
