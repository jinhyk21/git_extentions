export type ConflictSegment =
  | { readonly kind: "context"; readonly text: string }
  | {
      readonly kind: "conflict";
      readonly oursLabel: string;
      readonly theirsLabel: string;
      readonly ours: string;
      readonly theirs: string;
    };

const CONFLICT_START = /^<{7}(?: (.*))?$/;
const CONFLICT_MIDDLE = /^={7}$/;
const CONFLICT_END = /^>{7}(?: (.*))?$/;

export function parseConflictMarkers(content: string): readonly ConflictSegment[] {
  const lines = content.split(/\r?\n/);
  const segments: ConflictSegment[] = [];

  let contextLines: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const startMatch = CONFLICT_START.exec(line);

    if (!startMatch) {
      contextLines.push(line);
      index += 1;
      continue;
    }

    if (contextLines.length > 0) {
      segments.push({ kind: "context", text: contextLines.join("\n") });
      contextLines = [];
    }

    const startLineIndex = index;
    const oursLabel = startMatch[1] ?? "HEAD";
    const oursLines: string[] = [];
    index += 1;

    while (index < lines.length && !CONFLICT_MIDDLE.test(lines[index] ?? "")) {
      oursLines.push(lines[index] ?? "");
      index += 1;
    }

    if (index >= lines.length) {
      // No closing "=======" found before EOF — not a real conflict block,
      // treat the "<<<<<<<" line and everything after it as plain context.
      contextLines.push(...lines.slice(startLineIndex));
      index = lines.length;
      continue;
    }
    index += 1;

    const theirsLines: string[] = [];
    let theirsLabel = "incoming";
    let closed = false;
    while (index < lines.length) {
      const endMatch = CONFLICT_END.exec(lines[index] ?? "");
      if (endMatch) {
        theirsLabel = endMatch[1] ?? theirsLabel;
        index += 1;
        closed = true;
        break;
      }
      theirsLines.push(lines[index] ?? "");
      index += 1;
    }

    if (!closed) {
      // No closing ">>>>>>>" found before EOF — not a real conflict block,
      // treat the whole thing as plain context instead of a partial conflict.
      contextLines.push(...lines.slice(startLineIndex));
      index = lines.length;
      continue;
    }

    segments.push({
      kind: "conflict",
      oursLabel,
      theirsLabel,
      ours: oursLines.join("\n"),
      theirs: theirsLines.join("\n")
    });
  }

  if (contextLines.length > 0) {
    segments.push({ kind: "context", text: contextLines.join("\n") });
  }

  return segments;
}

export function hasConflictMarkers(content: string): boolean {
  return parseConflictMarkers(content).some((segment) => segment.kind === "conflict");
}
