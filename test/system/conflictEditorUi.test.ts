import * as assert from "node:assert";
import type { Webview } from "vscode";
import {
  getConflictResolutionHtml,
  type ConflictEditorData
} from "../../src/extension/webview/conflictResolutionTemplate";

describe("[UI/UX] conflict editor webview", () => {
  const webview = { cspSource: "vscode-webview://qa-test" } as Webview;
  const data: ConflictEditorData = {
    filePath: "src/example.ts",
    repositoryName: "qa-repository",
    result: [
      "<<<<<<< HEAD",
      "const value = 'current';",
      "=======",
      "const value = 'incoming';",
      ">>>>>>> feature"
    ].join("\n"),
    base: "const value = 'base';\n",
    current: "const value = 'current';\n",
    incoming: "const value = 'incoming';\n",
    baseExists: true,
    currentExists: true,
    incomingExists: true,
    segments: [
      {
        kind: "conflict",
        oursLabel: "HEAD",
        theirsLabel: "feature",
        ours: "const value = 'current';",
        theirs: "const value = 'incoming';"
      }
    ],
    operation: {
      type: "merge"
    }
  };
  const html = getConflictResolutionHtml(webview, data);

  it("renders the conflict cards and merge controls", () => {
    assert.match(html, /Merge Revisions/);
    assert.match(html, /Changes from/);
    assert.match(html, /"Result":"Result"/);
    assert.match(html, /id="detailsButton"/);
    assert.match(html, /Highlight words/);
    assert.match(html, /Do not ignore/);
    assert.match(html, /\.conflict-row\b/);
    assert.match(html, /\.line-numbers\s*\{/);
    assert.match(html, /≫ Left/);
    assert.match(html, /≪ Right/);
  });

  it("always keeps the three-column layout and has no duplicate IDs", () => {
    assert.match(html, /minmax\(0,\s*1fr\)\s*72px\s*minmax\(0,\s*1\.15fr\)\s*72px\s*minmax\(0,\s*1fr\)/);
    assert.match(html, /min-width:\s*960px/);
    assert.match(html, /@media \(max-width: 760px\)/);
    assert.doesNotMatch(html, /min-width:\s*1040px/);
    assert.match(html, /overflow:\s*auto/);

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it("synchronises horizontal scrolling across the three columns", () => {
    assert.match(html, /scrollSelector/);
    assert.match(html, /addEventListener\('scroll'/);
    assert.match(html, /element\.scrollLeft = left/);
  });

  it("uses a restrictive CSP and a nonce-protected syntactically valid client script", () => {
    assert.match(html, /default-src 'none'/);
    assert.match(html, /script-src 'nonce-[A-Za-z0-9]+'/);
    assert.doesNotMatch(html, /<script(?! nonce=)/);

    const scriptMatch = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(scriptMatch?.[1]);
    assert.doesNotThrow(() => new Function(scriptMatch?.[1] ?? ""));
  });

  it("escapes repository-controlled content before embedding it in the script", () => {
    const hostileHtml = getConflictResolutionHtml(webview, {
      filePath: "</script><style>body{display:none}</style>",
      repositoryName: "<img src=x onerror=alert(1)>",
      result: "</script><script>alert(1)</script>",
      base: "",
      current: "",
      incoming: "",
      baseExists: false,
      currentExists: false,
      incomingExists: false,
      segments: []
    });

    assert.doesNotMatch(hostileHtml, /<img src=x onerror=alert\(1\)>/);
    assert.doesNotMatch(hostileHtml, /<script>alert\(1\)<\/script>/);
    assert.match(hostileHtml, /\\u003cscript>/);
  });

  it("does not use inline event-handler attributes or remote assets", () => {
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /src="https?:\/\//i);
    assert.doesNotMatch(html, /href="https?:\/\//i);
  });

  it("renders Vietnamese and Simplified Chinese conflict-editor controls", () => {
    const vietnamese = getConflictResolutionHtml(webview, {
      ...data,
      language: "vi"
    });
    assert.match(vietnamese, /Giải quyết tất cả xung đột:/);
    assert.match(vietnamese, /Kết quả/);
    assert.match(vietnamese, /Phiên bản gốc/);

    const chinese = getConflictResolutionHtml(webview, {
      ...data,
      language: "zh-cn"
    });
    assert.match(chinese, /解决所有冲突：/);
    assert.match(chinese, /结果/);
    assert.match(chinese, /基础修订/);
  });
});
