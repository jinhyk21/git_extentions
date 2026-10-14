import * as assert from "node:assert";
import type { Webview } from "vscode";
import { buildCommitGraph } from "../../src/core/git/buildCommitGraph";
import { getHistoryHtml, HISTORY_MESSAGES } from "../../src/extension/webview/historyTemplate";
import { translate } from "../../src/shared/i18n";

describe("[UI/UX] history webview", () => {
  const webview = { cspSource: "vscode-webview://qa" } as Webview;
  const graph = buildCommitGraph([
    {
      hash: "a".repeat(40),
      abbreviatedHash: "aaaaaaa",
      parentHashes: [],
      authorName: "Ann </script><b>",
      authorEmail: "ann@example.com",
      authorDate: "2026-01-01T00:00:00+00:00",
      subject: "</script><img src=x onerror=alert(1)>",
      refs: []
    }
  ]);
  const html = getHistoryHtml(webview, "repo", graph, "en", { hasMore: true });

  it("cannot be broken out of by commit-controlled content", () => {
    assert.strictEqual(html.includes("</script><img"), false);
    assert.strictEqual(html.includes("</script><b>"), false);
  });

  it("uses a restrictive CSP with a nonce and no inline handlers or remote assets", () => {
    const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
    assert.ok(nonce);
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.doesNotMatch(html, /<[^>]*\son[a-z]+=/i);
    assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  });

  it("contains the search, refresh and rows containers exactly once", () => {
    for (const id of ["search", "clearSearch", "refreshButton", "rows", "toast"]) {
      assert.strictEqual(html.split(`id="${id}"`).length - 1, 1, `id ${id}`);
    }
  });

  it("has Vietnamese and Chinese translations for every history string", () => {
    for (const language of ["vi", "zh-cn"] as const) {
      const missing = HISTORY_MESSAGES.filter((message) => translate(language, message) === message);
      assert.deepStrictEqual(missing, [], `${language} is missing translations`);
    }
  });
});
