import { randomUUID } from "node:crypto";
import {
  requirePrincipal,
  requireCredential,
  fixedAgentId,
  type Principal,
} from "../../server/auth";
import "server-only";
import { addresses } from "../../integrations/aave/config";
import { publicChainId } from "../../integrations/custody";
import { parseAbi, parseEventLogs, keccak256, encodeAbiParameters } from "viem";
import { all, get, put, instance } from "../../server/records";
import { acquire, release } from "../../server/db";
import { serialized } from "../../server/mutex";
import {
  client,
  artifact,
  submit,
  receipt,
  op,
} from "../../integrations/td-ledger";
import {
  withdrawAndReturn,
  verifyReturn,
  markRedeemed,
  mode,
} from "../../integrations/aave";
import { prepare, verify } from "../agents/service";
import { message } from "../chat/service";
import type { Investment } from "./service";
import type { Run } from "../../shared/domain";
export const redemptionRequest = "Redeem all investments to TD";
type RedemptionRequest = {
  id: string;
  accountId: string;
  humanCredentialId: string;
  agentId: string;
  instanceId: string;
  authMode: string;
  generation: number;
  orders: Investment[];
  expiresAt: number;
  status: "pending" | "executing" | "completed";
};
export function createRedemptionRequest(
  principal: Principal,
  orderIds?: string[],
) {
  requirePrincipal(principal, "human");
  const orders = all<Investment>("investment_orders").filter(
    (o) => o.status === "invested" && (!orderIds || orderIds.includes(o.id)),
  );
  if (!orders.length || (orderIds && orders.length !== new Set(orderIds).size))
    throw new Error("No matching invested position");
  return put<RedemptionRequest>("redemption_requests", {
    id: randomUUID(),
    accountId: principal.accountId,
    humanCredentialId: principal.credentialId,
    agentId: fixedAgentId,
    instanceId: instance().id,
    authMode: principal.authMode,
    generation: principal.generation,
    orders,
    expiresAt: Math.min(Date.now() + 300000, principal.expiresAt),
    status: "pending",
  });
}
export async function redeem(
  principal: Principal,
  messageId: string,
  externalGuard?: () => void,
) {
  requirePrincipal(principal, "agent");
  const request = get<RedemptionRequest>("redemption_requests", messageId);
  const guard = () => {
    externalGuard?.();
    requirePrincipal(principal, "agent");
    if (
      !request ||
      request.accountId !== principal.accountId ||
      request.agentId !== principal.agentId ||
      request.instanceId !== instance().id ||
      request.authMode !== principal.authMode ||
      request.generation !== principal.generation ||
      request.expiresAt <= Date.now()
    )
      throw new Error("Explicit bank-issued redemption request required");
    requireCredential(request.humanCredentialId, "human", request.accountId);
    return { id: request.id, version: 1 };
  };
  guard();
  const existing = get<Run>("runs", messageId);
  if (existing) {
    if (existing.kind !== "redemption")
      throw new Error("Request kind mismatch");
    return existing;
  }
  if (request!.status !== "pending")
    throw new Error("Redemption already consumed");
  const orders = request!.orders;
  for (const order of orders) {
    const current = get<Investment>("investment_orders", order.id);
    if (
      !current ||
      current.status !== "invested" ||
      JSON.stringify(current) !== JSON.stringify(order)
    )
      throw new Error("Position changed");
  }
  if (!orders.length) throw new Error("No invested position");
  const s = instance();
  if (
    orders.some(
      (order) => order.customer.toLowerCase() !== s.customer.toLowerCase(),
    )
  )
    throw new Error("Owner mismatch");
  const total = orders.reduce(
    (sum, order) => sum + BigInt(order.amountJpy),
    0n,
  );
  acquire(messageId);
  put("redemption_requests", { ...request!, status: "executing" });
  const run: Run = {
    id: messageId,
    status: "running",
    kind: "redemption",
    sourceId: orders.map((o) => o.id).join(", "),
    steps: [],
  };
  put("runs", run);
  try {
    for (const order of orders) {
      const returnId = messageId + ":" + order.id;
      const intent = await prepare(
        principal,
        {
          kind: "redemption",
          sourceId: order.id,
          ruleVersion: 0,
          amountJpy: order.amountJpy,
          usdcUnits: order.usdcUnits,
          recipient: s.customer,
          consentId: messageId,
        },
        guard,
      );
      await verify(principal, intent, guard);
      run.intentId = intent.id;
      put("runs", run);
      const lock = (await client.readContract({
        address: s.vault,
        abi: artifact("TDLockVault").abi,
        functionName: "locks",
        args: [order.lockId],
      })) as [string, bigint, bigint];
      if (
        lock[0].toLowerCase() !== s.customer.toLowerCase() ||
        lock[2] !== BigInt(intent.amountJpy) ||
        BigInt(intent.usdcUnits) !== BigInt(intent.amountJpy) * 6250n ||
        intent.consentId !== messageId ||
        intent.recipient !== s.customer
      )
        throw new Error("Redemption mismatch");
      const redemptionId = op(s.id + ":" + intent.id + ":release");
      put("redemption_orders", {
        id: returnId,
        lockId: order.lockId,
        intentId: intent.id,
        amountJpy: order.amountJpy,
        status: "withdrawing",
      });
      const returned = await withdrawAndReturn(
        returnId,
        order.id,
        order.usdcUnits,
        guard,
      );
      if (
        returned.units !== order.usdcUnits ||
        returned.owner !== s.customer ||
        returned.action !== "withdraw-and-return"
      )
        throw new Error("Settlement mismatch");
      const settlementRef = returned.evidence
        ? keccak256(
            encodeAbiParameters(
              [
                { type: "uint256" },
                { type: "address" },
                { type: "bytes32" },
                { type: "uint256" },
                { type: "string" },
              ],
              [
                BigInt(publicChainId),
                addresses.token,
                returned.evidence.hash,
                BigInt(returned.evidence.logIndex),
                order.id,
              ],
            ),
          )
        : op(s.id + ":" + returned.id + ":returned");
      put("redemption_orders", {
        id: returnId,
        lockId: order.lockId,
        intentId: intent.id,
        amountJpy: order.amountJpy,
        status: "usdc_returned",
        settlementRef,
      });
      run.steps.push(...returned.steps);
      put("runs", run);
      const hash = await serialized(async () => {
        await verifyReturn(returned.evidence);
        return submit(
          s.vault,
          "TDLockVault",
          "release",
          [order.lockId, BigInt(order.amountJpy), redemptionId, settlementRef],
          guard,
        );
      });
      const r = await receipt(hash);
      const event = parseEventLogs({
        abi: parseAbi([
          "event Released(bytes32 indexed redemptionId,bytes32 indexed lockId,address indexed customer,uint256 amount,bytes32 settlementRef)",
        ]),
        logs: r.logs.filter(
          (l) => l.address.toLowerCase() === s.vault.toLowerCase(),
        ),
      }).find((e) => e.args.redemptionId === redemptionId);
      if (
        !event ||
        event.args.lockId !== order.lockId ||
        event.args.amount !== BigInt(order.amountJpy) ||
        event.args.customer.toLowerCase() !== s.customer.toLowerCase() ||
        event.args.settlementRef !== settlementRef
      )
        throw new Error("Release evidence mismatch");
      run.steps.push({
        label: "Release TD to the original customer account",
        mode: "anvil",
        hash,
        block: r.blockNumber.toString(),
      });
      put("investment_orders", { ...order, status: "redeemed" });
      markRedeemed(order.id);
      put("redemption_orders", {
        id: returnId,
        lockId: order.lockId,
        intentId: intent.id,
        amountJpy: order.amountJpy,
        status: "completed",
        settlementRef,
        hash,
      });
    }
    put("redemption_requests", { ...request!, status: "completed" });
    run.status = "completed";
    put("runs", run);
    release(messageId);
    message(
      "assistant",
      `Investments redeemed. ¥${total.toLocaleString("en-US")} returned to your TD deposit.${mode() === "sepolia" ? "Aave holdings representing interest remain in your wallet." : ""}`,
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
    throw e;
  }
}
