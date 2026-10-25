import { parseEventLogs, type Address, type TransactionReceipt } from "viem";
import { addresses, tokenAbi, poolAbi } from "./config";
export type Action = "transfer" | "approve" | "supply" | "withdraw";
export function verifyEvidence(
  receipt: TransactionReceipt,
  action: Action,
  from: Address,
  to: Address,
  units: bigint,
) {
  const target =
    action === "transfer" || action === "approve"
      ? addresses.token
      : addresses.pool;
  if (
    receipt.status !== "success" ||
    receipt.from.toLowerCase() !== from.toLowerCase() ||
    receipt.to?.toLowerCase() !== target.toLowerCase()
  )
    throw new Error("Public receipt mismatch");
  const logs = receipt.logs.filter(
    (l) => l.address.toLowerCase() === target.toLowerCase(),
  );
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (action === "transfer") {
    const e = parseEventLogs({
      abi: tokenAbi,
      logs,
      eventName: "Transfer",
    }).find(
      (e) =>
        eq(e.args.from, from) && eq(e.args.to, to) && e.args.value === units,
    );
    if (!e) throw new Error("Transfer evidence mismatch");
    return e.logIndex;
  }
  if (action === "approve") {
    const e = parseEventLogs({
      abi: tokenAbi,
      logs,
      eventName: "Approval",
    }).find(
      (e) =>
        eq(e.args.owner, from) &&
        eq(e.args.spender, to) &&
        e.args.value === units,
    );
    if (!e) throw new Error("Approval evidence mismatch");
    return e.logIndex;
  }
  if (action === "supply") {
    const e = parseEventLogs({ abi: poolAbi, logs, eventName: "Supply" }).find(
      (e) =>
        eq(e.args.reserve, addresses.token) &&
        eq(e.args.user, from) &&
        eq(e.args.onBehalfOf, to) &&
        e.args.amount === units,
    );
    if (!e) throw new Error("Supply evidence mismatch");
    return e.logIndex;
  }
  const e = parseEventLogs({ abi: poolAbi, logs, eventName: "Withdraw" }).find(
    (e) =>
      eq(e.args.reserve, addresses.token) &&
      eq(e.args.user, from) &&
      eq(e.args.to, to) &&
      e.args.amount === units,
  );
  if (!e) throw new Error("Withdraw evidence mismatch");
  return e.logIndex;
}
