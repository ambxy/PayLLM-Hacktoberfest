import documents from "../../public/invoices/manifest.json";
import type { Invoice } from "./domain";

export function invoiceDocument(invoice: Invoice) {
  // Earlier demo records used the Japanese names of these same sample issuers.
  const issuer =
    invoice.issuer === "アオバデザイン"
      ? "Aoba Design"
      : invoice.issuer === "サクラオフィス"
        ? "Sakura Office"
        : invoice.issuer;
  return documents.find(
    (document) =>
      document.number === invoice.number &&
      document.emailId === invoice.emailId &&
      document.issuer === issuer &&
      document.amountJpy === invoice.amountJpy &&
      document.dueAt === invoice.dueAt,
  );
}
