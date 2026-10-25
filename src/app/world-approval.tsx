"use client";
import { useEffect, useRef, useState } from "react";
import type { RpContext } from "@worldcoin/idkit";
import { WorldWidget } from "./world-widget";
import type { Proposal } from "@/shared/domain";
import { apiFetch, apiPost } from "./api-client";
export type WorldStatus = {
  required: boolean;
  enrolled: boolean;
  enrollTicketRequired: boolean;
  configured: boolean;
  mode: string;
  authMode: "world" | "local-demo";
};
export type WorldRequest =
  | { purpose: "proposal" | "delegation"; proposalId: string }
  | {
      purpose: "setup";
      paymentProposalId: string;
      investmentProposalId: string;
    }
  | {
      purpose: "change";
      change: { baseVersion: number; conditions: Proposal["conditions"] };
    };
type Policy = {
  baseVersion: number;
  accountId: string;
  agentId: string;
  scopes: string[];
  conditions: Proposal["conditions"] | { mailIds: string[] };
  investmentConditions?: Proposal["conditions"];
  investmentBaseVersion?: number;
  target: {
    recipient: string;
    investment: {
      mode: string;
      chainId: number;
      protocol: string;
      token: string;
      pool: string;
    };
  };
};
export type Challenge = {
  id: string;
  appId: `app_${string}`;
  rpContext: RpContext;
  environment: "production" | "sandbox";
  flow?: "session" | "request";
  action?: string;
  signal: string;
  sessionId?: `session_${string}`;
  policy?: Policy;
};
const yen = (value: string) => `¥${BigInt(value).toLocaleString("en-US")}`;
const recipientName = (id: string) =>
  id === "aoba"
    ? "Aoba Design"
    : id === "sakura"
      ? "Sakura Office"
      : "Harp Card";
const recipientAccount = (id: string) =>
  id === "aoba" ? "0000001" : id === "sakura" ? "0000002" : "0000003";
const mailName = (id: string) =>
  id === "aoba-mail"
    ? "Aoba Design sample email"
    : id === "sakura-mail"
      ? "Sakura Office sample email"
      : id;
