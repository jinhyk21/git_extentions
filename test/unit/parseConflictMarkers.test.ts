import * as assert from "node:assert";
import { hasConflictMarkers, parseConflictMarkers } from "../../src/core/git/parseConflictMarkers";

describe("parseConflictMarkers", () => {
  it("returns a single context segment for content with no conflict markers", () => {
    const segments = parseConflictMarkers("line1\nline2");

    assert.strictEqual(segments.length, 1);
    assert.strictEqual(segments[0]?.kind, "context");
    assert.strictEqual(segments[0]?.kind === "context" ? segments[0].text : "", "line1\nline2");
  });

  it("splits context/conflict/context around a single conflict block", () => {
    const content = ["before", "<<<<<<< HEAD", "ours line", "=======", "theirs line", ">>>>>>> feature", "after"].join(
      "\n"
    );

    const segments = parseConflictMarkers(content);

    assert.strictEqual(segments.length, 3);
    assert.strictEqual(segments[0]?.kind, "context");
    assert.strictEqual(segments[1]?.kind, "conflict");
    assert.strictEqual(segments[2]?.kind, "context");

    const conflict = segments[1];
    if (conflict?.kind !== "conflict") {
      throw new Error("expected conflict segment");
    }
    assert.strictEqual(conflict.oursLabel, "HEAD");
    assert.strictEqual(conflict.theirsLabel, "feature");
    assert.strictEqual(conflict.ours, "ours line");
    assert.strictEqual(conflict.theirs, "theirs line");
  });

  it("defaults labels when the markers carry no ref name", () => {
    const content = ["<<<<<<<", "ours", "=======", "theirs", ">>>>>>>"].join("\n");

    const segments = parseConflictMarkers(content);
    const conflict = segments[0];
    if (conflict?.kind !== "conflict") {
      throw new Error("expected conflict segment");
    }

    assert.strictEqual(conflict.oursLabel, "HEAD");
    assert.strictEqual(conflict.theirsLabel, "incoming");
  });

  it("handles multiple conflict blocks in the same file", () => {
    const content = [
      "<<<<<<< HEAD",
      "a-ours",
      "=======",
      "a-theirs",
      ">>>>>>> branch-a",
      "middle",
      "<<<<<<< HEAD",
      "b-ours",
      "=======",
      "b-theirs",
      ">>>>>>> branch-b"
    ].join("\n");

    const segments = parseConflictMarkers(content);
    const conflictSegments = segments.filter((segment) => segment.kind === "conflict");

    assert.strictEqual(conflictSegments.length, 2);
    assert.strictEqual(segments.filter((segment) => segment.kind === "context").length, 1);
  });

  it("supports multi-line ours/theirs bodies", () => {
    const content = ["<<<<<<< HEAD", "line a", "line b", "=======", "line c", "line d", ">>>>>>> feature"].join("\n");

    const segments = parseConflictMarkers(content);
    const conflict = segments[0];
    if (conflict?.kind !== "conflict") {
      throw new Error("expected conflict segment");
    }

    assert.strictEqual(conflict.ours, "line a\nline b");
    assert.strictEqual(conflict.theirs, "line c\nline d");
  });

  it("hasConflictMarkers is false for plain content", () => {
    assert.strictEqual(hasConflictMarkers("no markers here"), false);
  });

  it("hasConflictMarkers is true when a conflict block is present", () => {
    const content = ["<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> feature"].join("\n");
    assert.strictEqual(hasConflictMarkers(content), true);
  });

  it("does not treat a lone marker line as a conflict without a full block", () => {
    assert.strictEqual(hasConflictMarkers("<<<<<<< not a real conflict"), false);
  });
});
