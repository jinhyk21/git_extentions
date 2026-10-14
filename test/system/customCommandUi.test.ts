import * as assert from "node:assert";
import type { Webview } from "vscode";
import { translate } from "../../src/shared/i18n";
import { CUSTOM_COMMAND_MESSAGES, getCustomCommandHtml } from "../../src/extension/webview/customCommandTemplate";

describe("[UI/UX] custom command webview", () => {
  const webview = { cspSource: "vscode-webview://qa-test" } as Webview;
  const html = getCustomCommandHtml(webview, "repo", ["npm test"], true, "en");

  it("renders a multi-line textarea with run, stop and clear controls", () => {
    assert.match(html, /<textarea id="script"/);
    for (const id of ["run", "stop", "clear", "cwd", "autoRefresh", "output"]) {
      assert.strictEqual(html.split(`id="${id}"`).length - 1, 1, `id ${id} must appear exactly once`);
    }
  });

  it("uses a restrictive CSP, a nonce and no inline handlers or remote assets", () => {
    const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
    assert.ok(nonce);
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /https?:\/\//);
  });

  it("cannot be broken out of by hostile history content", () => {
    const hostile = getCustomCommandHtml(webview, "repo", ["</script><img src=x>"], false, "en");
    assert.strictEqual(hostile.includes("</script><img"), false);
  });

  it("renders Vietnamese labels", () => {
    assert.match(getCustomCommandHtml(webview, "repo", [], true, "vi"), /Chạy/);
  });

  it("has Vietnamese and Chinese translations for every string", () => {
    for (const language of ["vi", "zh-cn"] as const) {
      const missing = CUSTOM_COMMAND_MESSAGES.filter((message) => translate(language, message) === message);
      assert.deepStrictEqual(missing, [], `${language} is missing translations`);
    }
  });
});
