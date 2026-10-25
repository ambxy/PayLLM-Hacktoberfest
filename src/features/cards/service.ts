import "server-only";
import { readFileSync } from "node:fs";
import type { CardPayment, Invoice } from "@/shared/domain";
import { allowedCardIds } from "@/features/delegations/service";
import type { Principal } from "@/server/auth";
import { all, get, put } from "@/server/records";

export function readCards(principal: Principal) {
  const ids = allowedCardIds(principal);
  const cards = (
    JSON.parse(
      readFileSync("fixtures/card-payments.json", "utf8"),
    ) as CardPayment[]
  ).filter((card) => ids.includes(card.id));
  for (const card of cards) {
    const invoice: Invoice = {
      id: "card:" + card.id,
      emailId: "card:" + card.id,
      source: "card",
      cardName: card.cardName,
      cardLast4: card.last4,
      issuer: card.issuer,
      number: card.number,
      recipientId: card.recipientId,
      amountJpy: card.amountJpy,
      dueAt: card.dueAt,
      recurrenceKey: card.recurrenceKey,
      status: "scheduled",
    };
    if (!get("invoices", invoice.id)) put("invoices", invoice);
  }
  return all<Invoice>("invoices").filter(
    (invoice) =>
      invoice.source === "card" && ids.includes(invoice.emailId.slice(5)),
  );
}
