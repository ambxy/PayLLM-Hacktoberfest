import { test, expect, demoApprove } from "./helpers";

test("home uses three panes and guided demo route is removed", async ({
  page,
}) => {
  const removed = await page.goto("/demo");
  expect(removed?.status()).toBe(404);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Account A", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Agent chat" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Payments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Upcoming payments", { exact: true }),
  ).toHaveCount(0);
});
