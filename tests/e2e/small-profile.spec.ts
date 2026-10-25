import { test, expect } from "@playwright/test";
import { approveApi } from "./helpers";
test("ten USDC profile proposes and redeems exactly 1600 TD locally", async ({
  page,
  baseURL,
}) => {
  test.skip(
    process.env.SMALL_PROFILE_TEST !== "1",
    "Explicit small profile server required",
  );
  const origin = new URL(baseURL!).origin;
  await page.context().setExtraHTTPHeaders({ Origin: origin });
  expect(
    (
      await page.request.post("/api/auth/demo-login", {
        data: {},
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBeTruthy();
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(path, { data });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  await post("/api/demo/reset", {});
  let messages = await post("/api/chat/messages", {
    text: "I allow access to my emails. Please check the invoices.",
  });
  await approveApi(page.request, messages.at(-1).data.input, origin);
  messages = await post("/api/chat/messages", {
    text: "I allow access to my emails. Please check the invoices.",
  });
  let proposal = messages.findLast(
    (m: { kind: string }) => m.kind === "proposal",
  ).data.proposal;
  await post("/api/chat/messages", {
    text: "Confirm these settings",
    proposalId: proposal.id,
  });
  await approveApi(
    page.request,
    { purpose: "proposal", proposalId: proposal.id },
    origin,
  );
  await post("/api/demo/events", {
    type: "due_date_reached",
    requestId: crypto.randomUUID(),
  });
  messages = await post("/api/chat/messages", {
    text: "Invest my available funds",
  });
  proposal = messages.findLast((m: { kind: string }) => m.kind === "proposal")
    .data.proposal;
  expect(proposal.conditions.maxInvestmentJpy).toBe("1600");
  await post("/api/chat/messages", {
    text: "Confirm these settings",
    proposalId: proposal.id,
  });
  await approveApi(
    page.request,
    { purpose: "proposal", proposalId: proposal.id },
    origin,
  );
  const invested = await (await page.request.get("/api/dashboard")).json();
  expect(invested.locked).toBe("1600");
  expect(invested.positionUsdc).toBe("10000000");
  await page.goto("/investment");
  await expect(
    page.getByRole("region", { name: "Investment schedule" }),
  ).toContainText("Invest ¥1,600 in Aave.");
  await post("/api/chat/messages", { text: "Redeem all investments to TD" });
  const after = await (await page.request.get("/api/dashboard")).json();
  expect(after.td).toBe("800000");
  expect(after.locked).toBe("0");
});
