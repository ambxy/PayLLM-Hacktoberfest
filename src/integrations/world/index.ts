import "server-only";
import { z } from "zod";
import { signRequest } from "@worldcoin/idkit/signing";
import { hashSignal } from "@worldcoin/idkit/hashing";

export function worldMode() {
  return z
    .enum(["disabled", "live"])
    .parse(process.env.WORLD_MODE ?? "disabled");
}
export function worldConfig() {
  if (worldMode() !== "live") throw new Error("World live mode required");
  return z
    .object({
      appId: z.string().regex(/^app_[a-zA-Z0-9]+$/),
      rpId: z.string().regex(/^rp_[a-zA-Z0-9]+$/),
      environment: z.enum(["production", "sandbox"]),
      signingKey: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/),
      flow: z.enum(["session", "request"]),
    })
    .parse({
      appId: process.env.WORLD_APP_ID,
      rpId: process.env.WORLD_RP_ID,
      environment: process.env.WORLD_ENVIRONMENT ?? "production",
      signingKey: process.env.WORLD_RP_SIGNING_KEY,
      flow: process.env.WORLD_FLOW ?? "session",
    });
}
export type WorldFlow = "session" | "request";
// Orb-verified proof of human (issuer schema 1) is the only accepted credential.
export const worldCredential = "proof_of_human";
// Request flow: every enrollment, login and approval proves the same action,
// so the RP-scoped nullifier identifies the enrolled human across checks.
export const accountAction = "agent-bank-account";
// Session proofs omit the action; uniqueness proofs must sign it.
export function createRpContext() {
  const config = worldConfig();
  const flow: WorldFlow = config.flow;
  const action = flow === "request" ? accountAction : undefined;
  const s = signRequest({ signingKeyHex: config.signingKey, ttl: 300, action });
  return {
    appId: config.appId,
    environment: config.environment,
    credential: worldCredential,
    flow,
    ...(action ? { action } : {}),
    rpContext: {
      rp_id: config.rpId,
      nonce: s.nonce,
      created_at: s.createdAt,
      expires_at: s.expiresAt,
      signature: s.sig,
    },
  };
}
const hex = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/);
export const sessionIdSchema = z.string().regex(/^session_[0-9a-fA-F]{128}$/);
// Optional for Orb proofs; World's verify API validates its contents.
const integrityBundle = z
  .object({
    version: z.number().int().positive(),
    signature_format: z.enum(["apple_app_attest", "android_keystore"]),
    timestamp: z.number().int().nonnegative(),
    signature: z.string().min(1),
    jwt: z.string().min(1),
  })
  .passthrough()
  .optional();
const item = {
  identifier: z.literal(worldCredential),
  issuer_schema_id: z.literal(1),
  signal_hash: hex,
  expires_at_min: z.number().int().nonnegative(),
  // Compressed Groth16 elements exceed 32 bytes; World's verify API checks them.
  proof: z.array(z.string().regex(/^(0x)?[0-9a-fA-F]+$/)).length(5),
};
const sessionProofSchema = z
  .object({
    protocol_version: z.literal("4.0"),
    user_presence_completed: z.literal(true).optional(),
    nonce: hex,
    session_id: sessionIdSchema,
    environment: z.enum(["production", "sandbox"]),
    action: z.never().optional(),
    integrity_bundle: integrityBundle,
    responses: z
      .array(
        z
          .object({ ...item, session_nullifier: z.tuple([hex, hex]) })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
const requestProofSchema = z
  .object({
    protocol_version: z.literal("4.0"),
    user_presence_completed: z.literal(true).optional(),
    nonce: hex,
    action: z.string(),
    session_id: z.never().optional(),
    environment: z.enum(["production", "sandbox"]),
    integrity_bundle: integrityBundle,
    responses: z
      .array(z.object({ ...item, nullifier: hex }).passthrough())
      .length(1),
  })
  .passthrough();
export type ProofExpectation = {
  nonce: string;
  signal: string;
  expiresAt: number;
  environment: "production" | "sandbox";
  flow: WorldFlow;
  action?: string;
  // Enrolled account identity: a session ID, or `nullifier_<hex>` for requests.
  sessionId?: string;
};
export function inspectProof(input: unknown, expected: ProofExpectation) {
  const parsed = (
    expected.flow === "session" ? sessionProofSchema : requestProofSchema
  ).safeParse(input);
  // Error messages name fields only, never proof values.
  if (!parsed.success)
    throw new Error(
      "World proof shape rejected: " +
        parsed.error.issues
          .map((i) => `${i.path.join(".")}(${i.code})`)
          .join(", "),
    );
  const proof = parsed.data;
  const item = proof.responses[0];
  const identity =
    "session_id" in proof && proof.session_id
      ? proof.session_id
      : `nullifier_${BigInt((item as { nullifier: string }).nullifier).toString(16)}`;
  const failed = Object.entries({
    expired: Date.now() >= expected.expiresAt * 1000,
    nonce: BigInt(proof.nonce) !== BigInt(expected.nonce),
    signal: BigInt(item.signal_hash) !== BigInt(hashSignal(expected.signal)),
    environment: proof.environment !== expected.environment,
    action:
      expected.flow === "request" &&
      (!expected.action || proof.action !== expected.action),
    account: Boolean(expected.sessionId && identity !== expected.sessionId),
  })
    .filter(([, bad]) => bad)
    .map(([name]) => name);
  if (failed.length)
    throw new Error(
      `World proof does not match challenge: ${failed.join(", ")}`,
    );
  return {
    sessionId: identity,
    // Session nullifiers are per proof; a request nullifier repeats for the
    // same human and action, so the one-time nonce makes the replay key unique.
    nullifier:
      "session_nullifier" in item
        ? (item.session_nullifier as string[])
            .map((v) => BigInt(v).toString(16))
            .join(":")
        : `${identity}:${BigInt(proof.nonce).toString(16)}`,
  };
}
export async function verifyWorldProof(
  input: unknown,
  expected: ProofExpectation,
) {
  const proof = inspectProof(input, expected);
  const config = worldConfig();
  if (
    config.environment !== expected.environment ||
    config.flow !== expected.flow
  )
    throw new Error("World configuration changed");
  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${config.rpId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("World verification rejected");
  const verified = z
    .object({
      success: z.literal(true),
      session_id: sessionIdSchema.optional(),
      environment: z.enum(["production", "sandbox"]).optional(),
      results: z
        .array(
          z.object({
            identifier: z.literal(worldCredential),
            success: z.literal(true),
          }),
        )
        .length(1),
    })
    .parse(await response.json());
  if (
    (expected.flow === "session" &&
      (verified.session_id !== proof.sessionId ||
        verified.environment !== expected.environment)) ||
    (verified.environment && verified.environment !== expected.environment)
  )
    throw new Error("World verified session mismatch");
  return proof;
}