type DemoChallenge = { id: string; policy: Policy; expiresAt: number };
export function WorldApproval({
  input,
  onApproved,
  onCancel,
}: {
  input: WorldRequest;
  onApproved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [world, setWorld] = useState<WorldStatus>();
  const [challenge, setChallenge] = useState<Challenge & { attempt: number }>();
  const [demo, setDemo] = useState<DemoChallenge>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const pendingId = useRef<string | undefined>(undefined);
  const completed = useRef(false);
  const finishing = useRef(false);
  const pendingDemoId = useRef<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void apiFetch("/api/world")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load World settings.");
        const status: WorldStatus = await response.json();
        if (!active) return;
        setWorld(status);
        if (!status.configured || !status.enrolled) {
          setError("World is not configured or enrolled.");
          return;
        }
        const result = await apiPost("/api/world", { action: "begin", input });
        if (active) {
          pendingId.current = result.id;
          setChallenge({ ...result, attempt: generation.current });
        } else await apiPost("/api/world", { action: "cancel", id: result.id });
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      generation.current++;
      if (pendingDemoId.current && !completed.current)
        void apiPost("/api/demo/approvals", {
          action: "cancel",
          id: pendingDemoId.current,
        }).catch(() =>
          console.warn(
            "Demo cancellation could not be confirmed; the challenge expires after five minutes.",
          ),
        );
      if (pendingId.current && !completed.current)
        void apiPost("/api/world", {
          action: "cancel",
          id: pendingId.current,
        }).catch(() =>
          console.warn(
            "World cancellation could not be confirmed; the challenge expires after five minutes.",
          ),
        );
    };
  }, [input]);
  async function cancel() {
    generation.current++;
    setBusy(true);
    try {
      if (demo)
        await apiPost("/api/demo/approvals", { action: "cancel", id: demo.id });
      if (challenge)
        await apiPost("/api/world", { action: "cancel", id: challenge.id });
      setOpen(false);
      onCancel();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function startDemo() {
    const attempt = ++generation.current;
    setOpen(false);
    setBusy(true);
    setError("");
    try {
      const result = await apiPost("/api/demo/approvals", {
        action: "begin",
        input,
      });
      if (attempt !== generation.current) {
        await apiPost("/api/demo/approvals", {
          action: "cancel",
          id: result.id,
        });
        return;
      }
      pendingDemoId.current = result.id;
      setDemo(result);
      pendingId.current = undefined;
      setChallenge(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const policy = demo?.policy ?? challenge?.policy;
  const conditions = policy?.conditions;
  const c = conditions && "id" in conditions ? conditions : undefined;
  const investment = policy?.investmentConditions;
  const investmentRule = c?.id === "investment" ? c : investment;
  const recipients =
    c?.id === "payment"
      ? (c.paymentRecipients ?? [
          {
            recipientId: c.recipientId,
            maxPaymentJpy: c.maxPaymentJpy,
            monthlyLimitJpy: c.monthlyLimitJpy,
          },
        ])
      : [];
  const names: Record<string, string> = {
    read: "Read banking data",
    propose: "Propose terms",
    card: "Read selected card statements",
    mail: "Read selected emails",
    payment: "Payments within approved terms",
    investment: "Investments within approved terms",
    redemption: "Redemptions at your request",
  };
  return (
    <section className="panel approval-policy" aria-label="World approval">
      <h2>Approve these terms</h2>
      {policy && (
        <div className="approval-summary">
          <p className="approval-meta">
            {policy.agentId} can act only within these terms.
          </p>
          {conditions && "mailIds" in conditions && (
            <section className="approval-section">
              <h3>Email access</h3>
              <ul>
                {conditions.mailIds.map((id) => (
                  <li key={id}>{mailName(id)}</li>
                ))}
              </ul>
            </section>
          )}
          {c?.id === "payment" && (
            <section className="approval-section">
              <h3>{c.enabled ? "Payments on due dates" : "Pause payments"}</h3>
              <ul className="approval-limits">
                {recipients.map((r) => (
                  <li key={r.recipientId}>
                    <span>{recipientName(r.recipientId)}</span>
                    <b>
                      {r.maxPaymentJpy === r.monthlyLimitJpy
                        ? `${yen(r.monthlyLimitJpy)} / month`
                        : `${yen(r.maxPaymentJpy)} each · ${yen(r.monthlyLimitJpy)} / month`}
                    </b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {investmentRule && (
            <section className="approval-section">
              <h3>
                {investmentRule.enabled
                  ? "Investing in "
                  : "Pause investing in "}
                {policy.target.investment.mode === "stub"
                  ? "Aave (simulation)"
                  : policy.target.investment.protocol}
              </h3>
              <p className="approval-line">
                Up to {yen(investmentRule.maxInvestmentJpy)} each · keeps{" "}
                {yen(investmentRule.safetyBufferJpy)} in deposit
              </p>
            </section>
          )}
          {(investmentRule?.enabled ||
            policy.scopes.includes("redemption")) && (
            <p className="approval-caption">
              {investmentRule?.enabled &&
                "Investing starts right after approval. "}
              {policy.scopes.includes("redemption") &&
                "Redemptions only when you ask."}
            </p>
          )}
          <details className="approval-technical">
            <summary>Full terms and account details</summary>
            <dl className="approval-fields">
              <div>
                <dt>Allowed actions</dt>
                <dd>{policy.scopes.map((s) => names[s] ?? s).join(", ")}</dd>
              </div>
              {[c, investment]
                .filter((rule): rule is NonNullable<typeof c> => !!rule)
                .map((rule) => (
                  <div key={rule.id + "-version"}>
                    <dt>
                      {rule.id === "payment" ? "Payments" : "Investments"}
                    </dt>
                    <dd>
                      {rule.enabled ? "Enable" : "Pause"} · Version{" "}
                      {(rule === investment
                        ? (policy.investmentBaseVersion ?? 0)
                        : policy.baseVersion) + 1}
                    </dd>
                  </div>
                ))}
            </dl>
            {c?.id === "payment" &&
              recipients.map((r) => (
                <p className="approval-caption" key={r.recipientId}>
                  {recipientName(r.recipientId)}: Agent Bank · Harp Branch ·
                  Deposit account {recipientAccount(r.recipientId)} (demo) ·
                  internal transfer, 1 TD = ¥1
                </p>
              ))}
            {[c, investment]
              .filter((rule): rule is NonNullable<typeof c> => !!rule)
              .map((rule) => (
                <dl className="approval-fields" key={rule.id + "-funds"}>
                  <div>
                    <dt>
                      Minimum balance ·{" "}
                      {rule.id === "payment" ? "Payments" : "Investments"}
                    </dt>
                    <dd>{yen(rule.minimumBalanceJpy)}</dd>
                  </div>
                  <div>
                    <dt>
                      Safety buffer ·{" "}
                      {rule.id === "payment" ? "Payments" : "Investments"}
                    </dt>
                    <dd>{yen(rule.safetyBufferJpy)}</dd>
                  </div>
                </dl>
              ))}
            {investmentRule && (
              <dl className="approval-fields">
                <div>
                  <dt>Network</dt>
                  <dd>
                    {policy.target.investment.mode === "stub"
                      ? "Simulation"
                      : policy.target.investment.chainId === 84532
                        ? "Base Sepolia"
                        : `Chain ${policy.target.investment.chainId}`}
                  </dd>
                </div>
              </dl>
            )}
            <dl className="approval-fields">
              <div>
                <dt>Account</dt>
                <dd>{policy.accountId}</dd>
              </div>
            </dl>
            {c?.id === "payment" && (
              <>
                <p>Recipient address (local Anvil)</p>
                <p className="hash">{policy.target.recipient}</p>
                <p className="approval-caption">
                  Account numbers are fictional samples. Both demo payees share
                  one recipient address for transfer verification.
                </p>
              </>
            )}
            {investmentRule && (
              <p className="hash">
                Pool: {policy.target.investment.pool}
                <br />
                Token: {policy.target.investment.token}
              </p>
            )}
          </details>
        </div>
      )}
      <div className="approval-actions">
        {challenge && !demo && (
          <>
            <p>
              Verification expires:{" "}
              {new Date(
                challenge.rpContext.expires_at * 1000,
              ).toLocaleTimeString("en-US")}
            </p>
            <button
              disabled={busy || open || !!error}
              onClick={() => setOpen(true)}
            >
              Verify with World and approve
            </button>
            <WorldWidget
              challenge={challenge}
              open={open}
              onOpenChange={(value) => {
                setOpen(value);
                if (!value && !completed.current && !finishing.current) {
                  generation.current++;
                  void apiPost("/api/world", {
                    action: "cancel",
                    id: challenge.id,
                  }).catch((e) => setError(String(e)));
                  setError(
                    "World verification closed. Settings have not been applied.",
                  );
                }
              }}
              description="Approve the displayed permissions and terms"
              handleVerify={async (proof) => {
                const attempt = challenge.attempt;
                if (attempt !== generation.current) return;
                finishing.current = true;
                setBusy(true);
                try {
                  await apiPost(
                    "/api/world",
                    {
                      action: "verify",
                      id: challenge.id,
                      proof,
                    },
                    120000,
                  );
                  if (attempt !== generation.current) return;
                  completed.current = true;
                  setOpen(false);
                  await onApproved();
                } catch (e) {
                  if (attempt === generation.current)
                    setError(
                      "Unable to confirm the result. Check the chat and execution records.",
                    );
                  throw e;
                } finally {
                  finishing.current = false;
                  if (attempt === generation.current) setBusy(false);
                }
              }}
              onError={(code, report) => {
                // Identifiers only; the report payloads can carry proofs.
                console.warn("World IDKit error", code, {
                  requestId: report?.request_id,
                  sdk: report?.package_version,
                  at: report?.generated_at,
                });
                setError(
                  `World verification failed (${code}). Start a new verification or continue as a demo.`,
                );
              }}
            />
          </>
        )}
        {world?.authMode === "local-demo" && !demo && (
          <button disabled={busy} onClick={() => void startDemo()}>
            Continue as demo
          </button>
        )}
        {demo && (
          <>
            <p>
              Demo approval: skips World proof of humanity. Verification
              expires:{" "}
              {new Date(demo.expiresAt * 1000).toLocaleTimeString("en-US")}
            </p>
            <button
              disabled={busy}
              onClick={async () => {
                const attempt = generation.current;
                setBusy(true);
                setError("");
                try {
                  await apiPost(
                    "/api/demo/approvals",
                    {
                      action: "confirm",
                      id: demo.id,
                    },
                    120000,
                  );
                  if (attempt !== generation.current) return;
                  completed.current = true;
                  await onApproved();
                } catch (e) {
                  if (attempt === generation.current) setError(String(e));
                } finally {
                  if (attempt === generation.current) setBusy(false);
                }
              }}
            >
              {busy
                ? (c?.id === "investment" && c.enabled) || investment?.enabled
                  ? "Approving and starting investment…"
                  : "Approving…"
                : "Approve these terms in demo"}
            </button>
          </>
        )}
        <button disabled={busy} onClick={() => void cancel()}>
          Cancel
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
