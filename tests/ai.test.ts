import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Mail } from "../src/shared/domain";

process.env.AI_MODE = "gemini";
process.env.GEMINI_API_KEY = "test-key";
const { extract, classifyRequest } = await import("../src/integrations/ai");

const mail: Mail = {
  id: "aoba-mail",
  sender: "billing@aoba.example",
  subject: "Invoice",
  body: "Invoice for September",
  attachment: {
    number: "AOBA-202609-001",
    issuer: "Aoba Design",
    recipientId: "aoba",
    amountJpy: "200000",
    dueAt: "2026-10-01T03:00:00.000Z",
    recurrenceKey: "aoba-services",
  },
};

afterEach(() => mock.restoreAll());

test("Gemini extraction accepts a matching invoice", async () => {
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      assert.equal(
        (init?.headers as Record<string, string>)["x-goog-api-key"],
        "test-key",
      );
      return Response.json({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(mail.attachment) }] } },
        ],
      });
    },
  );
  const invoice = await extract(mail);
  assert.equal(invoice.id, "aoba:AOBA-202609-001");
  assert.equal(invoice.amountJpy, "200000");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("Gemini extraction rejects a changed payment amount", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ...mail.attachment,
                  amountJpy: "300000",
                }),
              },
            ],
          },
        },
      ],
    }),
  );
  await assert.rejects(extract(mail), /differs from source: amountJpy/);
});

test("Gemini cannot classify a user request as payment consent or redemption", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify({ action: "redeem" }) }] },
        },
      ],
    }),
  );
  await assert.rejects(classifyRequest("運用分を戻したい"));
});
