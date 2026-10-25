import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBrowserMode } from "./browser-safety";
test("ordinary browser tests reject either configured or persisted public mode", () => {
  assertBrowserMode({ mode: "stub", configuredMode: "stub" }, false);
  for (const data of [
    { mode: "stub", configuredMode: "sepolia" },
    { mode: "sepolia", configuredMode: "stub" },
    { configuredMode: "sepolia" },
    { persistedMode: "sepolia", configuredMode: "stub" },
  ])
    assert.throws(() => assertBrowserMode(data, false));
  assertBrowserMode({ mode: "sepolia" }, true);
  assert.throws(() => assertBrowserMode({ mode: "stub" }, true));
});
