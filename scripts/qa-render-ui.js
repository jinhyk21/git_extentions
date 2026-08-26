const { spawnSync } = require("node:child_process");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { getConflictResolutionHtml } = require("../out-test/src/extension/webview/conflictResolutionTemplate");

const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const artifactDirectory = path.resolve("qa-artifacts");
const harnessPath = path.join(tmpdir(), `gwp-conflict-ui-${process.pid}.html`);

function buildHarness() {
  const segments = [
    {
      kind: "context",
      text: [
        "export interface Book {",
        "  title: string;",
        "  author: string;",
        "}"
      ].join("\n")
    }
  ];
  for (let index = 1; index <= 5; index += 1) {
    segments.push({
      kind: "conflict",
      oursLabel: "main",
      baseLabel: "base",
      theirsLabel: "feature/merge-editor",
      ours: `export const value${index}: string = "current-${index}";`,
      base: `export const value${index}: string = "base-${index}";`,
      theirs: `export const value${index}: string = "incoming-${index}";`
    });
    segments.push({
      kind: "context",
      text: [
        `// Stable context after conflict ${index}`,
        `export const stable${index} = "unchanged-${index}";`
      ].join("\n")
    });
  }
  segments.push({
    kind: "context",
    text: "export const footer = \"unchanged footer\";"
  });

  const fullContent = (side) => segments.map((segment) => {
    if (segment.kind === "context") return segment.text;
    if (side === "current") return segment.ours;
    if (side === "incoming") return segment.theirs;
    return segment.base;
  }).join("\n");
  const workingResult = segments.map((segment) => {
    if (segment.kind === "context") return segment.text;
    return [
      "<<<<<<< main",
      segment.ours,
      "=======",
      segment.theirs,
      ">>>>>>> feature/merge-editor"
    ].join("\n");
  }).join("\n");

  const html = getConflictResolutionHtml(
    { cspSource: "file:" },
    {
      filePath: "src/services/mergeService.ts",
      repositoryName: "git-workspace-pro",
      result: workingResult,
      base: fullContent("base"),
      current: fullContent("current"),
      incoming: fullContent("incoming"),
      baseExists: true,
      currentExists: true,
      incomingExists: true,
      segments,
      operation: {
        type: "rebase",
        currentStep: 2,
        totalSteps: 4
      }
    }
  );
  const nonce = /<script nonce="([^"]+)">/.exec(html)?.[1];
  if (!nonce) {
    throw new Error("Unable to find the webview script nonce.");
  }

  const bootstrap = `<script nonce="${nonce}">
    window.__qaErrors = [];
    window.__qaMessages = [];
    window.acquireVsCodeApi = () => ({
      postMessage: (message) => window.__qaMessages.push(message),
      getState: () => undefined,
      setState: () => undefined
    });
    window.addEventListener('error', (event) => window.__qaErrors.push(String(event.error || event.message)));
    window.addEventListener('unhandledrejection', (event) => window.__qaErrors.push(String(event.reason)));
  </script>`;
  const verifier = `<script nonce="${nonce}">
    (() => {
      const leftAcceptButtons = [...document.querySelectorAll('.action-gutter.conflict-left .hunk-action:not(.reject)')];
      const rightAcceptButtons = [...document.querySelectorAll('.action-gutter.conflict-right .hunk-action:not(.reject)')];
      leftAcceptButtons[0]?.click();
      rightAcceptButtons[1]?.click();
      const thirdResultCell = document.querySelector('.result-cell[data-conflict-index="2"]');
      [...(thirdResultCell?.querySelectorAll('.result-toolbar button') || [])]
        .find((button) => button.textContent === 'Both')
        ?.click();
      const partialResolutionPass =
        document.getElementById('conflictStatus').textContent.includes('3 / 5') &&
        document.getElementById('saveButton').disabled;

      document.getElementById('acceptAllCurrentButton').click();
      const allResolvedPass =
        document.getElementById('conflictStatus').textContent.includes('5 / 5') &&
        !document.getElementById('saveButton').disabled;

      rightAcceptButtons[1]?.click();
      [...(thirdResultCell?.querySelectorAll('.result-toolbar button') || [])]
        .find((button) => button.textContent === 'Both')
        ?.click();
      for (const index of [3, 4]) {
        const cell = document.querySelector('.result-cell[data-conflict-index="' + index + '"]');
        [...(cell?.querySelectorAll('.result-toolbar button') || [])]
          .find((button) => button.textContent === 'Reset')
          ?.click();
      }

      const workspace = document.querySelector('.workspace');
      const mergeGrid = document.querySelector('.merge-grid');
      const columnHeaders = [...document.querySelectorAll('.column-header')];
      const gridColumns = getComputedStyle(mergeGrid).gridTemplateColumns
        .split(' ')
        .filter(Boolean).length;
      const report = {
        width: window.innerWidth,
        height: window.innerHeight,
        columnHeaders: columnHeaders.length,
        gridColumns,
        conflictRows: document.querySelectorAll('.result-cell[data-conflict-index]:not([data-conflict-index=""])').length,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        internalHorizontalScroll:
          document.getElementById('editorScroll').scrollWidth >
          document.getElementById('editorScroll').clientWidth,
        missingButtons: [...document.querySelectorAll('button')].filter((button) => {
          const rectangle = button.getBoundingClientRect();
          return rectangle.width === 0 || rectangle.height === 0;
        }).map((button) => button.id),
        partialResolutionPass,
        allResolvedPass,
        errors: window.__qaErrors,
        pass:
          columnHeaders.length === 3 &&
          gridColumns === 5 &&
          document.querySelectorAll('.action-gutter').length > 0 &&
          document.querySelectorAll('.line-numbers').length > 0 &&
          partialResolutionPass &&
          allResolvedPass &&
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          window.__qaErrors.length === 0
      };
      document.documentElement.setAttribute('data-qa-result', btoa(JSON.stringify(report)));
    })();
  </script>`;

  return html
    .replace(`<script nonce="${nonce}">`, `${bootstrap}<script nonce="${nonce}">`)
    .replace("</body>", `${verifier}</body>`);
}

function renderViewport(name, width, height) {
  const screenshotPath = path.join(artifactDirectory, `conflict-editor-${name}.png`);
  const result = spawnSync(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      "--virtual-time-budget=1000",
      `--screenshot=${screenshotPath}`,
      "--dump-dom",
      `file://${harnessPath}`
    ],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    }
  );
  if (result.status !== 0) {
    throw new Error(`Chrome ${name} render failed: ${result.stderr.trim()}`);
  }

  const encodedReport = /data-qa-result="([^"]+)"/.exec(result.stdout)?.[1];
  if (!encodedReport) {
    throw new Error(`Chrome ${name} render did not produce a QA result.`);
  }
  const report = JSON.parse(Buffer.from(encodedReport, "base64").toString("utf8"));
  if (!report.pass) {
    throw new Error(`${name} UI check failed: ${JSON.stringify(report)}`);
  }
  return {
    ...report,
    screenshot: screenshotPath
  };
}

function main() {
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(harnessPath, buildHarness(), "utf8");
  try {
    const report = {
      desktop: renderViewport("desktop-1440x900", 1440, 900),
      mobile: renderViewport("mobile-390x844", 390, 844)
    };
    const reportPath = path.join(artifactDirectory, "ui-report.json");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
