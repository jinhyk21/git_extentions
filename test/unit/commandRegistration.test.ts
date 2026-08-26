import * as assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("command registration", () => {
  it("registers every command contributed by the extension manifest", () => {
    const workspaceRoot = path.resolve(__dirname, "../../..");
    const manifest = JSON.parse(readFileSync(path.join(workspaceRoot, "package.json"), "utf8")) as {
      readonly contributes: {
        readonly commands: readonly { readonly command: string }[];
      };
    };
    const registrationSource = readFileSync(
      path.join(workspaceRoot, "src/extension/commands/registerCommands.ts"),
      "utf8"
    );

    const missing = manifest.contributes.commands
      .map((entry) => entry.command)
      .filter((command) => !registrationSource.includes(`"${command}"`));

    assert.deepStrictEqual(missing, []);
  });

  it("defines every package localization placeholder in all supported manifest languages", () => {
    const workspaceRoot = path.resolve(__dirname, "../../..");
    const manifestSource = readFileSync(path.join(workspaceRoot, "package.json"), "utf8");
    const placeholders = [...manifestSource.matchAll(/%([^%]+)%/g)].map((match) => match[1]);

    for (const fileName of ["package.nls.json", "package.nls.vi.json", "package.nls.zh-cn.json"]) {
      const translations = JSON.parse(readFileSync(path.join(workspaceRoot, fileName), "utf8")) as Record<string, string>;
      const missing = placeholders.filter((key): key is string => key !== undefined && !translations[key]);
      assert.deepStrictEqual(missing, [], `${fileName} is missing localization keys`);
    }
  });
});
