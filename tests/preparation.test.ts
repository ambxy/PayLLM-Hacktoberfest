import { test } from "node:test";
import assert from "node:assert/strict";
import { preparationAmount } from "../src/integrations/aave/preparation";
test("preparation preserves units and rejects unsafe quantities", () => {
  assert.equal(preparationAmount("mint", "2500"), 2500000000n);
  assert.equal(preparationAmount("fund", "0.01"), 10000000000000000n);
  for (const input of ["0", "-1", "1e3", "0.0000001", "10001"])
    assert.throws(() => preparationAmount("mint", input));
  assert.throws(() => preparationAmount("fund", "0.100000000000000001"));
  assert.throws(() => preparationAmount("other", "1"));
});
