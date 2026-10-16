const { execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
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
  "binary",
  "showcase"
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

// Rich fixture for eyeballing the conflict editor UI: multi-line hunks, a very long line
// (horizontal scroll), one side deleting a block, add/add, diff3 base, unchanged context
// between hunks, and two more conflicted files (CSS and Markdown).
function buildShowcaseService(side) {
  const pick = (base, current, incoming) => (side === "base" ? base : side === "current" ? current : incoming);
  return [
    "import { Order, OrderLine } from \"./models\";",
    "import { logger } from \"./logger\";",
    "",
    "// Pricing helpers -----------------------------------------------------",
    "",
    ...pick(
      [
        "export function lineTotal(line: OrderLine): number {",
        "  return line.price * line.quantity;",
        "}"
      ],
      [
        "export function lineTotal(line: OrderLine): number {",
        "  const gross = line.price * line.quantity;",
        "  const discount = line.discountRate ?? 0;",
        "  return Math.round(gross * (1 - discount) * 100) / 100;",
        "}"
      ],
      [
        "export function lineTotal(line: OrderLine, taxRate = 0.1): number {",
        "  const net = line.price * line.quantity;",
        "  return net + net * taxRate;",
        "}"
      ]
    ),
    "",
    "export function orderSubtotal(order: Order): number {",
    "  return order.lines.reduce((sum, line) => sum + lineTotal(line), 0);",
    "}",
    "",
    "// Configuration -------------------------------------------------------",
    "",
    ...pick(
      ["export const ENDPOINT = \"https://api.example.com/v1/orders\";"],
      ["export const ENDPOINT = \"https://api.example.com/v2/orders?include=lines,customer,shipping,payments,audit-trail&expand=all&pageSize=250&sort=createdAt:desc&locale=en-US\";"],
      ["export const ENDPOINT = \"https://api.example.com/v1/orders?include=lines&pageSize=50&region=eu-west-1&featureFlags=bulk-import,partial-refund,idempotent-retry,async-webhooks\";"]
    ),
    "",
    "export const MAX_RETRIES = 3;",
    "export const TIMEOUT_MS = 5000;",
    "",
    "// Validation ----------------------------------------------------------",
    "",
    ...pick(
      [
        "export function validate(order: Order): string[] {",
        "  const errors: string[] = [];",
        "  if (order.lines.length === 0) {",
        "    errors.push(\"Order has no lines\");",
        "  }",
        "  if (!order.customerId) {",
        "    errors.push(\"Missing customer\");",
        "  }",
        "  return errors;",
        "}"
      ],
      [
        "export function validate(order: Order): string[] {",
        "  const errors: string[] = [];",
        "  if (order.lines.length === 0) {",
        "    errors.push(\"Order has no lines\");",
        "  }",
        "  return errors;",
        "}"
      ],
      [
        "export function validate(order: Order): string[] {",
        "  const errors: string[] = [];",
        "  if (order.lines.length === 0) {",
        "    errors.push(\"Order has no lines\");",
        "  }",
        "  if (!order.customerId) {",
        "    errors.push(\"Order is missing a customer\");",
        "  }",
        "  if (order.lines.some((line) => line.quantity <= 0)) {",
        "    errors.push(\"Quantities must be positive\");",
        "  }",
        "  return errors;",
        "}"
      ]
    ),
    "",
    "export function isEmpty(order: Order): boolean {",
    "  return order.lines.length === 0;",
    "}",
    "",
    "// Exports -------------------------------------------------------------",
    "",
    ...pick(
      ["export const VERSION = \"1.0.0\";"],
      ["export const VERSION = \"1.1.0\";", "export const BUILD = \"main-4821\";"],
      ["export const VERSION = \"2.0.0-beta\";", "export const CHANNEL = \"beta\";"]
    ),
    "",
    "logger.info(\"order service loaded\");",
    ""
  ].join("\n");
}

function buildShowcaseCss(side) {
  const accent = side === "base" ? "#3b82f6" : side === "current" ? "#2563eb" : "#10b981";
  const radius = side === "base" ? "4px" : side === "current" ? "8px" : "16px";
  return [
    ":root {",
    `  --accent: ${accent};`,
    "  --text: #1f2937;",
    "  --surface: #ffffff;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "  font-family: system-ui, sans-serif;",
    "  color: var(--text);",
    "}",
    "",
    ".card {",
    `  border-radius: ${radius};`,
    "  background: var(--surface);",
    "}",
    ""
  ].join("\n");
}

function buildShowcaseNotes(side) {
  const line = side === "base"
    ? "Run `npm test` before opening a pull request."
    : side === "current"
      ? "Run `npm test` and `npm run lint` before opening a pull request."
      : "Run `pnpm test` before opening a pull request, and tag a reviewer.";
  return [
    "# Contributing",
    "",
    "Thanks for helping out!",
    "",
    "## Before you push",
    "",
    line,
    "",
    "## Questions",
    "",
    "Ask in the team channel.",
    ""
  ].join("\n");
}

function createShowcaseConflict(repositoryPath) {
  git(repositoryPath, ["config", "merge.conflictStyle", "diff3"]);
  const write = (side) => {
    writeText(repositoryPath, "src/orderService.ts", buildShowcaseService(side));
    writeText(repositoryPath, "src/styles/theme.css", buildShowcaseCss(side));
    writeText(repositoryPath, "docs/CONTRIBUTING.md", buildShowcaseNotes(side));
  };

  write("base");
  commitAll(repositoryPath, "initial showcase fixture");

  git(repositoryPath, ["switch", "--quiet", "-c", "feature/incoming"]);
  write("incoming");
  commitAll(repositoryPath, "incoming: tax rate, region endpoint, stricter validation");

  git(repositoryPath, ["switch", "--quiet", "main"]);
  write("current");
  commitAll(repositoryPath, "current: discounts, v2 endpoint, simpler validation");
  expectConflict(repositoryPath, ["merge", "feature/incoming"]);
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
    outputPath: outputValue ? path.resolve(outputValue) : undefined,
    force: argumentsList.includes("--force")
  };
}

function main() {
  const { scenario, outputPath, force } = parseArguments();
  if (outputPath && existsSync(outputPath)) {
    // --force only replaces a previous fixture, never an arbitrary directory.
    const isPreviousFixture = path.basename(outputPath).startsWith("manual-conflict-test")
      && existsSync(path.join(outputPath, ".git"));
    if (!force || !isPreviousFixture) {
      throw new Error(`Output directory already exists: ${outputPath}`
        + (force ? " (--force only replaces a manual-conflict-test* git fixture)" : " (use --force to replace a manual-conflict-test* fixture)"));
    }
    rmSync(outputPath, { recursive: true, force: true });
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
    case "showcase":
      createShowcaseConflict(repositoryPath);
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
