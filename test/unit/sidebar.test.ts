import * as assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Webview } from "vscode";
import { buildSidebarState } from "../../src/extension/sidebar/buildSidebarState";
import { isSidebarMessage } from "../../src/extension/sidebar/sidebarMessages";
import { getSidebarHtml, SIDEBAR_MESSAGES } from "../../src/extension/sidebar/sidebarTemplate";
import { translate } from "../../src/shared/i18n";
import type { RepositoryNode } from "../../src/shared/types/repository";

const clean = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };

function repo(name: string, overrides: Partial<RepositoryNode> = {}): RepositoryNode {
  return {
    id: `/w/${name}`,
    name,
    rootPath: `/w/${name}`,
    children: [],
    isNested: false,
    isSubmodule: false,
    status: { branch: "main", files: [], ahead: 0, behind: 0, counts: clean },
    ...overrides
  };
}

describe("buildSidebarState", () => {
  it("hides clean in-sync repositories unless showClean is set", () => {
    const dirty = repo("dirty", {
      status: {
        branch: "dev",
        ahead: 1,
        behind: 0,
        counts: { ...clean, unstaged: 1 },
        files: [{ path: "a.ts", kind: "unstaged", indexStatus: " ", workTreeStatus: "M" }]
      }
    });
    const repositories = [repo("clean"), dirty];

    assert.deepStrictEqual(buildSidebarState(repositories, false).repositories.map((r) => r.name), ["dirty"]);
    assert.deepStrictEqual(buildSidebarState(repositories, true).repositories.map((r) => r.name), ["clean", "dirty"]);
  });

  it("keeps a clean parent visible while a nested repository needs attention", () => {
    const child = repo("child", { isNested: true, status: { branch: "x", ahead: 0, behind: 3, counts: clean, files: [] } });
    const state = buildSidebarState([repo("parent", { children: [child] })], false);

    assert.strictEqual(state.repositories[0]?.name, "parent");
    assert.strictEqual(state.repositories[0]?.needsAttention, true);
    assert.strictEqual(state.repositories[0]?.children[0]?.behind, 3);
  });

  it("summarizes files, conflicts and sync across nested repositories", () => {
    const child = repo("child", {
      status: { branch: "b", ahead: 2, behind: 1, counts: { ...clean, conflicted: 1 }, files: [{ path: "c", kind: "conflicted", indexStatus: "U", workTreeStatus: "U" }] }
    });
    const parent = repo("parent", {
      children: [child],
      status: { branch: "m", ahead: 1, behind: 0, counts: { ...clean, staged: 1 }, files: [{ path: "p", kind: "staged", indexStatus: "M", workTreeStatus: " " }] }
    });

    assert.deepStrictEqual(buildSidebarState([parent], false).summary, {
      repositories: 2,
      changedFiles: 2,
      conflicts: 1,
      ahead: 3,
      behind: 1
    });
  });

  it("represents loading and failed repositories", () => {
    const loading = repo("loading", { status: undefined });
    const failed = repo("failed", { status: undefined, statusError: "boom" });
    const [first, second] = buildSidebarState([loading, failed], false).repositories;

    assert.strictEqual(first?.loading, true);
    assert.strictEqual(second?.loading, false);
    assert.strictEqual(second?.error, "boom");
  });

  it("carries operation progress and porcelain codes", () => {
    const state = buildSidebarState(
      [
        repo("rebasing", {
          status: {
            branch: "x",
            ahead: 0,
            behind: 0,
            counts: { ...clean, unstaged: 1 },
            operation: { type: "rebase", currentStep: 2, totalSteps: 4 },
            files: [{ path: "f", kind: "unstaged", indexStatus: " ", workTreeStatus: "M" }]
          }
        })
      ],
      false
    );

    assert.deepStrictEqual(state.repositories[0]?.operation, { type: "rebase", currentStep: 2, totalSteps: 4 });
    assert.strictEqual(state.repositories[0]?.files[0]?.code, " M");
  });
});

describe("isSidebarMessage", () => {
  it("accepts well-formed messages", () => {
    assert.ok(isSidebarMessage({ type: "ready" }));
    assert.ok(isSidebarMessage({ type: "setShowClean", value: true }));
    assert.ok(isSidebarMessage({ type: "commit", repo: "/r", message: "m" }));
    assert.ok(isSidebarMessage({ type: "command", command: "gitWorkspacePro.fetch", repo: "/r" }));
    assert.ok(isSidebarMessage({ type: "command", command: "x", repo: "/r", files: [{ path: "a", kind: "staged" }] }));
  });

  it("rejects malformed messages", () => {
    assert.strictEqual(isSidebarMessage(null), false);
    assert.strictEqual(isSidebarMessage({ type: "unknown" }), false);
    assert.strictEqual(isSidebarMessage({ type: "setShowClean", value: "yes" }), false);
    assert.strictEqual(isSidebarMessage({ type: "commit", repo: 1, message: "m" }), false);
    assert.strictEqual(isSidebarMessage({ type: "command", command: "x", repo: "/r", files: [{ path: 1 }] }), false);
    assert.strictEqual(isSidebarMessage({ type: "command", command: "x", repo: "/r", files: "nope" }), false);
  });
});

describe("sidebar client strings", () => {
  const root = path.resolve(__dirname, "../../..");
  const script = readFileSync(path.join(root, "media/sidebar/sidebar.js"), "utf8");
  const listed = new Set<string>(SIDEBAR_MESSAGES);

  it("lists every string the client script translates", () => {
    const used = [...script.matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g)].map((match) => JSON.parse(`"${match[1]}"`) as string);
    const missing = used.filter((message) => !listed.has(message));

    assert.deepStrictEqual(missing, []);
  });

  it("has Vietnamese and Chinese translations for every sidebar string", () => {
    for (const language of ["vi", "zh-cn"] as const) {
      const untranslated = SIDEBAR_MESSAGES.filter((message) => translate(language, message) === message);
      // A handful of terms are intentionally identical across languages.
      const allowed = new Set(["Stage", "Merge", "Rebase", "Commit", "Pull", "Push", "Fetch"]);
      assert.deepStrictEqual(
        untranslated.filter((message) => !allowed.has(message)),
        [],
        `${language} is missing translations`
      );
    }
  });
});

describe("getSidebarHtml", () => {
  const webview = { cspSource: "vscode-webview://qa" } as Webview;
  const state = buildSidebarState([repo("</script><b>x", { statusError: "<img src=x onerror=1>", status: undefined })], true);
  const html = getSidebarHtml(webview, "vscode-webview://qa/sidebar.js", "vscode-webview://qa/sidebar.css", { state, busy: [] }, "en");

  it("embeds repository data without allowing script-tag breakout", () => {
    assert.strictEqual(html.includes("</script><b>"), false);
    assert.match(html, /\\u003c\/script>/);
  });

  it("uses a restrictive CSP, a nonce'd external script and no inline handlers", () => {
    const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
    assert.ok(nonce);
    assert.ok(html.includes(`<script nonce="${nonce}" src="vscode-webview://qa/sidebar.js">`));
    assert.doesNotMatch(html, /<[^>]*\son[a-z]+=/i);
    assert.doesNotMatch(html, /https?:\/\//);
    assert.doesNotMatch(html, /style="/);
  });

  it("contains the controls the client script binds to", () => {
    for (const id of ["summary", "list", "search", "refresh", "fetchAll", "collapseAll", "toggleClean", "clearSearch", "selection", "menu", "boot"]) {
      assert.strictEqual(html.split(`id="${id}"`).length - 1, 1, `id ${id} must appear exactly once`);
    }
  });
});
