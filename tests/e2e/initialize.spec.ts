import { test, expect, demoApprove, resetDemo } from "./helpers";
test("initialization and reset show confirmed local TD", async ({ page }) => {
  await page.goto("/");
  await resetDemo(page);
  await expect(
    page.locator("main").getByText("¥1,000,000", { exact: true }),
  ).toBeVisible({
    timeout: 60000,
  });
  const first = await (await page.request.get("/api/dashboard")).json();
  await resetDemo(page);
  const second = await (await page.request.get("/api/dashboard")).json();
  expect(second.id).not.toBe(first.id);
  expect(second.token).not.toBe(first.token);
  expect(second.td).toBe("1000000");
  expect(second.locked).toBe("0");
  expect(second.recipientTd).toBe("0");
  await page.screenshot({
    path: "/tmp/td-bank-initialize.png",
    fullPage: true,
  });
});
