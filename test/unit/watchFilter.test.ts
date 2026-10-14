import * as assert from "node:assert";
import { isNoisyPath } from "../../src/extension/watchFilter";

describe("isNoisyPath", () => {
  it("ignores git internals and dependency/build directories", () => {
    assert.strictEqual(isNoisyPath("/w/app/.git/index"), true);
    assert.strictEqual(isNoisyPath("/w/app/node_modules/x/y.js"), true);
    assert.strictEqual(isNoisyPath("C:\\w\\app\\dist\\bundle.js"), true);
    assert.strictEqual(isNoisyPath("/w/app/target/debug/app"), true);
  });

  it("keeps ordinary source files", () => {
    assert.strictEqual(isNoisyPath("/w/app/src/main.go"), false);
    assert.strictEqual(isNoisyPath("/w/app/README.md"), false);
  });

  it("matches whole directory names only", () => {
    assert.strictEqual(isNoisyPath("/w/app/src/outline/readme.md"), false);
    assert.strictEqual(isNoisyPath("/w/app/builders/a.ts"), false);
  });

  it("honours user-excluded directories", () => {
    assert.strictEqual(isNoisyPath("/w/app/vendor/lib/a.go", new Set(["vendor"])), true);
    assert.strictEqual(isNoisyPath("/w/app/vendor/lib/a.go"), false);
  });
});
