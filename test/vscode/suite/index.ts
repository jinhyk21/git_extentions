import path from "node:path";
import Mocha from "mocha";
import { globSync } from "glob";

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 30_000 });
  for (const file of globSync("**/*.test.js", { cwd: __dirname })) {
    mocha.addFile(path.resolve(__dirname, file));
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures > 0 ? reject(new Error(`${failures} tests failed.`)) : resolve()));
  });
}
