import { type Principal } from "../../server/auth";
import { assertScope, allowedPaymentSourceIds } from "../delegations/service";
import { assertRuleApproval } from "../world/service";
import "server-only";
import { parseAbi, parseEventLogs } from "viem";
import { all, get, put, instance } from "../../server/records";
import { acquire, release, save, sqlite } from "../../server/db";
import { serialized } from "../../server/mutex";
import { prepare, verify } from "../agents/service";
import { balance, submit, receipt, op } from "../../integrations/td-ledger";
import { message } from "../chat/service";
import { paymentLimit } from "../rules/payment-limits";
import type { Invoice, Rule, Payment, Run } from "../../shared/domain";
export const month = (time: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(time));
export function monthlyUsed(recipientId: string, time: string) {
  return all<Payment>("payment_history")
    .filter(
      (p) => p.recipientId === recipientId && month(p.paidAt) === month(time),
    )
    .reduce((sum, p) => sum + BigInt(p.amountJpy), 0n);
}
export async function payDue(
  principal: Principal,
  requestId: string,
  useCurrentClock = false,
) {
  const delegation = assertScope(principal, "payment");
  const initialRule = get<Rule>("rules", "payment");
  if (!initialRule?.enabled) throw new Error("No authorized rule");
  assertRuleApproval(initialRule);
  const guard = () => {
    assertScope(principal, "mail");
    const latest = assertScope(principal, "payment");
    const rule = get<Rule>("rules", "payment");
    if (
      latest.id !== delegation.id ||
      latest.version !== delegation.version ||
      !rule?.enabled ||
      rule.version !== initialRule.version
    )
      throw new Error("Authorization changed");
    assertRuleApproval(rule);
  };
  assertScope(principal, "mail");
  const mailIds = allowedPaymentSourceIds(principal);
  const existing = get<Run>("runs", requestId);
  if (existing) {
    if (existing.kind !== "payment") throw new Error("Request kind mismatch");
    return existing;
  }
  acquire(requestId);
  let run: Run = {
    id: requestId,
    status: "running",
    kind: "payment",
    steps: [],
  };
  put("runs", run);
  let submitted = false;
  try {
    const s = instance();
    if (!useCurrentClock && s.clock < "2026-10-01T03:00:00.000Z") {
      s.clock = "2026-10-01T03:00:00.000Z";
      save(s);
    }
    const due = all<Invoice>("invoices")
      .filter(
        (i) =>
          mailIds.includes(i.emailId) &&
          i.status === "scheduled" &&
          Date.parse(i.dueAt) <= Date.parse(s.clock),
      )
      .sort(
        (a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id),
      );
    for (const invoice of due) {
      guard();
      const activeRule = get<Rule>("rules", "payment");
      if (
        !activeRule?.enabled ||
        !paymentLimit(activeRule, invoice.recipientId)
      )
        continue;
      const result = await serialized(async () => {
        guard();
        const rule = get<Rule>("rules", "payment");
        const limit = rule && paymentLimit(rule, invoice.recipientId);
        if (!rule?.enabled || !limit) throw new Error("No authorized rule");
        assertRuleApproval(rule);
        const amount = BigInt(invoice.amountJpy);
        const available = BigInt(await balance(s.token, s.customer));
        if (
          amount > BigInt(limit.maxPaymentJpy) ||
          monthlyUsed(invoice.recipientId, s.clock) + amount >
            BigInt(limit.monthlyLimitJpy) ||
          available - amount < BigInt(rule.minimumBalanceJpy)
        )
          throw new Error("Policy mismatch");
        if (get<Payment>("payment_history", invoice.id))
          throw new Error("Already reserved");
        const intent = await prepare(principal, {
          kind: "payment",
          sourceId: invoice.id,
          ruleVersion: rule.version,
          amountJpy: invoice.amountJpy,
          recipient: s.recipient,
        });
        await verify(principal, intent);
        if (
          intent.amountJpy !== invoice.amountJpy ||
          intent.recipient !== s.recipient ||
          get<Rule>("rules", "payment")?.version !== intent.ruleVersion
        )
          throw new Error("Intent mismatch");
        put<Payment>("payment_history", {
          id: invoice.id,
          recipientId: invoice.recipientId,
          amountJpy: invoice.amountJpy,
          paidAt: s.clock,
          recurrenceKey: invoice.recurrenceKey,
          status: "reserved",
          source: "execution",
        });
        run = {
          ...run,
          intentId: intent.id,
          sourceId: invoice.id,
          ruleVersion: rule.version,
        };
        put("runs", run);
        const operationId = op(s.id + ":" + invoice.id + ":payment");
        guard();
        if (!allowedPaymentSourceIds(principal).includes(invoice.emailId))
          throw new Error("Mail permission changed");
        submitted = true;
        const hash = await submit(
          s.token,
          "BankTD",
          "bankTransfer",
          [s.customer, s.recipient, amount, operationId],
          () => {
            guard();
            if (!allowedPaymentSourceIds(principal).includes(invoice.emailId))
              throw new Error("Mail permission changed");
          },
        );
        return { hash, operationId };
      });
      const r = await receipt(result.hash);
      const event = parseEventLogs({
        abi: parseAbi([
          "event Operation(bytes32 indexed operationId,address indexed from,address indexed to,uint256 amount)",
        ]),
        logs: r.logs.filter(
          (l) => l.address.toLowerCase() === s.token.toLowerCase(),
        ),
      }).find((e) => e.args.operationId === result.operationId);
      if (
        !event ||
        event.args.amount !== BigInt(invoice.amountJpy) ||
        event.args.to.toLowerCase() !== s.recipient.toLowerCase() ||
        event.args.from.toLowerCase() !== s.customer.toLowerCase()
      )
        throw new Error("Receipt mismatch");
      sqlite.transaction(() => {
        put("invoices", { ...invoice, status: "paid" });
        const payment = get<Payment>("payment_history", invoice.id)!;
        put("payment_history", {
          ...payment,
          status: "confirmed",
          hash: r.transactionHash,
        });
        run.steps.push({
          label: "Invoice payment confirmed in TD",
          mode: "anvil",
          hash: r.transactionHash,
          block: r.blockNumber.toString(),
        });
        put("runs", run);
      })();
      message(
        "assistant",
        `Paid ¥${BigInt(invoice.amountJpy).toLocaleString("en-US")} to ${invoice.issuer}.`,
        "execution",
        { run: { ...run, status: "completed" } },
      );
    }
    run.status = "completed";
    put("runs", run);
    release(requestId);
    return run;
  } catch (e) {
    put("runs", {
      ...run,
      status: "needs_attention",
      error: e instanceof Error ? e.message : "Execution failed",
    });
    if (!submitted) release(requestId);
    throw e;
  }
}
