import { test } from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import mails from "../fixtures/mail.json";
import documents from "../public/invoices/manifest.json";
import { invoiceDocument } from "../src/shared/invoice-document";

test("every sample has a PDF matching its current invoice fields", () => {
  assert.equal(documents.length, mails.length);
  for (const mail of mails) {
    const invoice = {
      ...mail.attachment,
      id: `${mail.attachment.recipientId}:${mail.attachment.number}`,
      emailId: mail.id,
      status: "scheduled" as const,
    };
    const document = invoiceDocument(invoice);
    assert.ok(
      document,
      "Regenerate samples with pnpm invoices:pdf after fixture changes",
    );
    assert.equal(
      readFileSync(`public${document.url}`).subarray(0, 5).toString(),
      "%PDF-",
    );
    const legacyIssuer =
      mail.attachment.recipientId === "aoba"
        ? "アオバデザイン"
        : "サクラオフィス";
    assert.equal(
      invoiceDocument({ ...invoice, issuer: legacyIssuer }),
      document,
    );
    assert.equal(
      invoiceDocument({ ...invoice, issuer: "Unknown issuer" }),
      undefined,
    );
    assert.equal(
      invoiceDocument({ ...invoice, issuer: legacyIssuer, amountJpy: "1" }),
      undefined,
    );
    assert.equal(invoiceDocument({ ...invoice, amountJpy: "1" }), undefined);
    assert.equal(
      invoiceDocument({ ...invoice, dueAt: "2026-10-01T00:00:00.000Z" }),
      undefined,
    );
    assert.equal(invoiceDocument({ ...invoice, number: "unknown" }), undefined);
  }
});

test("sample PDFs contain no document metadata or embedded files", async () => {
  for (const document of documents) {
    const pdf = await PDFDocument.load(readFileSync(`public${document.url}`), {
      updateMetadata: false,
    });
    assert.equal(pdf.context.trailerInfo.Info, undefined);
    assert.equal(pdf.catalog.has(PDFName.of("Metadata")), false);
    assert.equal(pdf.catalog.has(PDFName.of("AF")), false);
    assert.equal(pdf.getPageCount(), 1);
  }
});
