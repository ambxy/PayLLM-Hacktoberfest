"use client";
import { apiFetch } from "../api-client";
import { useEffect, useState } from "react";
import type { Invoice, Rule } from "@/shared/domain";

const yen = (amount: string | bigint) =>
  `¥${BigInt(amount).toLocaleString("en-US")}`;
const dateKey = (value: string) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });

export default function Investment() {
  const [plan, setPlan] = useState<{ rule?: Rule; invoices: Invoice[] }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [rulesResponse, invoicesResponse] = await Promise.all([
          apiFetch("/api/rules"),
          apiFetch("/api/invoices"),
        ]);
        if (!rulesResponse.ok || !invoicesResponse.ok)
          throw new Error("Unable to load the investment plan.");
        const rules: Rule[] = await rulesResponse.json();
        const { invoices }: { invoices: Invoice[] } =
          await invoicesResponse.json();
        if (active) {
          setPlan({
            rule: rules.find((rule) => rule.id === "investment"),
            invoices,
          });
          setError("");
        }
      } catch {
        if (active) setError("Unable to load the investment plan.");
      }
    };
    const refresh = () => void load();
    refresh();
    window.addEventListener("agent-bank:invoices-updated", refresh);
    window.addEventListener("agent-bank:rules-updated", refresh);
    window.addEventListener("agent-bank:demo-reset", refresh);
    return () => {
      active = false;
      window.removeEventListener("agent-bank:invoices-updated", refresh);
      window.removeEventListener("agent-bank:rules-updated", refresh);
      window.removeEventListener("agent-bank:demo-reset", refresh);
    };
  }, []);
  const rule = plan?.rule;
  const allocations = rule?.investmentAllocations;
  const invoices =
    plan?.invoices.filter(
      (invoice) =>
        !allocations || allocations.some((lot) => lot.paymentId === invoice.id),
    ) ?? [];
  const dates = [
    ...new Set(invoices.map((invoice) => dateKey(invoice.dueAt))),
  ].sort();
  let remaining = BigInt(rule?.maxInvestmentJpy ?? "0");
  return (
    <>
      <header>
        <h1>Investment plan</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      {!plan && !error && <p role="status">Loading…</p>}
      {plan && !rule && (
        <section className="panel">
          Approve a payment and investment plan in chat to see the schedule.
        </section>
      )}
      {rule && (
        <section
          className="panel investment-schedule"
          aria-label="Investment schedule"
        >
          {!rule.enabled && <p>Automatic investing is paused.</p>}
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  {rule.approvedDemoDate && (
                    <time dateTime={dateKey(rule.approvedDemoDate)}>
                      {new Date(rule.approvedDemoDate).toLocaleDateString(
                        "en-US",
                        {
                          timeZone: "Asia/Tokyo",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </time>
                  )}
                </th>
                <td>
                  Invest <strong>{yen(rule.maxInvestmentJpy)}</strong> in Aave.
                </td>
              </tr>
              {dates.map((date) => {
                const payments = invoices.filter(
                  (invoice) => dateKey(invoice.dueAt) === date,
                );
                const amount = payments.reduce(
                  (sum, invoice) => sum + BigInt(invoice.amountJpy),
                  0n,
                );
                remaining -= amount;
                return (
                  <tr key={date}>
                    <th scope="row">
                      <time dateTime={date}>
                        {new Date(date + "T12:00:00+09:00").toLocaleDateString(
                          "en-US",
                          {
                            timeZone: "Asia/Tokyo",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </time>
                    </th>
                    <td>
                      {allocations && (
                        <p>
                          Return <strong>{yen(amount)}</strong> from Aave to
                          your deposit account.
                        </p>
                      )}
                      {payments.map((invoice) => (
                        <p key={invoice.id}>
                          {invoice.status === "paid" ? "Paid" : "Pay"}{" "}
                          <strong>{yen(invoice.amountJpy)}</strong> to{" "}
                          {invoice.source === "card"
                            ? invoice.cardName
                            : invoice.issuer}
                          .
                        </p>
                      ))}
                      {allocations && (
                        <p className="schedule-remaining">
                          Keep {yen(remaining)} invested in Aave.
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
