"use client";
import {
  CredentialRequest,
  IDKitRequestWidget,
  IDKitSessionWidget,
  type IDKitErrorCodes,
  type IDKitDebugReport,
  type IDKitResult,
} from "@worldcoin/idkit";
import type { Challenge } from "./world-approval";
// Renders the IDKit flow the server chose for this challenge: a session
// proof, or a one-off request for the account action.
export function WorldWidget({
  challenge,
  open,
  onOpenChange,
  description,
  handleVerify,
  onError,
}: {
  challenge: Challenge;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  handleVerify: (proof: IDKitResult) => Promise<void>;
  onError: (code: IDKitErrorCodes, report?: IDKitDebugReport) => void;
}) {
  const shared = {
    language: "en" as const,
    open,
    onOpenChange,
    app_id: challenge.appId,
    rp_context: challenge.rpContext,
    environment: challenge.environment,
    constraints: CredentialRequest("proof_of_human", {
      signal: challenge.signal,
    }),
    action_description: description,
    handleVerify,
    onSuccess: () => {},
    onError,
  };
  return challenge.flow === "request" && challenge.action ? (
    <IDKitRequestWidget
      {...shared}
      action={challenge.action}
      allow_legacy_proofs={false}
    />
  ) : (
    <IDKitSessionWidget {...shared} existing_session_id={challenge.sessionId} />
  );
}
