import {
  sendChat,
  changeRuleViaApi,
  pauseRuleViaApi,
  ruleFromApi,
  resetDemo,
} from "./helpers";
import { test, expect, demoApprove } from "./helpers";
test("chat consent persists a versioned rule then change and stop", async ({
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
  await expect(
    page.getByText("Automatic payment proposal", { exact: true }),
  ).toBeVisible();

  await sendChat(page, "Confirm these settings");
  const approval = page.getByRole("region", { name: "World approval" });
  await approval
    .getByRole("button", { name: "Continue as demo", exact: true })
    .click();
  await expect(
    approval.getByRole("heading", { name: "Payments on due dates" }),
  ).toBeVisible();
  await expect(
    approval.getByRole("heading", { name: "Investing in Aave (simulation)" }),
  ).toBeVisible();
  await expect(approval).toContainText("Harp Branch");
  await page.screenshot({
    path: "/tmp/agent-bank-combined-approval.png",
    fullPage: true,
  });
  await approval
    .getByRole("button", { name: "Approve these terms in demo", exact: true })
    .click();
  await expect(approval).not.toBeVisible();
  await expect(page.getByText("Approval", { exact: true })).toHaveCount(2);
  const initial = await (await page.request.get("/api/rules")).json();
  expect(initial).toHaveLength(2);
  expect(
    initial.find((rule: { id: string }) => rule.id === "investment")
      .investmentTarget,
  ).toMatchObject({ mode: "stub" });
  expect(initial[0].authorization.approvalId).toBe(
    initial[1].authorization.approvalId,
  );
  await page.goto("/rules");
  const payment = await ruleFromApi(page, "payment");
  expect(payment.monthlyLimitJpy).toBe("200000");
  const updated = await changeRuleViaApi(page, "payment", {
    monthlyLimitJpy: "300000",
    paymentRecipients: payment.paymentRecipients!.map((recipient, index) =>
      index === 0 ? { ...recipient, monthlyLimitJpy: "300000" } : recipient,
    ),
  });
  expect(updated).toMatchObject({ version: 2, status: "active" });
  expect(await pauseRuleViaApi(page, "payment")).toMatchObject({
    version: 3,
    status: "stopped",
  });
  expect(
    await changeRuleViaApi(page, "payment", { enabled: true }),
  ).toMatchObject({ version: 4, status: "active" });
  await page.reload();
  expect((await ruleFromApi(page, "payment")).monthlyLimitJpy).toBe("300000");
  await expect(
    page.getByRole("heading", { name: "Manageable amount" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/td-bank-rules.png", fullPage: true });
});
