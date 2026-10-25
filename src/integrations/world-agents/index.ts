import "server-only";
import * as oidc from "openid-client";
import { z } from "zod";

export const worldAgentsIssuer = "https://sandbox.auth.world.org";
export const worldAgentsAcr = "https://world.org/oidc/acr/orb-v3";
export const callbackPath = "/api/world-agents/callback";

export function worldAgentsConfig() {
  const clientId = z
    .string()
    .trim()
    .min(1)
    .parse(process.env.WORLD_AGENTS_CLIENT_ID);
  const clientSecret = z
    .string()
    .min(1)
    .parse(process.env.WORLD_AGENTS_CLIENT_SECRET);
  const callback = new URL(
    z.url().parse(process.env.WORLD_AGENTS_REDIRECT_URI),
  );
  if (
    callback.protocol !== "https:" ||
    callback.username ||
    callback.password ||
    callback.search ||
    callback.hash ||
    callback.pathname !== callbackPath
  ) {
    throw new Error("World Agents requires the registered HTTPS callback URL");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: callback.href,
    origin: callback.origin,
  };
}

export async function worldAgentsClient() {
  const settings = worldAgentsConfig();
  const config = await oidc.discovery(
    new URL(worldAgentsIssuer),
    settings.clientId,
    { id_token_signed_response_alg: "RS256" },
    oidc.ClientSecretBasic(settings.clientSecret),
    { timeout: 10, execute: [oidc.enableNonRepudiationChecks] },
  );
  return config;
}

export type VerifiedWorldIdentity = {
  issuer: string;
  subject: string;
  authTime: number;
};

export function verifiedIdentity(
  claims: oidc.IDToken,
  startedAt: number,
): VerifiedWorldIdentity {
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== worldAgentsIssuer ||
    !claims.sub ||
    claims.acr !== worldAgentsAcr ||
    !Array.isArray(claims.amr) ||
    !claims.amr.includes("pop") ||
    typeof claims.auth_time !== "number" ||
    !Number.isInteger(claims.auth_time) ||
    claims.auth_time < Math.floor(startedAt / 1000) - 30 ||
    claims.auth_time > now + 30
  ) {
    throw new Error("World authentication context rejected");
  }
  return {
    issuer: claims.iss,
    subject: claims.sub,
    authTime: claims.auth_time,
  };
}

export { oidc };
