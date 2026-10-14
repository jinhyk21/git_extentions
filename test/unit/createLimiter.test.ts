import * as assert from "node:assert";
import { createLimiter } from "../../src/core/util/createLimiter";

describe("createLimiter", () => {
  it("never runs more than the allowed number of tasks at once", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async (value: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return value;
    };

    const results = await Promise.all([1, 2, 3, 4, 5, 6].map((value) => limit(() => task(value))));

    assert.deepStrictEqual(results, [1, 2, 3, 4, 5, 6]);
    assert.strictEqual(peak, 2);
  });

  it("keeps running queued tasks after one fails", async () => {
    const limit = createLimiter(1);
    const failing = limit(() => Promise.reject(new Error("boom")));
    const following = limit(() => Promise.resolve("ok"));

    await assert.rejects(failing, /boom/);
    assert.strictEqual(await following, "ok");
  });
});
