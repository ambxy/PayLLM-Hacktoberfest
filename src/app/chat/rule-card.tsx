import type { Proposal, Rule } from "@/shared/domain";
export function Conditions({ rule }: { rule: Proposal["conditions"] | Rule }) {
  return rule.id === "payment" && rule.paymentRecipients?.length ? (
    <div>
      {rule.paymentRecipients.map((recipient) => (
        <p key={recipient.recipientId}>
          {recipient.recipientId === "aoba"
            ? "Aoba Design"
            : recipient.recipientId === "sakura"
              ? "Sakura Office"
              : "Harp Card"}
          : Per payment ¥
          {BigInt(recipient.maxPaymentJpy).toLocaleString("en-US")} / Monthly
          total ¥{BigInt(recipient.monthlyLimitJpy).toLocaleString("en-US")} ·
          Pay on due date
        </p>
      ))}
    </div>
  ) : rule.id === "payment" ? (
    <p>
      Aoba Design · Per payment ¥
      {BigInt(rule.maxPaymentJpy).toLocaleString("en-US")} / Monthly total ¥
      {BigInt(rule.monthlyLimitJpy).toLocaleString("en-US")} · Pay on due date
    </p>
  ) : (
    <p>
      Investment limit per transaction ¥
      {BigInt(rule.maxInvestmentJpy).toLocaleString("en-US")} / Safety buffer ¥
      {BigInt(rule.safetyBufferJpy).toLocaleString("en-US")}
    </p>
  );
}
export function ProposalCard({
  proposal,
  snapshot,
}: {
  proposal: Proposal;
  snapshot?: Record<string, string>;
}) {
  return (
    <div className="card">
      <b>
        {proposal.kind === "payment"
          ? "Automatic payment proposal"
          : "Investment proposal"}
      </b>
      {snapshot && proposal.kind === "investment" ? (
        <>
          <dl className="proposal-allocation">
            <div>
              <dt>Current deposit</dt>
              <dd>¥{BigInt(snapshot.td).toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Funds to keep</dt>
              <dd>¥{BigInt(snapshot.reserveJpy).toLocaleString("en-US")}</dd>
            </div>
          </dl>
          <div className="proposal-reserve">
            <dl className="proposal-allocation">
              <div>
                <dt>Payments through month-end (including forecast)</dt>
                <dd>
                  ¥
                  {(
                    BigInt(snapshot.confirmedJpy) +
                    BigInt(snapshot.predictedJpy)
                  ).toLocaleString("en-US")}
                </dd>
              </div>
              <div>
                <dt>Safety buffer</dt>
                <dd>
                  ¥
                  {BigInt(
                    snapshot.bufferJpy ?? proposal.conditions.safetyBufferJpy,
                  ).toLocaleString("en-US")}
                </dd>
              </div>
              {BigInt(proposal.conditions.minimumBalanceJpy) > 0n && (
                <div>
                  <dt>Minimum deposit balance</dt>
                  <dd>
                    ¥
                    {BigInt(
                      proposal.conditions.minimumBalanceJpy,
                    ).toLocaleString("en-US")}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <dl className="proposal-allocation proposal-available">
            <div>
              <dt>Available for this investment</dt>
              <dd>¥{BigInt(snapshot.investJpy).toLocaleString("en-US")}</dd>
            </div>
          </dl>
          <p className="proposal-rule">
            Automatic investing is limited to ¥
            {BigInt(proposal.conditions.maxInvestmentJpy).toLocaleString(
              "en-US",
            )}{" "}
            per transaction. Funds for payments and the safety buffer stay in
            your account.
          </p>
        </>
      ) : (
        <Conditions rule={proposal.conditions} />
      )}
    </div>
  );
}
