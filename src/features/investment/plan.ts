import "server-only";
import { parseAbi, parseEventLogs } from "viem";
import type { Principal } from "@/server/auth";
import { acquire, release } from "@/server/db";
import { all, get, instance, put } from "@/server/records";
import { serialized } from "@/server/mutex";
import type { Rule, Run, Invoice } from "@/shared/domain";
import {
  allowedPaymentSourceIds,
  assertScope,
} from "@/features/delegations/service";
import { assertRuleApproval } from "@/features/world/service";
import { prepare, verify } from "@/features/agents/service";
import { balance, op, receipt, submit } from "@/integrations/td-ledger";
import { preflight, recordOrder, fund, deposit } from "@/integrations/aave";
import type { Investment } from "./service";

// These failures happen before an intent or transaction is created.
export function canRetryPlan(run: Run | undefined) {
  return (
    !!run &&
    run.kind === "investment" &&
    run.status === "needs_attention" &&
    !run.intentId &&
    run.steps.length === 0 &&
    [
      "Bank USDC inventory insufficient",
      "Stub inventory insufficient",
      "Sepolia gas balance insufficient",
      "Public transaction execution is not enabled",
      "Insufficient deposit balance",
    ].includes(run.error ?? "")
  );
}

export async function investPlan(principal: Principal, approved: Rule) {
  const id = approved.consentId;
  const delegation = assertScope(principal, "investment");
  const guard = () => {
    const latest = assertScope(principal, "investment");
    const rule = get<Rule>("rules", "investment");
    if (
      !rule?.enabled ||
      rule.version !== approved.version ||
      rule.consentId !== id ||
      latest.id !== delegation.id ||
      latest.version !== delegation.version
    )
      throw new Error("Authorization changed");
    assertRuleApproval(rule);
    const permitted = allowedPaymentSourceIds(principal);
    if (all<Invoice>("invoices").some((i) => !permitted.includes(i.emailId)))
      throw new Error("Source permission changed");
    return rule;
  };
  const rule = guard();
  const existing = get<Run>("runs", id);
  if (existing) {
    if (existing.kind !== "investment")
      throw new Error("Request kind mismatch");
    if (!canRetryPlan(existing)) return existing;
  }
  const lots = rule.investmentAllocations;
  if (!lots?.length)
    throw new Error("Approved investment allocations required");
  const total = lots.reduce((sum, lot) => sum + BigInt(lot.amountJpy), 0n);
  if (total !== BigInt(rule.maxInvestmentJpy))
    throw new Error("Allocation total mismatch");
  acquire(id);
  const run: Run = {
    id,
    kind: "investment",
    status: "running",
    steps: [],
    ruleVersion: rule.version,
  };
  put("runs", run);
  let submitted = false;
  try {
    const s = instance();
    const units = (total * 6250n).toString();
    const prepared = await serialized(async () => {
      guard();
      if (
        all<Investment>("investment_orders").some(
          (order) => order.consentId === id,
        )
      )
        throw new Error("Plan already invested");
      if (BigInt(await balance(s.token, s.customer)) < total)
        throw new Error("Insufficient deposit balance");
      await preflight(units);
      const intent = await prepare(principal, {
        kind: "investment",
        sourceId: id,
        ruleVersion: rule.version,
        amountJpy: total.toString(),
        usdcUnits: units,
        recipient: s.vault,
        consentId: id,
      });
      await verify(principal, intent);
      const orders: Investment[] = lots.map((lot) => ({
        id: intent.id + ":" + lot.id,
        lockId: op(s.id + ":" + intent.id + ":" + lot.id),
        amountJpy: lot.amountJpy,
        usdcUnits: (BigInt(lot.amountJpy) * 6250n).toString(),
        status: "locked",
        customer: s.customer,
        intentId: intent.id,
        runId: id,
        allocationId: lot.id,
        consentId: id,
        publicOperationId: id,
      }));
      run.intentId = intent.id;
      put("runs", run);
      guard();
      submitted = true;
      const hash = await submit(
        s.vault,
        "TDLockVault",
        "lockBatchFor",
        [
          s.customer,
          orders.map((order) => BigInt(order.amountJpy)),
          orders.map((order) => order.lockId),
        ],
        guard,
      );
      return { orders, hash };
    });
    const { orders, hash } = prepared;
    const r = await receipt(hash);
    const events = parseEventLogs({
      abi: parseAbi([
        "event Locked(bytes32 indexed lockId,address indexed customer,uint256 amount)",
      ]),
      logs: r.logs.filter(
        (log) => log.address.toLowerCase() === s.vault.toLowerCase(),
      ),
    });
    for (const order of orders) {
      if (
        !events.some(
          (event) =>
            event.args.lockId === order.lockId &&
            event.args.amount === BigInt(order.amountJpy) &&
            event.args.customer.toLowerCase() === s.customer.toLowerCase(),
        )
      )
        throw new Error("Lock evidence mismatch");
    }
    for (const order of orders) {
      put("investment_orders", order);
      recordOrder(order.id, order.usdcUnits, order.lockId);
    }
    run.steps.push({
      label: "Reserve the full deposit for investment",
      mode: "anvil",
      hash,
      block: r.blockNumber.toString(),
    });
    put("runs", run);
    const funded = await fund(id, units, guard);
    run.steps.push(...funded.steps);
    for (const order of orders)
      put("investment_orders", { ...order, funded: true });
    put("runs", run);
    const supplied = await deposit(
      id,
      units,
      guard,
      orders.map((order) => order.id),
    );
    run.steps.push(...supplied.steps);
    for (const order of orders)
      put("investment_orders", { ...order, funded: true, status: "invested" });
    run.status = "completed";
    put("runs", run);
    release(id);
    return run;
  } catch (error) {
    put("runs", {
      ...run,
      status: "needs_attention",
      error: error instanceof Error ? error.message : "Investment failed",
    });
    if (!submitted) release(id);
    throw error;
  }
}
