import * as assert from "node:assert";
import { buildCompareUrl, parseRemoteUrl } from "../../src/extension/commands/buildCompareUrl";

describe("parseRemoteUrl", () => {
  it("parses an HTTPS GitHub remote", () => {
    const parsed = parseRemoteUrl("https://github.com/jinhyk21/git_extentions");
    assert.strictEqual(parsed?.host, "github.com");
    assert.strictEqual(parsed?.kind, "github");
    assert.strictEqual(parsed?.pathWithoutGitSuffix, "jinhyk21/git_extentions");
  });

  it("parses an HTTPS GitHub remote with a .git suffix", () => {
    const parsed = parseRemoteUrl("https://github.com/jinhyk21/git_extentions.git");
    assert.strictEqual(parsed?.pathWithoutGitSuffix, "jinhyk21/git_extentions");
  });

  it("parses an SSH GitHub remote", () => {
    const parsed = parseRemoteUrl("git@github.com:jinhyk21/git_extentions.git");
    assert.strictEqual(parsed?.host, "github.com");
    assert.strictEqual(parsed?.kind, "github");
    assert.strictEqual(parsed?.pathWithoutGitSuffix, "jinhyk21/git_extentions");
  });

  it("parses an HTTPS GitLab remote with a nested group path", () => {
    const parsed = parseRemoteUrl("https://gitlab.com/group/subgroup/repo.git");
    assert.strictEqual(parsed?.kind, "gitlab");
    assert.strictEqual(parsed?.pathWithoutGitSuffix, "group/subgroup/repo");
  });

  it("marks a self-hosted, unrecognized host as unknown", () => {
    const parsed = parseRemoteUrl("https://git.example.com/org/repo.git");
    assert.strictEqual(parsed?.kind, "unknown");
  });

  it("returns undefined for a malformed remote URL", () => {
    assert.strictEqual(parseRemoteUrl("not a url"), undefined);
  });
});

describe("buildCompareUrl", () => {
  it("builds a GitHub compare URL for a branch", () => {
    const url = buildCompareUrl("https://github.com/jinhyk21/git_extentions", "feature/foo");
    assert.strictEqual(url, "https://github.com/jinhyk21/git_extentions/compare/feature%2Ffoo?expand=1");
  });

  it("builds the same GitHub compare URL from an SSH remote", () => {
    const url = buildCompareUrl("git@github.com:jinhyk21/git_extentions.git", "main");
    assert.strictEqual(url, "https://github.com/jinhyk21/git_extentions/compare/main?expand=1");
  });

  it("builds a GitLab merge request URL for a branch", () => {
    const url = buildCompareUrl("https://gitlab.com/group/repo.git", "feature");
    assert.strictEqual(
      url,
      "https://gitlab.com/group/repo/-/merge_requests/new?merge_request%5Bsource_branch%5D=feature"
    );
  });

  it("returns undefined for an unrecognized host", () => {
    assert.strictEqual(buildCompareUrl("https://git.example.com/org/repo", "main"), undefined);
  });
});
