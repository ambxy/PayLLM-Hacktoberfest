import { chromium } from "@playwright/test";
import { PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Mail } from "../src/shared/domain";

// Requires Playwright Chromium.
const mails: Mail[] = JSON.parse(await readFile("fixtures/mail.json", "utf8"));
const output = "public/invoices";
await mkdir(output, { recursive: true });
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const yen = (amount: bigint) => `¥${amount.toLocaleString("en-US")}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
});
const manifest = [];
try {
  const page = await browser.newPage();
  for (const mail of mails) {
    const invoice = mail.attachment;
    if (!/^[A-Z0-9-]+$/.test(invoice.number))
      throw new Error("Invalid invoice number");
    const total = BigInt(invoice.amountJpy);
    const tax = (total * 10n) / 110n;
    const subtotal = total - tax;
    const office = invoice.recipientId === "sakura";
    const due = new Date(invoice.dueAt).toLocaleString("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const date = new Date(invoice.dueAt).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Tokyo",
    });
    const issued = `${date.slice(0, 7)}-01`;
    const period = new Date(invoice.dueAt).toLocaleDateString("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
    });
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(invoice.number)}</title>
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #253449; font: 12px Arial, Helvetica, sans-serif; }
        main { width: 210mm; height: 297mm; padding: 22mm 20mm; position: relative; }
        header { display: flex; justify-content: space-between; border-top: 5px solid ${office ? "#526b61" : "#345777"}; padding-top: 24px; }
        h1 { font-size: 30px; letter-spacing: 2px; font-weight: 500; margin: 0; }
        .meta { text-align: right; color: #596574; line-height: 1.9; font-size: 11px; }
        .parties { display: flex; justify-content: space-between; gap: 30px; margin: 42px 0 32px; }
        h2 { font-size: 17px; font-weight: 500; margin: 8px 0 14px; }
        p { margin: 6px 0; line-height: 1.8; }
        .muted { color: #6a7583; font-size: 10px; }
        .issuer { width: 245px; }
        .total { background: #f1f4f6; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; }
        .total strong { font-size: 30px; font-weight: 500; letter-spacing: 1px; }
        .due { margin: 16px 0 30px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f1f4f6; padding: 12px; text-align: left; font-weight: 500; font-size: 11px; }
        td { padding: 20px 12px; border-bottom: 1px solid #dce1e7; }
        .right { text-align: right; white-space: nowrap; }
        .sums { width: 270px; margin: 16px 0 36px auto; }
        .sums div { display: flex; justify-content: space-between; padding: 8px 0; }
        .sums .grand { border-top: 1px solid #83909f; margin-top: 5px; font-size: 15px; font-weight: 600; }
        .bank { border-top: 1px solid #dce1e7; padding-top: 18px; }
        h3 { font-size: 12px; font-weight: 600; margin: 0 0 12px; }
        footer { position: absolute; bottom: 19mm; left: 20mm; right: 20mm; border-top: 1px solid #dce1e7; padding-top: 12px; display: flex; justify-content: space-between; color: #7a8490; font-size: 9px; }
      </style></head><body><main>
      <header><h1>Invoice</h1><div class="meta">Invoice number ${escape(invoice.number)}<br>Issued ${issued}</div></header>
      <section class="parties"><div><p class="muted">Bill to</p><h2>Demo account holder</h2><p>Please find your invoice details below.</p></div>
      <div class="issuer"><h2>${escape(invoice.issuer)}</h2><p>${office ? "Office Services Division" : "Design Services Division"}</p><p class="muted">Contact: ${escape(mail.sender)}</p></div></section>
      <div class="total"><span>Total due (tax included)</span><strong>${yen(total)}</strong></div>
      <p class="due">Payment due: ${due} JST</p>
      <table><thead><tr><th>Description</th><th class="right">Quantity</th><th class="right">Amount before tax</th></tr></thead>
      <tbody><tr><td>${office ? "Office fee" : "Design services"}<p class="muted">${period}</p></td><td class="right">1</td><td class="right">${yen(subtotal)}</td></tr></tbody></table>
      <section class="sums"><div><span>Subtotal before tax</span><span>${yen(subtotal)}</span></div><div><span>Included tax (10%)</span><span>${yen(tax)}</span></div><div class="grand"><span>Total</span><span>${yen(total)}</span></div></section>
      <section class="bank"><h3>Payment details</h3><p>Agent Bank, Harp Branch<br>Deposit account: ${office ? "0000002" : "0000001"}<br>Account name: ${office ? "Sakura Office" : "Aoba Design"}</p>
      <p class="muted">Internal transfer to the payee’s Agent Bank account (1 TD = JPY 1). Account numbers are fictional; both demo payees share one recipient address for transfer verification.</p></section>
      <footer><span>Demo sample / All transaction and account details are fictional.</span><span>1 / 1</span></footer>
      </main></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const filename = `${invoice.number}.pdf`;
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
    });
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const infoRef = pdf.context.trailerInfo.Info;
    if (infoRef instanceof PDFRef) pdf.context.delete(infoRef);
    delete pdf.context.trailerInfo.Info;
    pdf.catalog.delete(PDFName.of("Metadata"));
    await writeFile(`${output}/${filename}`, await pdf.save());
    manifest.push({
      number: invoice.number,
      issuer: invoice.issuer,
      amountJpy: invoice.amountJpy,
      dueAt: invoice.dueAt,
      emailId: mail.id,
      url: `/invoices/${filename}`,
    });
  }
  await writeFile(
    `${output}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
