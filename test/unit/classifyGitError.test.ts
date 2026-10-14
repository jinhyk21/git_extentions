import * as assert from "node:assert";
import { classifyGitError } from "../../src/core/git/classifyGitError";
import { ErrorCodes } from "../../src/shared/constants/errorCodes";

describe("classifyGitError", () => {
  it("classifies 'not a git repository'", () => {
    assert.strictEqual(
      classifyGitError("fatal: not a git repository (or any of the parent directories): .git"),
      ErrorCodes.RepositoryNotFound
    );
  });

  it("classifies missing credentials as auth failure", () => {
    assert.strictEqual(
      classifyGitError("fatal: could not read Username for 'https://github.com': No such device or address"),
      ErrorCodes.AuthFailed
    );
  });

  it("classifies rejected push as remote rejected", () => {
    assert.strictEqual(
      classifyGitError("! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs"),
      ErrorCodes.RemoteRejected
    );
  });

  it("classifies unresolvable host as a network error", () => {
    assert.strictEqual(
      classifyGitError("fatal: unable to access 'https://github.com/x': Could not resolve host: github.com"),
      ErrorCodes.Network
    );
  });

  it("classifies merge conflict", () => {
    assert.strictEqual(
      classifyGitError("Automatic merge failed; fix conflicts and then commit the result."),
      ErrorCodes.MergeConflict
    );
  });

  it("classifies rebase conflict", () => {
    assert.strictEqual(
      classifyGitError("could not apply 1234567... some commit message"),
      ErrorCodes.RebaseConflict
    );
  });

  it("classifies dirty working tree", () => {
    assert.strictEqual(
      classifyGitError("error: Your local changes to the following files would be overwritten by checkout"),
      ErrorCodes.DirtyWorkingTree
    );
  });

  it("classifies timeout", () => {
    assert.strictEqual(classifyGitError("timed out after 10000ms"), ErrorCodes.Timeout);
  });

  it("classifies missing git binary", () => {
    assert.strictEqual(classifyGitError("spawn git ENOENT"), ErrorCodes.GitNotFound);
  });

  it("falls back to UnknownGitError for unrecognized messages", () => {
    assert.strictEqual(classifyGitError("something completely unexpected"), ErrorCodes.UnknownGitError);
  });

  it("classifies hook failures", () => {
    assert.strictEqual(classifyGitError("husky - pre-commit script failed (code 1)"), ErrorCodes.HookFailed);
    assert.strictEqual(classifyGitError("error: failed to push; pre-push hook declined"), ErrorCodes.HookFailed);
  });
});
