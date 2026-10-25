import {
  runDemoEvent,
  sendChat,
  pauseRuleViaApi,
  changeRuleViaApi,
  resetDemo,
} from "./helpers";
import { test, expect, demoApprove } from "./helpers";
test("stopped payment rule applies to unexecuted invoice and can resume", async ({
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
  await page.goto("/rules");
  expect(await pauseRuleViaApi(page, "payment")).toMatchObject({
    version: 2,
    status: "stopped",
  });
  await page.goto("/chat");

  await runDemoEvent(page, "due_date_reached", false);

  expect((await (await page.request.get("/api/dashboard")).json()).td).toBe(
    "600000",
  );
  await page.goto("/rules");
  expect(
    await changeRuleViaApi(page, "payment", { enabled: true }),
  ).toMatchObject({ version: 3, status: "active" });
  await page.goto("/chat");

  await runDemoEvent(page, "due_date_reached");
  await expect(page.getByText("Paid ¥200,000 to Aoba Design.")).toBeVisible();
});
