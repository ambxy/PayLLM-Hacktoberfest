import {
  runDemoEvent,
  sendChat,
  pauseRuleViaApi,
  changeRuleViaApi,
  resetDemo,
} from "./helpers";
import { test, expect, demoApprove } from "./helpers";
test("redeem all investment through chat and restore original TD", async ({
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

  await sendChat(page, "Redeem all investments to TD");
  await expect(
    page.getByText(
      "Investments redeemed. ¥400,000 returned to your TD deposit.",
    ),
  ).toBeVisible();
  const restored = await (await page.request.get("/api/dashboard")).json();
  expect(restored.td).toBe("800000");
  expect(restored.recipientTd).toBe("200000");
  expect(restored.locked).toBe("0");
  expect(restored.positionUsdc).toBe("0");
  expect(restored.treasuryUsdc).toBe("10000000000");
  await page.goto("/");
  await expect(
    page.locator("main").getByText("¥800,000", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/td-bank-redeem.png", fullPage: true });
});

test("redeem multiple positions even after investment rule is stopped", async ({
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

  await sendChat(page, "Redeem all investments to TD");
  await expect(
    page.getByText(
      "Investments redeemed. ¥400,000 returned to your TD deposit.",
    ),
  ).toBeVisible();
  await page.goto("/rules");
  await changeRuleViaApi(page, "investment", { maxInvestmentJpy: "200000" });
  await page.goto("/chat");

  await expect(
    page.getByText(
      "Started investing ¥200,000 from your deposit account in Aave. (Simulation)",
    ),
  ).toBeVisible();

  await runDemoEvent(page, "surplus_check");
  await expect(
    page.getByText(
      "Started investing ¥200,000 from your deposit account in Aave. (Simulation)",
    ),
  ).toHaveCount(2);
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
  await page.goto("/rules");
  expect(await pauseRuleViaApi(page, "investment")).toMatchObject({
    version: 3,
    status: "stopped",
  });
  await page.goto("/chat");

  await sendChat(page, "Redeem all investments to TD");
  await expect(
    page.getByText(
      "Investments redeemed. ¥400,000 returned to your TD deposit.",
    ),
  ).toHaveCount(2);
  const restored = await (await page.request.get("/api/dashboard")).json();
  expect(restored.td).toBe("800000");
  expect(restored.recipientTd).toBe("200000");
  expect(restored.locked).toBe("0");
  expect(restored.positionUsdc).toBe("0");
  expect(restored.treasuryUsdc).toBe("10000000000");
  await page.goto("/");
  await expect(
    page.locator("main").getByText("¥800,000", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/td-bank-redeem.png", fullPage: true });
});
