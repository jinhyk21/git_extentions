import * as assert from "node:assert";
import type {
  GitChangedFile,
  GitOperationState,
  RepositoryNode,
  RepositoryStatusSummary
} from "../../src/shared/types/repository";
import { shouldShowRepository } from "../../src/extension/repositoryVisibility";

const CLEAN_STATUS: RepositoryStatusSummary = {
  branch: "main",
  files: [],
  ahead: 0,
  behind: 0,
  counts: {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0
  }
};

function createRepository(
  overrides: Partial<RepositoryNode> = {},
  statusOverrides: Partial<RepositoryStatusSummary> = {}
): RepositoryNode {
  return {
    id: "repo",
    name: "repo",
    rootPath: "/workspace/repo",
    children: [],
    isNested: false,
    isSubmodule: false,
    status: {
      ...CLEAN_STATUS,
      ...statusOverrides,
      counts: {
        ...CLEAN_STATUS.counts,
        ...statusOverrides.counts
      }
    },
    ...overrides
  };
}

function changedFile(kind: GitChangedFile["kind"]): GitChangedFile {
  return {
    path: `${kind}.txt`,
    kind,
    indexStatus: kind === "staged" ? "M" : " ",
    workTreeStatus: kind === "staged" ? " " : "M"
  };
}

describe("shouldShowRepository", () => {
  it("hides a clean repository", () => {
    assert.strictEqual(shouldShowRepository(createRepository()), false);
  });

  for (const kind of ["modified", "staged", "untracked", "conflicted"] as const) {
    it(`shows a repository containing a ${kind} file`, () => {
      const fileKind = kind === "modified" ? "unstaged" : kind;
      assert.strictEqual(
        shouldShowRepository(createRepository({}, { files: [changedFile(fileKind)] })),
        true
      );
    });
  }

  it("shows a repository that is ahead of its upstream", () => {
    assert.strictEqual(shouldShowRepository(createRepository({}, { ahead: 2 })), true);
  });

  it("shows a repository that is behind its upstream", () => {
    assert.strictEqual(shouldShowRepository(createRepository({}, { behind: 3 })), true);
  });

  for (const operation of ["merge", "rebase", "cherry-pick", "revert"] as const) {
    it(`shows a repository while ${operation} is in progress even with no changed files`, () => {
      const operationState: GitOperationState = { type: operation };
      assert.strictEqual(
        shouldShowRepository(createRepository({}, { operation: operationState })),
        true
      );
    });
  }

  it("shows a repository while its status is loading", () => {
    assert.strictEqual(shouldShowRepository(createRepository({ status: undefined })), true);
  });

  it("shows a repository whose status could not be loaded", () => {
    assert.strictEqual(
      shouldShowRepository(
        createRepository({
          status: undefined,
          statusError: "git status failed"
        })
      ),
      true
    );
  });

  it("shows a clean parent when a nested repository has changes", () => {
    const child = createRepository(
      {
        id: "child",
        rootPath: "/workspace/repo/child",
        isNested: true
      },
      { files: [changedFile("unstaged")] }
    );
    assert.strictEqual(shouldShowRepository(createRepository({ children: [child] })), true);
  });

  it("hides a clean parent when all nested repositories are clean", () => {
    const child = createRepository({
      id: "child",
      rootPath: "/workspace/repo/child",
      isNested: true
    });
    assert.strictEqual(shouldShowRepository(createRepository({ children: [child] })), false);
  });
});
