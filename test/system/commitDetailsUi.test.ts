import * as assert from "node:assert";
import type { Webview } from "vscode";
import { getCommitDetailsHtml } from "../../src/extension/webview/commitDetailsTemplate";
import type { CommitDetails } from "../../src/shared/types/history";

describe("[UI/UX] commit details webview", () => {
  const webview = { cspSource: "vscode-webview://qa-test" } as Webview;
  const details: CommitDetails = {
    hash: "a".repeat(40),
    parentHashes: ["b".repeat(40)],
    authorName: "Ann <script>",
    authorEmail: "ann@example.com",
    authorDate: "2026-01-01T00:00:00+00:00",
    committerName: "Bob",
    committerDate: "2026-01-01T00:00:00+00:00",
    subject: "<img src=x onerror=alert(1)>",
    body: "body </script><b>x</b>",
    files: [
      { path: "src/<evil>.ts", additions: 2, deletions: 1 },
      { path: "logo.png", additions: null, deletions: null }
    ]
  };
  const html = getCommitDetailsHtml(webview, "repo", details, "en");

  it("escapes every commit-controlled field", () => {
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<b>x<\/b>/);
    assert.doesNotMatch(html, /src\/<evil>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  it("uses a restrictive CSP with a nonce and no inline handlers", () => {
    const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
    assert.ok(nonce);
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.doesNotMatch(html, /<[^>]*\son[a-z]+=/i);
  });

  it("lists files with totals and marks binary files", () => {
    assert.match(html, /2 files changed/);
    assert.match(html, /\+2<\/span> <span class="del">-1/);
    assert.match(html, /binary/);
  });

  it("renders Vietnamese labels", () => {
    assert.match(getCommitDetailsHtml(webview, "repo", details, "vi"), /Tác giả/);
  });
});
