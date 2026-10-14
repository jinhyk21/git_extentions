/* Terminal escape sequences are control characters by definition. */
/* eslint-disable no-control-regex */
export type AnsiSegment = {
  readonly text: string;
  /** Space separated CSS classes, e.g. "fg-red bold"; empty for plain text. */
  readonly classes: string;
};

const COLOR_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

/**
 * Streaming ANSI SGR parser: turns colored terminal output into styled text
 * segments for the webview. State (current colors, a split escape sequence)
 * carries across feed() calls, so arbitrary chunk boundaries are safe. Only
 * colors, bold, dim, italic and underline are kept; every other escape
 * sequence (cursor movement, OSC titles…) is dropped.
 */
export class AnsiParser {
  private foreground = "";
  private background = "";
  private bold = false;
  private dim = false;
  private italic = false;
  private underline = false;
  private pending = "";

  public feed(chunk: string): AnsiSegment[] {
    const input = (this.pending + chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    this.pending = "";
    const segments: AnsiSegment[] = [];
    let text = "";
    let index = 0;

    const flush = () => {
      if (text.length > 0) {
        segments.push({ text, classes: this.classes() });
        text = "";
      }
    };

    while (index < input.length) {
      const char = input[index] as string;
      if (char !== "\u001b") {
        text += char;
        index += 1;
        continue;
      }

      const rest = input.slice(index);
      const csi = /^\u001b\[([0-9;:?]*)([\x20-\x2f]*)([\x40-\x7e])/.exec(rest);
      if (csi) {
        if (csi[3] === "m") {
          flush();
          this.applySgr(csi[1] ?? "");
        }
        index += csi[0].length;
        continue;
      }

      const osc = /^\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/.exec(rest);
      if (osc) {
        index += osc[0].length;
        continue;
      }

      // An escape sequence cut off by the end of the chunk: wait for the rest.
      if (/^\u001b(?:\[[0-9;:?]*[\x20-\x2f]*|\][^\u0007]*)?$/.test(rest) && rest.length < 256) {
        this.pending = rest;
        break;
      }

      // Lone or unsupported escape: drop the ESC byte and one following character.
      index += rest.length > 1 ? 2 : 1;
    }

    flush();
    return segments;
  }

  private classes(): string {
    return [
      this.foreground ? `fg-${this.foreground}` : "",
      this.background ? `bg-${this.background}` : "",
      this.bold ? "bold" : "",
      this.dim ? "dim" : "",
      this.italic ? "italic" : "",
      this.underline ? "underline" : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  private applySgr(parameters: string): void {
    const codes = parameters === "" ? [0] : parameters.split(/[;:]/).map((code) => (code === "" ? 0 : Number(code)));
    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i] as number;
      if (code === 0) {
        this.foreground = "";
        this.background = "";
        this.bold = this.dim = this.italic = this.underline = false;
      } else if (code === 1) this.bold = true;
      else if (code === 2) this.dim = true;
      else if (code === 3) this.italic = true;
      else if (code === 4) this.underline = true;
      else if (code === 22) this.bold = this.dim = false;
      else if (code === 23) this.italic = false;
      else if (code === 24) this.underline = false;
      else if (code >= 30 && code <= 37) this.foreground = COLOR_NAMES[code - 30] as string;
      else if (code >= 90 && code <= 97) this.foreground = `bright-${COLOR_NAMES[code - 90] as string}`;
      else if (code === 39) this.foreground = "";
      else if (code >= 40 && code <= 47) this.background = COLOR_NAMES[code - 40] as string;
      else if (code >= 100 && code <= 107) this.background = `bright-${COLOR_NAMES[code - 100] as string}`;
      else if (code === 49) this.background = "";
      else if (code === 38 || code === 48) {
        // Extended colors (256 / truecolor): skip their arguments; keep the default color.
        const mode = codes[i + 1];
        i += mode === 5 ? 2 : mode === 2 ? 4 : 1;
      }
    }
  }
}
