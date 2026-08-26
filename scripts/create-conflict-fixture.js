const { execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const SUPPORTED_SCENARIOS = new Set([
  "merge",
  "five-hunks",
  "rebase",
  "multi",
  "modify-delete",
  "binary"
]);

function git(repositoryPath, args) {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function writeText(repositoryPath, relativePath, content) {
  const absolutePath = path.join(repositoryPath, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

function commitAll(repositoryPath, message) {
  git(repositoryPath, ["add", "-A"]);
  git(repositoryPath, ["commit", "--quiet", "-m", message]);
}

function initializeRepository(repositoryPath) {
  git(repositoryPath, ["init", "--quiet", "--initial-branch=main"]);
  git(repositoryPath, ["config", "user.email", "conflict-test@example.com"]);
  git(repositoryPath, ["config", "user.name", "Conflict Test"]);
}

function expectConflict(repositoryPath, args) {
  try {
    git(repositoryPath, args);
  } catch (error) {
    if (error && typeof error.status === "number" && error.status !== 0) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected a conflict from: git ${args.join(" ")}`);
}

function createTextMergeConflict(repositoryPath) {
  writeText(
    repositoryPath,
    "src/conflict-demo.ts",
    "export function greeting(): string {\n  return \"base\";\n}\n"
  );
  commitAll(repositoryPath, "initial conflict fixture");

  git(repositoryPath, ["switch", "--quiet", "-c", "feature/incoming"]);
  writeText(
    repositoryPath,
    "src/conflict-demo.ts",
    "export function greeting(): string {\n  return \"incoming from feature\";\n}\n"
  );
  commitAll(repositoryPath, "change greeting on feature");

  git(repositoryPath, ["switch", "--quiet", "main"]);
  writeText(
    repositoryPath,
    "src/conflict-demo.ts",
    "export function greeting(): string {\n  return \"current from main\";\n}\n"
  );
  commitAll(repositoryPath, "change greeting on main");
  expectConflict(repositoryPath, ["merge", "feature/incoming"]);
}

function buildFiveHunkContent(side) {
  const conflictValue = (index) => side === "base"
    ? `base value ${index}`
    : side === "current"
      ? `current value ${index} from main`
      : `incoming value ${index} from feature`;

  const sections = [];
  for (let index = 1; index <= 5; index += 1) {
    sections.push(
      [
        `export function conflictArea${index}(): string {`,
        `  return "${conflictValue(index)}";`,
        "}",
        "",
        `// Stable context ${index}.1 — this line must remain unchanged.`,
        `// Stable context ${index}.2 — this line must remain unchanged.`,
        `// Stable context ${index}.3 — this line must remain unchanged.`,
        `// Stable context ${index}.4 — this line must remain unchanged.`,
        `// Stable context ${index}.5 — this line must remain unchanged.`,
        `// Stable context ${index}.6 — this line must remain unchanged.`,
        `// Stable context ${index}.7 — this line must remain unchanged.`,
        `// Stable context ${index}.8 — this line must remain unchanged.`,
        `export const stableValue${index} = "unchanged value ${index}";`,
        ""
      ].join("\n")
    );
  }

  return [
    "// This header is intentionally conflict-free.",
    "export const fixtureName = \"five separated conflict hunks\";",
    "",
    "export function unchangedBeforeConflicts(): string {",
    "  return \"this function must not change\";",
    "}",
    "",
    ...sections,
    "export function unchangedAfterConflicts(): string {",
    "  return \"this footer must also remain unchanged\";",
    "}",
    ""
  ].join("\n");
}

function createFiveHunkConflict(repositoryPath) {
  writeText(repositoryPath, "src/conflict-demo.ts", buildFiveHunkContent("base"));
  commitAll(repositoryPath, "initial five-hunk conflict fixture");

  git(repositoryPath, ["switch", "--quiet", "-c", "feature/incoming"]);
  writeText(repositoryPath, "src/conflict-demo.ts", buildFiveHunkContent("incoming"));
  commitAll(repositoryPath, "change five areas on feature");

  git(repositoryPath, ["switch", "--quiet", "main"]);
  writeText(repositoryPath, "src/conflict-demo.ts", buildFiveHunkContent("current"));
  commitAll(repositoryPath, "change five areas on main");
  expectConflict(repositoryPath, ["merge", "feature/incoming"]);

  const content = require("node:fs").readFileSync(
    path.join(repositoryPath, "src/conflict-demo.ts"),
    "utf8"
  );
  const conflictCount = (content.match(/^<<<<<<< /gm) || []).length;
  if (conflictCount < 5) {
    throw new Error(`Expected at least 5 conflict hunks, found ${conflictCount}.`);
  }
}

function createRebaseConflict(repositoryPath) {
  writeText(repositoryPath, "src/rebase-demo.ts", "export const source = \"base\";\n");
  commitAll(repositoryPath, "initial rebase fixture");

  git(repositoryPath, ["switch", "--quiet", "-c", "feature/rebase"]);
  writeText(repositoryPath, "src/rebase-demo.ts", "export const source = \"feature commit\";\n");
  commitAll(repositoryPath, "feature rebase change");

  git(repositoryPath, ["switch", "--quiet", "main"]);
  writeText(repositoryPath, "src/rebase-demo.ts", "export const source = \"main commit\";\n");
  commitAll(repositoryPath, "main rebase change");

  git(repositoryPath, ["switch", "--quiet", "feature/rebase"]);
  expectConflict(repositoryPath, ["rebase", "main"]);
}

function createMultipleConflicts(repositoryPath) {
  const files = ["src/first.ts", "src/second.ts", "src/third.ts"];
  for (const filePath of files) {
    writeText(repositoryPath, filePath, `export const value = "base:${filePath}";\n`);
  }
  commitAll(repositoryPath, "initial multi-conflict fixture");

  git(repositoryPath, ["switch", "--quiet", "-c", "feature/multiple"]);
  for (const filePath of files) {
    writeText(repositoryPath, filePath, `export const value = "incoming:${filePath}";\n`);
  }
  commitAll(repositoryPath, "change three files on feature");

  git(repositoryPath, ["switch", "--quiet", "main"]);
  for (const filePath of files) {
    writeText(repositoryPath, filePath, `export const value = "current:${filePath}";\n`);
  }
  commitAll(repositoryPath, "change three files on main");
  expectConflict(repositoryPath, ["merge", "feature/multiple"]);
}

function createModifyDeleteConflict(repositoryPath) {
  writeText(repositoryPath, "src/modify-delete.ts", "export const state = \"base\";\n");
  commitAll(repositoryPath, "initial modify-delete fixture");

  git(repositoryPath, ["switch", "--quiet", "-c", "feature/modify"]);
  writeText(repositoryPath, "src/modify-delete.ts", "export const state = \"modified on feature\";\n");
  commitAll(repositoryPath, "modify file on feature");

  git(repositoryPath, ["switch", "--quiet", "main"]);
  git(repositoryPath, ["rm", "--quiet", "src/modify-delete.ts"]);
  commitAll(repositoryPath, "delete file on main");
  expectConflict(repositoryPath, ["merge", "feature/modify"]);
}

function createBinaryConflict(repositoryPath) {
  const binaryPath = path.join(repositoryPath, "assets/conflict.bin");
  mkdirSync(path.dirname(binaryPath), { recursive: true });
  writeFileSync(binaryPath, Buffer.from([0, 1, 2, 3]));
  commitAll(repositoryPath, "initial binary fixture");

  git(repositoryPath, ["switch", "--quiet", "-c", "feature/binary"]);
  writeFileSync(binaryPath, Buffer.from([0, 9, 9, 9]));
  commitAll(repositoryPath, "change binary on feature");

  git(repositoryPath, ["switch", "--quiet", "main"]);
  writeFileSync(binaryPath, Buffer.from([0, 8, 8, 8]));
  commitAll(repositoryPath, "change binary on main");
  expectConflict(repositoryPath, ["merge", "feature/binary"]);
}

function parseArguments() {
  const argumentsList = process.argv.slice(2);
  const scenario = argumentsList.find((argument) => !argument.startsWith("--")) || "merge";
  if (!SUPPORTED_SCENARIOS.has(scenario)) {
    throw new Error(
      `Unsupported scenario "${scenario}". Choose: ${[...SUPPORTED_SCENARIOS].join(", ")}`
    );
  }
  const outputIndex = argumentsList.indexOf("--output");
  const outputValue = outputIndex === -1 ? undefined : argumentsList[outputIndex + 1];
  if (outputIndex !== -1 && !outputValue) {
    throw new Error("--output requires a directory path.");
  }
  return {
    scenario,
    outputPath: outputValue ? path.resolve(outputValue) : undefined
  };
}

function main() {
  const { scenario, outputPath } = parseArguments();
  if (outputPath && existsSync(outputPath)) {
    throw new Error(`Output directory already exists: ${outputPath}`);
  }
  const repositoryPath = outputPath ?? mkdtempSync(path.join(tmpdir(), `gwp-${scenario}-conflict-`));
  if (outputPath) {
    mkdirSync(repositoryPath, { recursive: false });
  }
  initializeRepository(repositoryPath);

  switch (scenario) {
    case "merge":
      createTextMergeConflict(repositoryPath);
      break;
    case "five-hunks":
      createFiveHunkConflict(repositoryPath);
      break;
    case "rebase":
      createRebaseConflict(repositoryPath);
      break;
    case "multi":
      createMultipleConflicts(repositoryPath);
      break;
    case "modify-delete":
      createModifyDeleteConflict(repositoryPath);
      break;
    case "binary":
      createBinaryConflict(repositoryPath);
      break;
  }

  const conflictedFiles = git(repositoryPath, ["diff", "--name-only", "--diff-filter=U"])
    .split(/\r?\n/)
    .filter(Boolean);
  if (conflictedFiles.length === 0) {
    throw new Error("Fixture creation completed without any conflicted files.");
  }

  console.log("");
  console.log("Conflict fixture created successfully.");
  console.log(`Scenario: ${scenario}`);
  console.log(`Repository: ${repositoryPath}`);
  console.log(`Conflicted files: ${conflictedFiles.join(", ")}`);
  console.log("");
  console.log("Open it in VS Code:");
  console.log(`code "${repositoryPath}"`);
  console.log("");
  console.log("Then open Git Workspace Pro > Repositories > Conflicted.");
  console.log("Use Resolve Conflict, Apply & Stage, then Continue or Abort.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
