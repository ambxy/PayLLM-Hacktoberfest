import { test, expect } from "@playwright/test";
import { approveApi } from "./helpers";
test("Sepolia principal round trip with Anvil TD and on-chain receipts", async ({
  page,
  baseURL,
}) => {
  test.skip(
    process.env.TESTNET_EXECUTION !== "approved",
    "Public sends require explicit authorization",
  );
  test.setTimeout(900000);
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
    const r = await page.request.post(path, { data, timeout: 720000 });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  await post("/api/demo/reset", {});
  await page.goto("/");
  await expect(page.getByText("Sepolia demo", { exact: true })).toHaveCount(0);
  let messages = await post("/api/chat/messages", {
    text: "I allow access to my emails. Please check the invoices.",
  });
  await approveApi(page.request, messages.at(-1).data.input, origin);
  messages = await post("/api/chat/messages", {
    text: "I allow access to my emails. Please check the invoices.",
  });
  const proposal = (
    messages as { kind: string; data?: { proposal: { id: string } } }[]
  ).findLast((m) => m.kind === "proposal")!.data!.proposal;
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
  const investment = (
    messages as { kind: string; data?: { proposal: { id: string } } }[]
  ).findLast((m) => m.kind === "proposal")!.data!.proposal;
  await post("/api/chat/messages", {
    text: "Confirm these settings",
    proposalId: investment.id,
  });
  const before = await (await page.request.get("/api/dashboard")).json();
  const approved = await approveApi(
    page.request,
    { purpose: "proposal", proposalId: investment.id },
    origin,
  );
  const amount = before.profile === "ten-usdc" ? "1600" : "400000";
  expect(approved.activation.status).toBe("completed");
  const run = await (
    await page.request.get(`/api/runs/${approved.activation.runId}`)
  ).json();
  expect(
    run.steps.filter((s: { mode: string }) => s.mode === "sepolia"),
  ).toHaveLength(3);
  const invested = await (await page.request.get("/api/dashboard")).json();
  expect(invested.locked).toBe(amount);
  expect(invested.principalUsdc).toBe((BigInt(amount) * 6250n).toString());
  await page.goto("/investment");
  await expect(
    page.getByRole("region", { name: "Investment schedule" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/td-sepolia-live-investment.png",
    fullPage: true,
  });
  await post("/api/chat/messages", { text: "Redeem all investments to TD" });
  const after = await (await page.request.get("/api/dashboard")).json();
  expect(after.td).toBe("800000");
  expect(after.locked).toBe("0");
  expect(after.principalUsdc).toBe("0");
  expect(after.treasuryUsdc).toBe(before.treasuryUsdc);
  await page.goto("/investment");
  await expect(
    page.getByRole("region", { name: "Investment schedule" }),
  ).toBeVisible();

  await page.screenshot({
    path: "/tmp/td-sepolia-live-redeemed.png",
    fullPage: true,
  });
});
