import {
  grantPaymentDataRequest,
  proposePaymentPlan,
  type PaymentPlanProposal,
} from "../demo-plan/service";
import { readCards } from "../cards/service";
import { authState } from "@/server/auth";
import {
  confirmMailDelegation,
  beginDemoApproval,
  completeDemoApproval,
} from "../world/service";
import { canRetryPlan } from "../investment/plan";
import type { Rule, Run } from "../../shared/domain";
import { activateApprovedInvestment } from "../world/activation";
import "server-only";
import {
  redeem,
  redemptionRequest,
  createRedemptionRequest,
} from "../investment/redemption";
import { proposeInvestment } from "../investment/service";
import { classifyRequest } from "../../integrations/ai";
import { randomUUID } from "node:crypto";
import { all, put, get } from "../../server/records";
import { readAuthorized } from "../invoices/service";
import { proposePayment } from "../rules/service";
import {
  requirePrincipal,
  internalAgentPrincipal,
  AuthorizationError,
  type Principal,
} from "../../server/auth";
import {
  allowedMailIds,
  createDelegationProposal,
} from "../delegations/service";
import type { Mail, Message, Proposal } from "../../shared/domain";
export const message = (
  role: "assistant",
  text: string,
  kind?: string,
  data?: Record<string, unknown>,
) => put("messages", { id: randomUUID(), role, text, kind, data });
export async function chat(
  principal: Principal,
  text: string,
  proposalId?: string,
) {
  requirePrincipal(principal, "human");
  put("messages", {
    id: randomUUID(),
    role: "user",
    text,
    accountId: principal.accountId,
    credentialId: principal.credentialId,
  });
  const aliases: Record<string, string> = {
    "カード支払い情報、請求書情報をアクセス権限を付与する":
      grantPaymentDataRequest,
    "カード支払い情報、請求書情報へのアクセス権限を付与する":
      grantPaymentDataRequest,
    "I allow access to my emails. Please check the invoices.":
      "Authorize and review sample emails",
    "メールの閲覧を許可します。請求書を確認して":
      "Authorize and review sample emails",
    サンプルメールの閲覧を許可して確認して:
      "Authorize and review sample emails",
    余力を運用したい: "Invest my available funds",
    そうしてください: "Confirm these settings",
    はい: "Yes",
    運用分を全部TDに戻して: redemptionRequest,
  };
  text = Object.hasOwn(aliases, text) ? aliases[text] : text;
  const request = [
    grantPaymentDataRequest,
    "Authorize and review sample emails",
    redemptionRequest,
    "Invest my available funds",
    "Confirm these settings",
    "Yes",
    "OK",
  ].includes(text)
    ? "other"
    : await classifyRequest(text);
  requirePrincipal(principal, "human");
  if (text === grantPaymentDataRequest) {
    if (get("rules", "payment") || get("rules", "investment"))
      throw new Error("Reset the demo before creating a new payment plan");
    const grant = createDelegationProposal(
      principal,
      ["aoba-mail", "sakura-mail"],
      ["harp-card-202609"],
    );
    confirmMailDelegation(grant.id, principal);
    const agent = internalAgentPrincipal();
    await readAuthorized(agent);
    readCards(agent);
    const plan = await proposePaymentPlan(agent);
    requirePrincipal(principal, "human");
    message(
      "assistant",
      "I found these invoice and card payments. May I invest your full deposit until each payment is needed?",
      "payment-plan",
      plan,
    );
  } else if (
    text === "Authorize and review sample emails" ||
    request === "read_mail"
  ) {
    const agent = internalAgentPrincipal();
    let ids: string[] = [];
    try {
      ids = allowedMailIds(agent);
    } catch (error) {
      if (!(error instanceof AuthorizationError && error.status === 403))
        throw error;
    }
    if (!ids.length) {
      const proposal = createDelegationProposal(principal, [
        "aoba-mail",
        "sakura-mail",
      ]);
      message(
        "assistant",
        "Allow access to the sample emails?",
        "mail-permission-request",
        { proposalId: proposal.id, mailIds: proposal.conditions.mailIds },
      );
    } else {
      const invoices = await readAuthorized(agent);
      requirePrincipal(principal, "human");
      message(
        "assistant",
        "I found invoices in the authorized emails.",
        "invoices",
        {
          invoices,
          emails: all<Mail>("emails").filter((mail) => ids.includes(mail.id)),
        },
      );
      const proposal = proposePayment(agent);
      message(
        "assistant",
        "Automate payments on their due dates to Aoba Design (¥200,000 per payment and per month) and Sakura Office (¥100,000 per payment and per month)?",
        "proposal",
        { proposal },
      );
      const investment = await proposeInvestment(agent);
      message(
        "assistant",
        `Keep required funds and a safety buffer, and invest up to ¥${BigInt(investment.proposal.conditions.maxInvestmentJpy).toLocaleString("en-US")} per investment?`,
        "proposal",
        investment,
      );
    }
  } else if (text === redemptionRequest) {
    const request = createRedemptionRequest(principal);
    await redeem(internalAgentPrincipal(), request.id);
  } else if (
    text === "Invest my available funds" ||
    request === "propose_investment"
  ) {
    const { proposal, snapshot } = await proposeInvestment(
      internalAgentPrincipal(),
    );
    requirePrincipal(principal, "human");
    message(
      "assistant",
      `Keep required funds and a safety buffer, and invest up to ¥${BigInt(proposal.conditions.maxInvestmentJpy).toLocaleString("en-US")} per investment?`,
      "proposal",
      { proposal, snapshot },
    );
  } else if (
    ["Confirm these settings", "Yes", "OK"].includes(text) &&
    proposalId
  ) {
    const proposal = get<Proposal>("proposals", proposalId);
    if (
      proposal?.status === "accepted" &&
      proposal.conditions.investmentAllocations
    ) {
      const rule = get<Rule>("rules", "investment");
      if (
        !rule ||
        rule.consentId !== proposal.consentId ||
        !canRetryPlan(get<Run>("runs", rule.consentId))
      )
        throw new Error("No unstarted investment to retry");
      await activateApprovedInvestment({ rule });
      return all<Message>("messages");
    }
    if (!proposal || proposal.status !== "proposed")
      throw new Error("Pending proposal required");
    if (proposal.conditions.investmentAllocations) {
      const plan = proposal as PaymentPlanProposal;
      const input = {
        purpose: "setup",
        paymentProposalId: plan.paymentProposalId,
        investmentProposalId: plan.id,
      };
      if (authState().mode === "local-demo") {
        const challenge = beginDemoApproval(input, principal);
        await activateApprovedInvestment(
          await completeDemoApproval(challenge.id, principal),
        );
      } else {
        message(
          "assistant",
          "Confirm with World to start this plan.",
          "approval-request",
          { input },
        );
      }
      return all<Message>("messages");
    }
    const payment = all<Proposal>("proposals")
      .filter((p) => p.kind === "payment" && p.status === "proposed")
      .at(-1);
    const investment = all<Proposal>("proposals")
      .filter((p) => p.kind === "investment" && p.status === "proposed")
      .at(-1);
    const setup =
      payment &&
      investment &&
      !get("rules", "payment") &&
      !get("rules", "investment");
    message(
      "assistant",
      setup
        ? "Review the payment and investment terms together."
        : "Review and approve the specific terms.",
      "approval-request",
      {
        input: setup
          ? {
              purpose: "setup",
              paymentProposalId: payment.id,
              investmentProposalId: investment.id,
            }
          : { purpose: "proposal", proposalId },
      },
    );
  } else
    message(
      "assistant",
      "Authorize access to the sample emails to review their invoices.",
    );
  requirePrincipal(principal, "human");
  return all<Message>("messages");
}
