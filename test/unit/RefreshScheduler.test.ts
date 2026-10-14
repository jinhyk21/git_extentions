import * as assert from "node:assert";
import { RefreshScheduler } from "../../src/core/util/RefreshScheduler";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("RefreshScheduler", () => {
  it("coalesces a burst of signals into one refresh", async () => {
    const calls: string[] = [];
    const scheduler = new RefreshScheduler(async (key) => void calls.push(key), 30, 500);

    for (let i = 0; i < 20; i += 1) {
      scheduler.schedule("a");
      await sleep(2);
    }
    await sleep(80);
    scheduler.dispose();

    assert.deepStrictEqual(calls, ["a"]);
  });

  it("still refreshes during continuous activity once maxWait elapses", async () => {
    const calls: string[] = [];
    const scheduler = new RefreshScheduler(async (key) => void calls.push(key), 40, 120);

    for (let i = 0; i < 25; i += 1) {
      scheduler.schedule("a");
      await sleep(10);
    }
    scheduler.dispose();

    assert.ok(calls.length >= 1, "a refresh must run before the burst ends");
  });

  it("keeps keys independent", async () => {
    const calls: string[] = [];
    const scheduler = new RefreshScheduler(async (key) => void calls.push(key), 20, 200);

    scheduler.schedule("a");
    scheduler.schedule("b");
    await sleep(60);
    scheduler.dispose();

    assert.deepStrictEqual([...calls].sort(), ["a", "b"]);
  });

  it("never runs two refreshes of one key at once and reruns once afterwards", async () => {
    let active = 0;
    let peak = 0;
    let runs = 0;
    const scheduler = new RefreshScheduler(
      async () => {
        active += 1;
        runs += 1;
        peak = Math.max(peak, active);
        await sleep(50);
        active -= 1;
      },
      10,
      100
    );

    scheduler.schedule("a");
    await sleep(25); // first refresh now in flight
    scheduler.schedule("a");
    scheduler.schedule("a");
    await sleep(200);
    scheduler.dispose();

    assert.strictEqual(peak, 1);
    assert.strictEqual(runs, 2);
  });

  it("survives a failing refresh", async () => {
    let runs = 0;
    const scheduler = new RefreshScheduler(
      async () => {
        runs += 1;
        throw new Error("boom");
      },
      10,
      50
    );

    scheduler.schedule("a");
    await sleep(40);
    scheduler.schedule("a");
    await sleep(40);
    scheduler.dispose();

    assert.strictEqual(runs, 2);
  });
});
