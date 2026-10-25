"use client";
import { apiFetch, apiPost } from "../api-client";
import { WorldApproval, type WorldRequest } from "../world-approval";
import { DemoControls } from "../demo-controls";
import { PaymentPlanCard } from "./payment-plan-card";
import { Conditions, ProposalCard } from "./rule-card";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Message, Invoice, Mail, Proposal, Rule } from "@/shared/domain";
export function AgentPanel() {
  const conversation = useRef<HTMLElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [approval, setApproval] = useState<{
    input: WorldRequest;
    text: string;
  }>();
  const [mailPermission, setMailPermission] = useState<{
    proposalId: string;
    text: string;
    mailIds: string[];
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let generation = 0;
    const refresh = () => {
      const attempt = ++generation;
      void apiFetch("/api/chat/messages").then(async (r) => {
        if (r.ok) {
          const next = await r.json();
          if (attempt === generation) setMessages(next);
        }
      });
    };
    const reset = () => {
      generation++;
      setMessages([]);
      setApproval(undefined);
      setMailPermission(undefined);
      setError("");
      refresh();
    };
    refresh();
    window.addEventListener("agent-bank:messages-updated", refresh);
    window.addEventListener("agent-bank:demo-reset", reset);
    return () => {
      generation++;
      window.removeEventListener("agent-bank:messages-updated", refresh);
      window.removeEventListener("agent-bank:demo-reset", reset);
    };
  }, []);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = conversation.current;
      container?.scrollTo({
        top: container.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, pendingText]);
  async function send(value: string) {
    const proposalId = (
      messages
        .filter((m) => m.kind === "proposal" || m.kind === "payment-plan")
        .at(-1)?.data?.proposal as Proposal | undefined
    )?.id;
    const startedAt = Date.now();
    setPendingText(value);
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          proposalId,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(
          body.error ??
            "Unable to complete the operation. Check your settings and execution records.",
        );
      }
      const remainingDelay = 1000 - (Date.now() - startedAt);
      if (remainingDelay > 0)
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
      const next: Message[] = await r.json();
      setMessages(next);
      if (
        next.at(-1)?.kind !== "approval-request" &&
        next.at(-1)?.kind !== "mail-permission-request"
      )
        document.querySelector<HTMLDialogElement>(".demo-drawer")?.close();
      const last = next.at(-1);
      setApproval(
        last?.kind === "approval-request"
          ? { input: last.data?.input as WorldRequest, text: value }
          : undefined,
      );
      setMailPermission(
        last?.kind === "mail-permission-request"
          ? {
              proposalId: last.data?.proposalId as string,
              mailIds: last.data?.mailIds as string[],
              text: value,
            }
          : undefined,
      );
      window.dispatchEvent(new Event("agent-bank:invoices-updated"));
      window.dispatchEvent(new Event("agent-bank:rules-updated"));
      setText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setPendingText("");
      setBusy(false);
    }
  }
  const pendingPlan = messages.some(
    (m) =>
      m.kind === "payment-plan" &&
      (m.data?.proposal as Proposal)?.status === "proposed",
  );
  return (
    <aside id="agent-panel" className="agent-panel" aria-label="Agent chat">
      <header className="agent-panel-header">
        <span className="agent-avatar" aria-hidden="true" />
        <h2>Agent</h2>
      </header>
      <section
        ref={conversation}
        className="agent-conversation"
        aria-live="polite"
      >
        {messages.map((m) => (
          <article
            className={"message " + m.role + (m.kind ? " kind-" + m.kind : "")}
            key={m.id}
          >
            <small>{m.role === "user" ? "You" : "Agent"}</small>
            <p>
              {m.text
                .replace(
                  /^¥([\d,]+) locked in the reserve account; [\d,.]+ test USDC equivalent invested in (Aave on Sepolia|simulation)\.$/,
                  (_, amount: string, destination: string) =>
                    `Started investing ¥${amount} from your deposit account in Aave.${destination === "simulation" ? " (Simulation)" : ""}`,
                )
                .replace(
                  /^¥([\d,]+)を別段口座にlockし、[\d,.]+擬似USDC相当を(SepoliaのAaveで運用しました|模擬運用しました)。$/,
                  (_, amount: string, destination: string) =>
                    `Started investing ¥${amount} from your deposit account in Aave.${destination === "模擬運用しました" ? " (Simulation)" : ""}`,
                )}
            </p>
            {m.kind === "invoices" &&
              (m.data?.invoices as Invoice[]).map((i) => {
                const mail = (m.data?.emails as Mail[] | undefined)?.find(
                  (item) => item.id === i.emailId,
                );
                return (
                  <div className="card" key={i.id}>
                    <b>{i.issuer}</b>
                    <p>
                      ¥{BigInt(i.amountJpy).toLocaleString("en-US")} · Due date{" "}
                      {new Date(i.dueAt).toLocaleString("en-US", {
                        timeZone: "Asia/Tokyo",
                      })}
                    </p>
                    {mail && (
                      <details>
                        <summary>View source email</summary>
                        <p>
                          {mail.sender} · {mail.subject}
                        </p>
                        <p>{mail.body}</p>
                      </details>
                    )}
                  </div>
                );
              })}
            {m.kind === "payment-plan" && (
              <PaymentPlanCard
                proposal={m.data?.proposal as Proposal}
                invoices={m.data?.invoices as Invoice[]}
                depositJpy={m.data?.depositJpy as string}
              />
            )}
            {m.kind === "proposal" && (
              <ProposalCard
                proposal={m.data?.proposal as Proposal}
                snapshot={
                  m.data?.snapshot as Record<string, string> | undefined
                }
              />
            )}
            {m.kind === "rule" && (
              <div className="card">
                <b>Approval</b>
                <Conditions rule={m.data?.rule as Rule} />
              </div>
            )}
          </article>
        ))}
        {pendingText && (
          <article className="message user pending-message">
            <small>You</small>
            <p>{pendingText}</p>
          </article>
        )}
        {busy && (
          <article
            className="message agent typing-indicator"
            role="status"
            aria-label="Agent is preparing a reply"
          >
            <small>Agent</small>
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </article>
        )}
      </section>
      <div className="chat-plan-actions">
        {pendingPlan && (
          <button
            disabled={busy || !!approval || !!mailPermission}
            onClick={() => void send("Yes")}
          >
            Yes
          </button>
        )}
      </div>
      <DemoControls
        onGrantAccess={() =>
          void send(
            "I grant access to my card payment information and invoices.",
          )
        }
        onRedeem={() => void send("Redeem all investments to TD")}
        chatBusy={busy || !!approval || !!mailPermission}
      />
      <form
        className="agent-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="composer">
          <input
            id="chat-input"
            aria-label="Message the agent"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about payments, investments, or rules…"
          />
          <button
            disabled={busy || !!approval || !!mailPermission || !text.trim()}
          >
            Send
          </button>
        </div>
      </form>
      {mailPermission && (
        <section
          className="panel approval-policy"
          aria-label="Email access confirmation"
        >
          <h2>Allow email access</h2>
          <p>Agent: bank-agent</p>
          <p>
            Allowed actions: read banking data, propose terms, and read selected
            emails
          </p>
          <p>
            Email access:{" "}
            {mailPermission.mailIds
              .map((id) =>
                id === "aoba-mail"
                  ? "Aoba Design sample email"
                  : "Sakura Office sample email",
              )
              .join(", ")}
          </p>
          <div className="approval-actions">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiPost("/api/delegations/confirm", {
                    proposalId: mailPermission.proposalId,
                  });
                  const request = mailPermission.text;
                  setMailPermission(undefined);
                  setBusy(false);
                  await send(request);
                } catch (e) {
                  setError(String(e));
                  setBusy(false);
                }
              }}
            >
              Authorize and review
            </button>
            <button
              disabled={busy}
              onClick={() => setMailPermission(undefined)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {approval && (
        <WorldApproval
          input={approval.input}
          onCancel={() => {
            setApproval(undefined);
            setError("Approval canceled. Your settings have not changed.");
          }}
          onApproved={async () => {
            const completed = approval;
            setApproval(undefined);
            if (completed.input.purpose === "delegation")
              await send(completed.text);
            else {
              window.dispatchEvent(new Event("agent-bank:invoices-updated"));
              window.dispatchEvent(new Event("agent-bank:rules-updated"));
              const response = await apiFetch("/api/chat/messages");
              if (!response.ok)
                throw new Error("Unable to load the latest conversation.");
              setMessages(await response.json());
            }
          }}
        />
      )}
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
