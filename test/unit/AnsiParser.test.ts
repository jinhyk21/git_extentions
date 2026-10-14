import * as assert from "node:assert";
import { AnsiParser } from "../../src/core/shell/AnsiParser";

describe("AnsiParser", () => {
  it("passes plain text through", () => {
    assert.deepStrictEqual(new AnsiParser().feed("hello\nworld"), [{ text: "hello\nworld", classes: "" }]);
  });

  it("applies and resets colors and bold", () => {
    const segments = new AnsiParser().feed("a\u001b[1;31mred\u001b[0mb");

    assert.deepStrictEqual(segments, [
      { text: "a", classes: "" },
      { text: "red", classes: "fg-red bold" },
      { text: "b", classes: "" }
    ]);
  });

  it("supports bright colors and backgrounds", () => {
    assert.deepStrictEqual(new AnsiParser().feed("\u001b[92;44mok"), [{ text: "ok", classes: "fg-bright-green bg-blue" }]);
  });

  it("keeps style across chunks and survives a split escape sequence", () => {
    const parser = new AnsiParser();

    assert.deepStrictEqual(parser.feed("x\u001b[3"), [{ text: "x", classes: "" }]);
    assert.deepStrictEqual(parser.feed("2mgreen"), [{ text: "green", classes: "fg-green" }]);
    assert.deepStrictEqual(parser.feed(" more"), [{ text: " more", classes: "fg-green" }]);
  });

  it("drops cursor movement, OSC titles and extended colors", () => {
    const segments = new AnsiParser().feed("\u001b[2K\u001b[1Aline\u001b]0;title\u0007\u001b[38;5;200mtext\u001b[38;2;1;2;3mmore");

    assert.strictEqual(segments.map((segment) => segment.text).join(""), "linetextmore");
    assert.ok(segments.every((segment) => segment.classes === ""));
  });

  it("turns carriage-return progress updates into separate lines", () => {
    assert.strictEqual(new AnsiParser().feed("10%\r50%\r100%\r\ndone").map((s) => s.text).join(""), "10%\n50%\n100%\ndone");
  });
});
