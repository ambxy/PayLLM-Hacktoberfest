import { z } from "zod";
const money = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(16);
const paymentRecipient = z.object({
  recipientId: z.enum(["aoba", "sakura", "card"]),
  maxPaymentJpy: money,
  monthlyLimitJpy: money,
});
export const conditions = z
  .object({
    id: z.enum(["payment", "investment"]),
    enabled: z.boolean(),
    recipientId: z.enum(["aoba", ""]),
    maxPaymentJpy: money,
    monthlyLimitJpy: money,
    paymentRecipients: z.array(paymentRecipient).optional(),
    safetyBufferJpy: money,
    maxInvestmentJpy: money,
    minimumBalanceJpy: money,
    payAt: z.literal("dueDate"),
    investmentAllocations: z
      .array(
        z.object({
          id: z.string().min(1),
          amountJpy: money.refine((value) => BigInt(value) > 0n),
          paymentId: z.string().min(1).optional(),
          dueAt: z.iso.datetime().optional(),
        }),
      )
      .min(1)
      .max(100)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.investmentAllocations) {
      const lots = value.investmentAllocations;
      if (
        value.id !== "investment" ||
        value.safetyBufferJpy !== "0" ||
        value.minimumBalanceJpy !== "0" ||
        new Set(lots.map((lot) => lot.id)).size !== lots.length ||
        lots.some((lot) => !!lot.paymentId !== !!lot.dueAt) ||
        lots.reduce((total, lot) => total + BigInt(lot.amountJpy), 0n) !==
          BigInt(value.maxInvestmentJpy)
      )
        context.addIssue({
          code: "custom",
          message: "Invalid investment allocations",
        });
    }
    const recipientIds =
      value.paymentRecipients?.map((recipient) => recipient.recipientId) ?? [];
    if (new Set(recipientIds).size !== recipientIds.length)
      context.addIssue({
        code: "custom",
        message: "Duplicate payment recipient",
      });
    if (value.id === "investment" && recipientIds.length)
      context.addIssue({
        code: "custom",
        message: "Investment rule cannot include payment recipients",
      });
  });
export const ruleChange = z.object({
  baseVersion: z.number().int().nonnegative(),
  conditions,
});
