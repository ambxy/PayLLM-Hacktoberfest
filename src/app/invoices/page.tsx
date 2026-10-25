"use client";
import { apiFetch } from "../api-client";
import { useEffect, useRef, useState } from "react";
import type { Invoice, Mail } from "@/shared/domain";
import { invoiceDocument } from "@/shared/invoice-document";
export default function Invoices() {
  const [selected, setSelected] = useState<Invoice | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const document = selected ? invoiceDocument(selected) : undefined;
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const [data, setData] = useState<{ invoices: Invoice[]; emails: Mail[] }>({
    invoices: [],
    emails: [],
  });
  useEffect(() => {
    async function load() {
      const r = await apiFetch("/api/invoices");
      if (r.ok) setData(await r.json());
    }
    const refresh = () => void load();
    void load();
    window.addEventListener("agent-bank:invoices-updated", refresh);
    return () =>
      window.removeEventListener("agent-bank:invoices-updated", refresh);
  }, []);
  return (
    <>
      <header className="page-header">
        <h1>Payments</h1>
        <p>Configured payments and their payment status.</p>
      </header>
      {data.invoices.map((i) => (
        <section className="panel" id={i.id} key={i.id}>
          <span className={`badge ${i.status}`}>
            {i.status === "paid" ? "Paid" : "Scheduled"}
          </span>
          <h2>{i.source === "card" ? i.cardName : i.issuer}</h2>
          {i.source === "card" && <p>Credit card · •••• {i.cardLast4}</p>}
          <strong>¥{BigInt(i.amountJpy).toLocaleString("en-US")}</strong>
          <p>
            Due:{" "}
            {new Date(i.dueAt).toLocaleString("en-US", {
              timeZone: "Asia/Tokyo",
            })}
          </p>
          {i.source !== "card" && (
            <details>
              <summary>View source email</summary>
              <p>{data.emails.find((m) => m.id === i.emailId)?.body}</p>
            </details>
          )}
          <div className="invoice-attachment">
            <div>
              <strong>
                {i.source === "card" ? "Card statement" : "Attached invoice"}
              </strong>
              <p>{i.number}</p>
            </div>
            {invoiceDocument(i) ? (
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`${i.issuer} invoice preview`}
              >
                View invoice
              </button>
            ) : i.source !== "card" ? (
              <p>A PDF is not available for this invoice.</p>
            ) : null}
          </div>
        </section>
      ))}
      {!data.invoices.length && (
        <section className="panel">
          Invoice and card payments appear here once you approve the plan.
        </section>
      )}
      <dialog
        ref={dialog}
        className="invoice-dialog"
        aria-labelledby="invoice-preview-title"
        onClose={() => setSelected(null)}
      >
        {selected && document && (
          <>
            <div className="invoice-preview-header">
              <div>
                <h2 id="invoice-preview-title">{selected.issuer} invoice</h2>
                <p>{selected.number} · Demo sample</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <div className="invoice-preview-actions">
              <a href={document.url} target="_blank" rel="noopener noreferrer">
                Open in new tab
              </a>
              <a href={document.url} download={`${selected.number}.pdf`}>
                Download
              </a>
              <span>If the preview does not load, open it in a new tab.</span>
            </div>
            <iframe
              title={`${selected.issuer} invoice PDF`}
              src={`${document.url}#view=FitH`}
            />
          </>
        )}
      </dialog>
    </>
  );
}
