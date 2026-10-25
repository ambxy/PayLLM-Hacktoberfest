import { runDemoEvent, sendChat, resetDemo } from "./helpers";
import { test, expect, demoApprove } from "./helpers";
test("invest surplus after explicit consent and preserve inventory", async ({
  page,
}) => {
  await page.goto("/");
  await resetDemo(page);
  await expect(
    page.locator("main").getByText("¥1,000,000", { exact: true }),
  ).toBeVisible();
  await page.goto("/chat");

  await sendChat(
    page,
    "I allow access to my emails. Please check the invoices.",
  );
  await demoApprove(page);

  await sendChat(page, "Confirm these settings");
  await demoApprove(page);
  await expect(page.getByText("Approval", { exact: true })).toHaveCount(2);

  await runDemoEvent(page, "due_date_reached");
  await expect(
    page.getByText("Paid ¥200,000 to Aoba Design.", {
      exact: true,
    }),
  ).toBeVisible();
  const data = await (await page.request.get("/api/dashboard")).json();
  expect(data.td).toBe("400000");
  expect(data.locked).toBe("400000");
  expect(data.positionUsdc).toBe("2500000000");
  expect(data.treasuryUsdc).toBe("7500000000");
  const orders = await (await page.request.get("/api/investments")).json();
  const replay = await page.request.post("/api/demo/events", {
    data: { type: "surplus_check", requestId: orders[0].runId },
  });
  expect(replay.ok()).toBeTruthy();
  const after = await (await page.request.get("/api/dashboard")).json();
  expect(after.positionUsdc).toBe(data.positionUsdc);
  expect(after.locked).toBe(data.locked);
  expect(after.treasuryUsdc).toBe(data.treasuryUsdc);
  await page.goto("/investment");
  await expect(
    page.getByRole("region", { name: "Investment schedule" }),
  ).toContainText("Invest ¥400,000 in Aave.");
  await page.screenshot({ path: "/tmp/td-bank-invest.png", fullPage: true });
});
