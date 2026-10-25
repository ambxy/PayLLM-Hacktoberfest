import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
const directory = mkdtempSync(tmpdir() + "/short-demo-");
Object.assign(process.env, {
  DEMO_DB: directory + "/test.sqlite",
  BANK_AGENT_CREDENTIAL_FILE: directory + "/agent",
  BANK_AUTH_MODE: "local-demo",
  BANK_BIND_HOST: "127.0.0.1",
  PUBLIC_ASSET_MODE: "stub",
  PUBLIC_TRANSACTIONS_ENABLED: "false",
  DEMO_PROFILE: "standard",
  AI_MODE: "stub",
});
const auth = await import("../../src/server/auth");
const token = auth.issueHumanSession(null).token;
writeFileSync(
  process.env.BANK_AGENT_CREDENTIAL_FILE!,
  auth.issueAgentCredential().token,
  { mode: 0o600 },
);
const human = auth.authenticateRequest(
  new Request("http://127.0.0.1", {
    headers: { cookie: `bank_session=${token}` },
  }),
)!;
const agent = auth.internalAgentPrincipal();
const { reset, dashboard } = await import("../../src/features/demo/service");
const { chat } = await import("../../src/features/chat/service");
const { readCards } = await import("../../src/features/cards/service");
const { allowedCardIds, authorizations, revokeDelegation } = await import(
  "../../src/features/delegations/service"
);
const { grantPaymentDataRequest } = await import(
  "../../src/features/demo-plan/service"
);
const { advanceClock, clockStatus } = await import(
  "../../src/features/demo-plan/clock"
);
const { all, instance } = await import("../../src/server/records");
async function balances() {
  const data = await dashboard();
  assert.ok("td" in data);
  return data;
}
// The simulated adapter exposes the same funded-token stage as Sepolia.
await reset(human);
const stub = await import("../../src/integrations/aave/stub");
stub.fund("stage-check", "6250000000");
assert.equal((await balances()).looseUsdc, "6250000000");
assert.equal((await balances()).positionUsdc, "0");
stub.fund("stage-check", "6250000000");
assert.equal((await balances()).looseUsdc, "6250000000");
stub.deposit("stage-check", "6250000000");
assert.equal((await balances()).looseUsdc, "0");
assert.equal((await balances()).positionUsdc, "6250000000");
stub.deposit("stage-check", "6250000000");
assert.equal((await balances()).positionUsdc, "6250000000");
stub.withdrawAndReturn("stage-check-return", "6250000000");
await reset(human);
assert.throws(() => readCards(agent));
const messages = await chat(human, grantPaymentDataRequest);
assert.equal(messages.length, 2);
const plan = messages.at(-1)!;
assert.equal(plan.kind, "payment-plan");
assert.deepEqual(allowedCardIds(agent), ["harp-card-202609"]);
const proposal = plan.data!
  .proposal as import("../../src/shared/domain").Proposal;
assert.equal(proposal.conditions.maxInvestmentJpy, "1000000");
assert.equal(all("invoices").length, 3);
assert.equal(all("rules").length, 0);
assert.equal((await balances()).td, "1000000");
assert.equal((await balances()).looseUsdc, "0");
assert.equal((await balances()).positionUsdc, "0");
const { save } = await import("../../src/server/db");
const inventory = instance().treasuryUsdc;
save({ ...instance(), treasuryUsdc: "0" });
await chat(human, "はい", proposal.id);
assert.equal((await balances()).td, "1000000");
assert.equal(all("investment_orders").length, 0);
const approvedRules = JSON.stringify(all("rules"));
save({ ...instance(), treasuryUsdc: inventory });
await chat(human, "Yes", proposal.id);
assert.equal(JSON.stringify(all("rules")), approvedRules);
assert.equal(all("investment_orders").length, 4);
assert.equal((await balances()).td, "0");
assert.equal((await balances()).locked, "1000000");
assert.equal((await balances()).positionUsdc, "6250000000");
assert.equal(clockStatus().stages.length, 4);
await assert.rejects(chat(human, "Yes", proposal.id));
assert.equal(all("investment_orders").length, 4);
await assert.rejects(advanceClock(agent, "2026-09-30", randomUUID()));
const first = randomUUID();
await advanceClock(human, "2026-09-30", first);
assert.equal((await balances()).td, "0");
assert.equal((await balances()).locked, "1000000");
assert.equal((await balances()).recipientTd, "0");
await advanceClock(human, "2026-09-30", first);
await advanceClock(human, "2026-09-30", randomUUID());
assert.equal((await balances()).locked, "1000000");
await assert.rejects(advanceClock(human, "2026-10-01", first));
await assert.rejects(advanceClock(human, "2026-09-29", randomUUID()));
await advanceClock(human, "2026-10-01", randomUUID());
assert.equal((await balances()).td, "0");
assert.equal((await balances()).recipientTd, "200000");
assert.equal((await balances()).locked, "800000");
assert.equal((await balances()).positionUsdc, "5000000000");
await advanceClock(human, "2026-10-10", randomUUID());
assert.equal((await balances()).locked, "700000");
assert.equal((await balances()).recipientTd, "300000");
await advanceClock(human, "2026-10-20", randomUUID());
assert.equal((await balances()).locked, "400000");
assert.equal((await balances()).recipientTd, "600000");
assert.equal((await balances()).positionUsdc, "2500000000");
await advanceClock(human, "2026-10-20", randomUUID());
assert.equal((await balances()).recipientTd, "600000");
const card = all<import("../../src/shared/domain").Invoice>("invoices").find(
  (i) => i.source === "card",
)!;
assert.equal(card.status, "paid");
assert.equal(
  all<{ status: string }>("payment_history").filter(
    (p) => p.status === "confirmed",
  ).length,
  3,
);
// Revocation blocks reads and date changes before the clock moves.
const grant = authorizations(human).find((g) => g.cardIds?.length)!;
await revokeDelegation(grant.id, human);
assert.throws(() => readCards(agent));
await assert.rejects(advanceClock(human, "2026-10-21", randomUUID()));
assert.equal(instance().clock, "2026-10-20T03:00:00.000Z");
// Customer can still recover the remaining investment with an explicit request.
await chat(human, "Redeem all investments to TD");
assert.equal((await balances()).td, "400000");
assert.equal((await balances()).locked, "0");
await reset(human);
const second = await chat(human, grantPaymentDataRequest);
await chat(
  human,
  "Yes",
  (second.at(-1)!.data!.proposal as import("../../src/shared/domain").Proposal)
    .id,
);
await advanceClock(human, "2026-10-20", randomUUID());
assert.equal((await balances()).recipientTd, "600000");
assert.equal((await balances()).locked, "400000");
console.log(
  "Short demo: card permissions, full investment, partial withdrawals, payment dates, replay, revocation, and skipped dates passed.",
);
