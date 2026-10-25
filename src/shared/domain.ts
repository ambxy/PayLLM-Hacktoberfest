export type InvestmentAllocation = {
  id: string;
  amountJpy: string;
  paymentId?: string;
  dueAt?: string;
};
export type CardPayment = {
  id: string;
  cardName: string;
  last4: string;
  issuer: string;
  number: string;
  recipientId: "card";
  amountJpy: string;
  dueAt: string;
  recurrenceKey: string;
};
export type Invoice = {
  source?: "invoice" | "card";
  cardName?: string;
  cardLast4?: string;
  id: string;
  emailId: string;
  issuer: string;
  number: string;
  recipientId: string;
  amountJpy: string;
  dueAt: string;
  recurrenceKey: string;
  status: "scheduled" | "paid";
};
export type Mail = {
  id: string;
  sender: string;
  subject: string;
  body: string;
  attachment: {
    number: string;
    issuer: string;
    recipientId: string;
    amountJpy: string;
    dueAt: string;
    recurrenceKey: string;
  };
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  kind?: string;
  data?: Record<string, unknown>;
};
export type PaymentRecipientLimit = {
  recipientId: "aoba" | "sakura" | "card";
  maxPaymentJpy: string;
  monthlyLimitJpy: string;
};
export type AuthorizationBinding = {
  approvalId: string;
  approvalMethod: "world" | "local-demo" | "human-confirmation";
  accountId: string;
  agentId: string;
  authMode: "world" | "local-demo";
  generation: number;
  instanceId: string;
  scopes: string[];
};
export type Rule = {
  approvedDemoDate?: string;
  investmentAllocations?: InvestmentAllocation[];
  authorization?: AuthorizationBinding;
  worldApprovalId?: string;
  id: "payment" | "investment";
  version: number;
  enabled: boolean;
  recipientId: string;
  maxPaymentJpy: string;
  monthlyLimitJpy: string;
  paymentRecipients?: PaymentRecipientLimit[];
  safetyBufferJpy: string;
  maxInvestmentJpy: string;
  minimumBalanceJpy: string;
  payAt: "dueDate";
  consentId: string;
};
export type Proposal = {
  accountId?: string;
  agentId?: string;
  authMode?: string;
  generation?: number;
  instanceId?: string;
  id: string;
  kind: "payment" | "investment";
  baseVersion: number;
  conditions: Omit<
    Rule,
    | "version"
    | "consentId"
    | "worldApprovalId"
    | "authorization"
    | "approvedDemoDate"
  >;
  sourceIds: string[];
  status: "proposed" | "accepted";
  consentId?: string;
};
export type Intent = {
  id: string;
  instanceId: string;
  kind: "payment" | "investment" | "redemption";
  sourceId: string;
  ruleVersion: number;
  amountJpy: string;
  usdcUnits: string;
  recipient: string;
  expiresAt: string;
  nonce: string;
  consentId: string;
  signature: `0x${string}`;
};
export type Run = {
  error?: string;
  sourceId?: string;
  ruleVersion?: number;
  id: string;
  status: "running" | "completed" | "needs_attention";
  kind: string;
  steps: {
    label: string;
    mode: "anvil" | "stub" | "sepolia";
    chainId?: number;
    hash?: string;
    block?: string;
    ref?: string;
  }[];
  intentId?: string;
};
export type AccountMovement = {
  id: string;
  account: "deposit" | "token" | "aave";
  direction: "in" | "out";
  amount: string;
  unit: "JPY" | "USDC";
  label: string;
};
export type Payment = {
  id: string;
  recipientId: string;
  amountJpy: string;
  paidAt: string;
  recurrenceKey: string;
  status?: "reserved" | "confirmed";
  source: string;
  hash?: string;
};
