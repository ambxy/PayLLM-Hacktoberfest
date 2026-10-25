import "server-only";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  hashTypedData,
  recoverTypedDataAddress,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import { randomUUID } from "node:crypto";
import { instance, put } from "../../server/records";
import { requirePrincipal, type Principal } from "../../server/auth";
import { assertScope } from "../delegations/service";
import type { Intent } from "../../shared/domain";
function agent() {
  mkdirSync(".data", { recursive: true });
  if (!existsSync(".data/agent.key"))
    writeFileSync(".data/agent.key", generatePrivateKey(), {
      mode: 0o600,
      flag: "wx",
    });
  return privateKeyToAccount(readFileSync(".data/agent.key", "utf8") as Hex);
}
type BoundIntent = Intent & {
  accountId: string;
  agentId: string;
  credentialId: string;
  authMode: string;
  generation: number;
  delegationId: string;
  delegationVersion: number;
};
function signing(intent: Omit<BoundIntent, "signature">) {
  const s = instance();
  return {
    domain: {
      name: "Agent Bank Intent",
      version: "1",
      chainId: 31337,
      verifyingContract: s.token,
    },
    types: {
      Intent: [
        { name: "instanceId", type: "string" },
        { name: "payloadHash", type: "bytes32" },
      ],
    },
    primaryType: "Intent" as const,
    message: {
      instanceId: intent.instanceId,
      payloadHash: keccak256(toHex(JSON.stringify(intent))),
    },
  };
}
export async function prepare(
  principal: Principal,
  input: Pick<
    Intent,
    "kind" | "sourceId" | "ruleVersion" | "amountJpy" | "recipient"
  > &
    Partial<Pick<Intent, "consentId" | "usdcUnits">>,
  redemptionAuthorization?: () => { id: string; version: number },
) {
  requirePrincipal(principal, "agent");
  if (redemptionAuthorization && input.kind !== "redemption")
    throw new Error("Invalid authorization source");
  const delegation = redemptionAuthorization
    ? redemptionAuthorization()
    : assertScope(principal, input.kind);
  const s = instance();
  const unsigned = {
    id: randomUUID(),
    accountId: principal.accountId,
    agentId: principal.agentId!,
    credentialId: principal.credentialId,
    authMode: principal.authMode,
    generation: principal.generation,
    delegationId: delegation.id,
    delegationVersion: delegation.version,
    instanceId: s.id,
    kind: input.kind,
    sourceId: input.sourceId,
    ruleVersion: input.ruleVersion,
    amountJpy: input.amountJpy,
    usdcUnits: input.usdcUnits ?? "0",
    recipient: input.recipient,
    expiresAt: new Date(Date.parse(s.clock) + 300000).toISOString(),
    nonce: randomUUID(),
    consentId: input.consentId ?? "",
  };
  const intent = {
    ...unsigned,
    signature: await agent().signTypedData(signing(unsigned)),
  };
  put("intents", intent);
  return intent;
}
export async function verify(
  principal: Principal,
  intent: BoundIntent,
  redemptionAuthorization?: () => { id: string; version: number },
) {
  requirePrincipal(principal, "agent");
  if (redemptionAuthorization && intent.kind !== "redemption")
    throw new Error("Invalid authorization source");
  const delegation = redemptionAuthorization
    ? redemptionAuthorization()
    : assertScope(principal, intent.kind);
  if (
    intent.accountId !== principal.accountId ||
    intent.agentId !== principal.agentId ||
    intent.credentialId !== principal.credentialId ||
    intent.authMode !== principal.authMode ||
    intent.generation !== principal.generation ||
    intent.delegationId !== delegation.id ||
    intent.delegationVersion !== delegation.version
  )
    throw new Error("Intent authorization mismatch");
  const { signature, ...unsigned } = intent;
  const s = instance();
  if (
    intent.instanceId !== s.id ||
    Date.parse(intent.expiresAt) < Date.parse(s.clock)
  )
    throw new Error("Expired or foreign intent");
  const signer = await recoverTypedDataAddress({
    ...signing(unsigned),
    signature,
  });
  if (signer.toLowerCase() !== agent().address.toLowerCase())
    throw new Error("Invalid agent");
  return hashTypedData(signing(unsigned));
}
