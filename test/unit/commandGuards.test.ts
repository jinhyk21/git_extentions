import * as assert from "node:assert";
import {
  findMergeRequestUrl,
  getRepositoryFromActionTarget,
  isActionMenuCommandNode,
  isChangedFileCommandNode,
  isRepositoryCommandNode
} from "../../src/extension/commands/commandGuards";

const REPOSITORY_NODE = {
  id: "repo-1",
  name: "repo",
  rootPath: "/tmp/repo",
  children: [],
  isNested: false,
  isSubmodule: false
};

const CHANGED_FILE = {
  path: "file.txt",
  kind: "unstaged" as const,
  indexStatus: " ",
  workTreeStatus: "M"
};

describe("isChangedFileCommandNode", () => {
  it("accepts a well-formed changed file node", () => {
    const node = { type: "changedFile", repository: REPOSITORY_NODE, file: CHANGED_FILE };
    assert.strictEqual(isChangedFileCommandNode(node), true);
  });

  it("rejects null", () => {
    assert.strictEqual(isChangedFileCommandNode(null), false);
  });

  it("rejects a plain string", () => {
    assert.strictEqual(isChangedFileCommandNode("not a node"), false);
  });

  it("rejects an object with the wrong type discriminant", () => {
    assert.strictEqual(isChangedFileCommandNode({ type: "repository" }), false);
  });

  it("rejects an object missing the file field", () => {
    assert.strictEqual(isChangedFileCommandNode({ type: "changedFile", repository: REPOSITORY_NODE }), false);
  });
});

describe("isActionMenuCommandNode", () => {
  it("accepts a well-formed action menu node", () => {
    const node = { type: "actionMenu", repository: REPOSITORY_NODE };
    assert.strictEqual(isActionMenuCommandNode(node), true);
  });

  it("rejects a changed file node", () => {
    const node = { type: "changedFile", repository: REPOSITORY_NODE, file: CHANGED_FILE };
    assert.strictEqual(isActionMenuCommandNode(node), false);
  });

  it("rejects undefined", () => {
    assert.strictEqual(isActionMenuCommandNode(undefined), false);
  });
});

describe("isRepositoryCommandNode", () => {
  it("accepts a repository node", () => {
    assert.strictEqual(isRepositoryCommandNode(REPOSITORY_NODE), true);
  });

  it("rejects a changed file node (no rootPath/children)", () => {
    const node = { type: "changedFile", repository: REPOSITORY_NODE, file: CHANGED_FILE };
    assert.strictEqual(isRepositoryCommandNode(node), false);
  });

  it("rejects a partial object missing children", () => {
    assert.strictEqual(isRepositoryCommandNode({ rootPath: "/tmp", name: "x" }), false);
  });
});

describe("getRepositoryFromActionTarget", () => {
  it("returns the node itself when it is already a repository node", () => {
    const result = getRepositoryFromActionTarget(REPOSITORY_NODE);
    assert.strictEqual(result, REPOSITORY_NODE);
  });

  it("unwraps the repository from an action menu node", () => {
    const node = { type: "actionMenu", repository: REPOSITORY_NODE };
    const result = getRepositoryFromActionTarget(node);
    assert.strictEqual(result, REPOSITORY_NODE);
  });

  it("returns undefined for an unrelated shape", () => {
    assert.strictEqual(getRepositoryFromActionTarget({ foo: "bar" }), undefined);
  });

  it("returns undefined for null", () => {
    assert.strictEqual(getRepositoryFromActionTarget(null), undefined);
  });
});

describe("findMergeRequestUrl", () => {
  it("finds a GitLab merge request URL (underscore form)", () => {
    const output = "remote: To create a merge request, visit:\nremote:   https://gitlab.com/a/b/-/merge_requests/new?x=1";
    assert.strictEqual(
      findMergeRequestUrl(output),
      "https://gitlab.com/a/b/-/merge_requests/new?x=1"
    );
  });

  it("finds a GitLab merge request URL (hyphen form)", () => {
    const output = "remote: https://gitlab.example.com/a/b/-/merge-requests/new";
    assert.strictEqual(findMergeRequestUrl(output), "https://gitlab.example.com/a/b/-/merge-requests/new");
  });

  it("finds a GitHub pull request URL", () => {
    const output = "remote: Create a pull request for 'feature' on GitHub by visiting:\nremote: https://github.com/a/b/pull/new/feature";
    assert.strictEqual(findMergeRequestUrl(output), "https://github.com/a/b/pull/new/feature");
  });

  it("falls back to the first URL when no keyword matches", () => {
    const output = "remote: https://git.example.com/some/custom/hint/page";
    assert.strictEqual(findMergeRequestUrl(output), "https://git.example.com/some/custom/hint/page");
  });

  it("returns undefined when there is no URL at all", () => {
    assert.strictEqual(findMergeRequestUrl("Everything up-to-date"), undefined);
  });

  it("prefers the keyword match over an earlier non-matching URL", () => {
    const output = "https://example.com/unrelated\nhttps://github.com/a/b/pull/new/feature";
    assert.strictEqual(findMergeRequestUrl(output), "https://github.com/a/b/pull/new/feature");
  });

  it("does not fall back to the plain 'To <remote-url>' line git prints on every push", () => {
    // GitHub only prints the "Create a pull request" hint for a NEWLY
    // pushed branch. Pushing to an already-existing branch leaves only the
    // "To <repo-url>" line, which must not be mistaken for a PR link.
    const output = ["To https://github.com/jinhyk21/git_extentions", "   abc1234..def5678  main -> main"].join("\n");
    assert.strictEqual(findMergeRequestUrl(output), undefined);
  });

  it("ignores the 'To' line even when a real PR hint is also present", () => {
    const output = [
      "remote: ",
      "remote: Create a pull request for 'feature' on GitHub by visiting:",
      "remote:      https://github.com/jinhyk21/git_extentions/pull/new/feature",
      "remote: ",
      "To https://github.com/jinhyk21/git_extentions",
      " * [new branch]      feature -> feature"
    ].join("\n");
    assert.strictEqual(findMergeRequestUrl(output), "https://github.com/jinhyk21/git_extentions/pull/new/feature");
  });

  it("falls back to a non-bare-repository URL when no keyword matches", () => {
    const output = "remote: https://git.example.com/some/custom/hint/page\nTo https://git.example.com/org/repo";
    assert.strictEqual(findMergeRequestUrl(output), "https://git.example.com/some/custom/hint/page");
  });
});
