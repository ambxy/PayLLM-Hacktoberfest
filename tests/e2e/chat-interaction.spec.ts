import { test, expect } from "@playwright/test";
test("demo controls send access and redemption requests and close the drawer", async ({
  page,
}) => {
  const messages = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    role: "assistant",
    text: `Previous message ${index}.Checking account operations.`,
  }));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({ json: { authenticated: true } });
    if (path === "/api/world")
      return route.fulfill({ json: { authMode: "local-demo" } });
    if (path === "/api/dashboard")
      return route.fulfill({
        json: { initialized: true, td: "800000", movements: [] },
      });
    if (path === "/api/chat/messages") {
      if (route.request().method() === "POST") {
        const text = route.request().postDataJSON().text;
        if (text === "Redeem all investments to TD")
          return route.fulfill({
            status: 400,
            json: { error: "Unable to complete the operation" },
          });
        expect(text).toBe(
          "I grant access to my card payment information and invoices.",
        );
        messages.push({
          id: "new",
          role: "assistant",
          text: "I have prepared an investment proposal.",
        });
      }
      return route.fulfill({ json: messages });
    }
    if (path === "/api/demo/clock")
      return route.fulfill({ json: { date: null, ready: false, stages: [] } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const conversation = page.locator(".agent-conversation");
  await expect(
    page.getByText("Demo actions and common requests", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".chat-plan-actions button")).toHaveCount(0);
  await expect(
    page.getByText("Previous message 29.Checking account operations.", {
      exact: true,
    }),
  ).toBeInViewport();
  await conversation.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole("button", { name: "Open demo controls" }).click();
  await expect(page.locator(".demo-actions button")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Grant card & invoice access", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Demo controls" }),
  ).not.toBeVisible();
  await expect(
    page.getByText("I have prepared an investment proposal.", { exact: true }),
  ).toBeInViewport();
  await expect
    .poll(() =>
      conversation.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThan(5);
  await page.getByRole("button", { name: "Open demo controls" }).click();
  await page
    .getByRole("button", {
      name: "Redeem all investments to TD",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Demo controls" }),
  ).not.toBeVisible();
  await expect(page.locator(".agent-error")).toContainText(
    "Unable to complete the operation",
  );
});
