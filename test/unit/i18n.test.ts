import * as assert from "node:assert";
import { resolveLanguage, translate } from "../../src/shared/i18n";

describe("i18n", () => {
  it("follows the VS Code language when preference is automatic", () => {
    assert.strictEqual(resolveLanguage("auto", "vi"), "vi");
    assert.strictEqual(resolveLanguage("auto", "zh-cn"), "zh-cn");
    assert.strictEqual(resolveLanguage("auto", "en-US"), "en");
  });

  it("uses an explicit extension language instead of the VS Code language", () => {
    assert.strictEqual(resolveLanguage("vi", "en"), "vi");
    assert.strictEqual(resolveLanguage("en", "zh-cn"), "en");
    assert.strictEqual(resolveLanguage("zh-cn", "vi"), "zh-cn");
  });

  it("translates Vietnamese and interpolates values", () => {
    assert.strictEqual(
      translate("vi", "Resolve: {file}", { file: "src/app.ts" }),
      "Giải quyết xung đột: src/app.ts"
    );
  });

  it("translates Simplified Chinese and interpolates values", () => {
    assert.strictEqual(
      translate("zh-cn", "History: {repository}", { repository: "demo" }),
      "历史：demo"
    );
  });

  it("keeps English source text as the fallback", () => {
    assert.strictEqual(translate("en", "Unknown message"), "Unknown message");
    assert.strictEqual(translate("vi", "Unknown {value}", { value: 42 }), "Unknown 42");
  });
});
