import { type Principal } from "../../server/auth";
import {
  assertScope,
  allowedPaymentSourceIds,
  proposalBinding,
} from "../delegations/service";
import { assertRuleApproval } from "../world/service";
import "server-only";
import { randomUUID } from "node:crypto";
import { parseAbi, parseEventLogs } from "viem";
import { get, put, instance, all } from "../../server/records";
import { acquire, release } from "../../server/db";
import { serialized } from "../../server/mutex";
import { cashflow } from "../cashflow/service";
import { prepare, verify } from "../agents/service";
import { op, submit, receipt } from "../../integrations/td-ledger";
import {
  supplyAndDeposit,
  preflight,
  recordOrder,
  mode,
} from "../../integrations/aave";
import { message } from "../chat/service";
import type { Proposal, Rule, Run, Invoice } from "../../shared/domain";
export type Investment = {
  id: string;
  lockId: `0x${string}`;
  amountJpy: string;
  usdcUnits: string;
  status: "locked" | "invested" | "redeemed";
  customer: string;
  intentId: string;
  runId: string;
  allocationId?: string;
  publicOperationId?: string;
  funded?: boolean;
  consentId?: string;
};
export async function proposeInvestment(principal: Principal) {
  assertScope(principal, "propose");
  assertScope(principal, "mail");
  const mailIds = allowedPaymentSourceIds(principal);
  if (all<Invoice>("invoices").some((i) => !mailIds.includes(i.emailId)))
    throw new Error("Unpermitted source");
  if (!all<Invoice>("invoices").length) throw new Error("Read sources first");
  const maximum = instance().profile === "ten-usdc" ? "1600" : "400000";
  const proposedRule: Rule = {
    id: "investment",
    version: 0,
    enabled: true,
    recipientId: "",
    maxPaymentJpy: "0",
    monthlyLimitJpy: "0",
    safetyBufferJpy: "100000",
    maxInvestmentJpy: maximum,
    minimumBalanceJpy: "0",
    payAt: "dueDate",
    consentId: "",
  };
  const snapshot = await cashflow(proposedRule);
  const latestMailIds = allowedPaymentSourceIds(principal);
  if (all<Invoice>("invoices").some((i) => !latestMailIds.includes(i.emailId)))
    throw new Error("Mail permission changed");
  const id = randomUUID();
  put("cashflow_snapshots", { id, ...snapshot });
  const proposal = put<Proposal>("proposals", {
    id: randomUUID(),
    kind: "investment",
    ...proposalBinding(principal),
    status: "proposed",
    baseVersion: get<Rule>("rules", "investment")?.version ?? 0,
    sourceIds: [id],
    conditions: {
      id: "investment",
      enabled: true,
      recipientId: "",
      maxPaymentJpy: "0",
      monthlyLimitJpy: "0",
      safetyBufferJpy: "100000",
      maxInvestmentJpy: snapshot.investJpy,
      minimumBalanceJpy: "0",
      payAt: "dueDate",
    },
  });
  return { proposal, snapshot };
}
export async function invest(
  principal: Principal,
  requestId: string,
  approvedRule?: Pick<Rule, "version" | "consentId">,
  allocationId?: string,
) {
  assertScope(principal, "mail");
  const permittedMail = allowedPaymentSourceIds(principal);
  if (all<Invoice>("invoices").some((i) => !permittedMail.includes(i.emailId)))
    throw new Error("Unpermitted source");
  const delegation = assertScope(principal, "investment");
  const initialRule = get<Rule>("rules", "investment");
  if (!initialRule?.enabled) throw new Error("No authorized rule");
  if (
    approvedRule &&
    (initialRule.version !== approvedRule.version ||
      initialRule.consentId !== approvedRule.consentId)
  )
    throw new Error("Approved investment rule changed");
  assertRuleApproval(initialRule);
  const guard = () => {
    assertScope(principal, "mail");
    const ids = allowedPaymentSourceIds(principal);
    if (all<Invoice>("invoices").some((i) => !ids.includes(i.emailId)))
      throw new Error("Mail permission changed");
    const latest = assertScope(principal, "investment");
    const rule = get<Rule>("rules", "investment");
    if (
      latest.id !== delegation.id ||
      latest.version !== delegation.version ||
      !rule?.enabled ||
      rule.version !== initialRule.version
    )
      throw new Error("Authorization changed");
    assertRuleApproval(rule);
  };
  const existing = get<Run>("runs", requestId);
  if (existing) {
    if (existing.kind !== "investment")
      throw new Error("Request kind mismatch");
    return existing;
  }
  acquire(requestId);
  let run: Run = {
    id: requestId,
    status: "running",
    kind: "investment",
    steps: [],
  };
  put("runs", run);
  let submitted = false;
  try {
    let inactive = false;
    const s = instance();
    const prepared = await serialized(async () => {
      guard();
      const rule = get<Rule>("rules", "investment");
      if (!rule?.enabled) {
        inactive = true;
        return null;
      }
      assertRuleApproval(rule);
      const snapshot = await cashflow();
      if (rule.investmentAllocations) {
        const allocation = rule.investmentAllocations.find(
          (lot) => lot.id === allocationId,
        );
        if (!allocation || !approvedRule)
          throw new Error("Approved allocation required");
        if (
          all<Investment>("investment_orders").some(
            (order) =>
              order.consentId === rule.consentId &&
              order.allocationId === allocation.id,
          )
        )
          throw new Error("Allocation already invested");
        const used = all<Investment>("investment_orders")
          .filter((order) => order.consentId === rule.consentId)
          .reduce((sum, order) => sum + BigInt(order.amountJpy), 0n);
        if (
          used + BigInt(allocation.amountJpy) > BigInt(rule.maxInvestmentJpy) ||
          BigInt(allocation.amountJpy) > BigInt(snapshot.td)
        )
          throw new Error("Allocation exceeds approved balance");
        snapshot.investJpy = allocation.amountJpy;
        snapshot.usdcUnits = (BigInt(allocation.amountJpy) * 6250n).toString();
      }
      const amount = BigInt(snapshot.investJpy);
      if (amount === 0n) return null;
      const snapshotId = randomUUID();
      put("cashflow_snapshots", {
        id: snapshotId,
        ...snapshot,
        ruleVersion: rule.version,
      });
      const intent = await prepare(principal, {
        kind: "investment",
        sourceId: snapshotId,
        ruleVersion: rule.version,
        amountJpy: snapshot.investJpy,
        usdcUnits: snapshot.usdcUnits,
        recipient: s.vault,
      });
      await verify(principal, intent);
      if (
        get<Rule>("rules", "investment")?.version !== intent.ruleVersion ||
        intent.amountJpy !== snapshot.investJpy ||
        intent.usdcUnits !== snapshot.usdcUnits ||
        intent.recipient !== s.vault
      )
        throw new Error("Investment mismatch");
      await preflight(snapshot.usdcUnits);
      const lockId = op(s.id + ":" + intent.id + ":lock");
      const order: Investment = {
        id: intent.id,
        lockId,
        amountJpy: snapshot.investJpy,
        usdcUnits: snapshot.usdcUnits,
        status: "locked",
        customer: s.customer,
        intentId: intent.id,
        runId: requestId,
        ...(allocationId ? { allocationId, consentId: rule.consentId } : {}),
      };
      run = {
        ...run,
        intentId: intent.id,
        sourceId: snapshotId,
        ruleVersion: rule.version,
      };
      put("runs", run);
      guard();
      submitted = true;
      const hash = await submit(
        s.vault,
        "TDLockVault",
        "lockFor",
        [s.customer, amount, lockId],
        guard,
      );
      return { order, hash };
    });
    if (prepared) {
      const { order, hash } = prepared;
      const r = await receipt(hash);
      const event = parseEventLogs({
        abi: parseAbi([
          "event Locked(bytes32 indexed lockId,address indexed customer,uint256 amount)",
        ]),
        logs: r.logs.filter(
          (l) => l.address.toLowerCase() === s.vault.toLowerCase(),
        ),
      }).find((e) => e.args.lockId === order.lockId);
      if (
        !event ||
        event.args.amount !== BigInt(order.amountJpy) ||
        event.args.customer.toLowerCase() !== s.customer.toLowerCase()
      )
        throw new Error("Lock evidence mismatch");
      put("investment_orders", order);
      recordOrder(order.id, order.usdcUnits, order.lockId);
      run.steps.push({
        label: "Lock TD in the reserve account",
        mode: "anvil",
        hash,
        block: r.blockNumber.toString(),
      });
      put("runs", run);
      const publicResult = await supplyAndDeposit(
        order.id,
        order.usdcUnits,
        guard,
      );
      run.steps.push(...publicResult.steps);
      put("investment_orders", { ...order, status: "invested" });
    }
    run.status = "completed";
    put("runs", run);
    release(requestId);
    if (!allocationId)
      message(
        "assistant",
        prepared
          ? `Started investing ¥${BigInt(prepared.order.amountJpy).toLocaleString("en-US")} from your deposit account in Aave.${mode() === "sepolia" ? "" : " (Simulation)"}`
          : inactive
            ? "No investment was made because automatic investing is disabled."
            : "No additional funds are available to invest.",
        "execution",
        { run },
      );
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
