import type { Invoice, Proposal } from "@/shared/domain";
const yen = (value: bigint | string) =>
  `¥${BigInt(value).toLocaleString("en-US")}`;
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
  });
export function PaymentPlanCard({
  proposal,
  invoices,
  depositJpy,
}: {
  proposal: Proposal;
  invoices: Invoice[];
  depositJpy: string;
}) {
  let invested = BigInt(depositJpy);
  const dates = [...new Set(invoices.map((i) => i.dueAt))].sort();
  return (
    <div className="card payment-plan-card">
      <h3>Payments and investment plan</h3>
      <ul className="plan-payment-sources">
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            <b>
              {invoice.source === "card" ? invoice.cardName : invoice.issuer}
            </b>
            <span>
              {invoice.source === "card"
                ? `Card •••• ${invoice.cardLast4}`
                : "Invoice"}{" "}
              · Due {date(invoice.dueAt)}
            </span>
            <strong>{yen(invoice.amountJpy)}</strong>
          </li>
        ))}
      </ul>
      <p>
        Invest the full deposit: <strong>{yen(depositJpy)}</strong>
      </p>
      <ol className="plan-investment-dates">
        {dates.map((due) => {
          const amount = invoices
            .filter((i) => i.dueAt === due)
            .reduce((sum, i) => sum + BigInt(i.amountJpy), 0n);
          const current = invested;
          invested -= amount;
          return (
            <li key={due}>
              <span>Until {date(due)}</span>
              <strong>{yen(current)}</strong>
              <small>Payment: {yen(amount)}</small>
            </li>
          );
        })}
      </ol>
      <p>{yen(invested)} stays invested after the last payment.</p>
      <p>
        Withdraw each payment amount to your deposit account on its due date.
        Reply “Yes” to schedule these payments and start investing in Aave.
      </p>
      <details>
        <summary>Approval terms</summary>
        <p>
          Investment limit: {yen(proposal.conditions.maxInvestmentJpy)}. Safety
          buffer: ¥0. Minimum deposit balance: ¥0. Payments are limited to the
          listed recipients and amounts.
        </p>
      </details>
    </div>
  );
}
