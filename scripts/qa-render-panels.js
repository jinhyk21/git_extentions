/* Screenshots the Run Command and Commit details webviews in headless Chrome. */
const { spawnSync } = require("node:child_process");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { getCustomCommandHtml } = require("../out-test/src/extension/webview/customCommandTemplate");
const { getCommitDetailsHtml } = require("../out-test/src/extension/webview/commitDetailsTemplate");
const { AnsiParser } = require("../out-test/src/core/shell/AnsiParser");

const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const artifactDirectory = path.resolve("qa-artifacts");
mkdirSync(artifactDirectory, { recursive: true });
const dir = path.join(tmpdir(), `gwp-panels-${process.pid}`);
mkdirSync(dir, { recursive: true });

const theme = `<style>html{--vscode-font-family:system-ui,sans-serif;--vscode-foreground:#ccc;--vscode-editor-background:#1f1f1f;--vscode-descriptionForeground:#9d9d9d;--vscode-list-hoverBackground:#2a2d2e;--vscode-input-background:#313131;--vscode-input-foreground:#ccc;--vscode-focusBorder:#0078d4;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:#3a3d41;--vscode-button-secondaryForeground:#fff;--vscode-panel-border:#454545;--vscode-editorWidget-background:#202020}</style>
<script>window.__msgs=[];window.acquireVsCodeApi=()=>({postMessage:(m)=>window.__msgs.push(m),getState:()=>null,setState:()=>{}});window.addEventListener("error",(e)=>document.documentElement.setAttribute("data-error",String(e.message)));</script>`;
const strip = (html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "").replace("<head>", "<head>" + theme);

function shoot(name, html, size) {
  const file = path.join(dir, name + ".html");
  writeFileSync(file, html);
  const result = spawnSync(chromePath, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--window-size=${size}`, "--virtual-time-budget=2500", `--screenshot=${path.join(artifactDirectory, name + ".png")}`, "file://" + file], { encoding: "utf8", timeout: 60000 });
  return result.status === 0;
}

// Run Command with realistic, colored output pushed through the real parser
const parser = new AnsiParser();
const output = parser.feed("\u001b[1m> api@1.0.0 test\u001b[0m\n\u001b[32m ✓\u001b[0m auth.spec.ts \u001b[2m(12 tests)\u001b[0m\n\u001b[32m ✓\u001b[0m payments.spec.ts \u001b[2m(8 tests)\u001b[0m\n\u001b[31m ✗ refund.spec.ts\u001b[0m\n   \u001b[31mExpected 200, received 500\u001b[0m\n\n\u001b[1mTests:\u001b[0m \u001b[31m1 failed\u001b[0m, \u001b[32m20 passed\u001b[0m\n");
const scenario = `window.addEventListener("load", () => setTimeout(() => {
  window.postMessage({ type: "started" }, "*");
  window.postMessage({ type: "output", stream: "stdout", segments: ${JSON.stringify(output)} }, "*");
  window.postMessage({ type: "finished", exitCode: 1, durationMs: 4200, stopped: false, timedOut: false }, "*");
  window.postMessage({ type: "history", items: ["npm test", "git log --oneline\\ngit status", "docker compose up -d", "npm run build"] }, "*");
}, 200));`;
let html = getCustomCommandHtml({ cspSource: "qa" }, "api-service", ["npm test"], true, "en").replace("</body>", `<script>${scenario}</script></body>`);
const ok1 = shoot("run-command", strip(html), "900,640");

const details = {
  hash: "9f2c4e1a7b3d5c8e0f1a2b3c4d5e6f708192a3b4", parentHashes: ["1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d"],
  authorName: "Ann Lee", authorEmail: "ann@example.com", authorDate: new Date(Date.now() - 5 * 3600e3).toISOString(),
  committerName: "Ann Lee", committerDate: new Date(Date.now() - 5 * 3600e3).toISOString(),
  subject: "Add refund flow with idempotency keys",
  body: "Refunds now require an idempotency key so retried requests cannot\nrefund twice.\n\n- new RefundService\n- migration for refund_requests",
  files: [
    { path: "src/payments/refund.ts", additions: 120, deletions: 4 }, { path: "src/payments/charge.ts", additions: 14, deletions: 22 },
    { path: "migrations/2026_01_refund_requests.sql", additions: 31, deletions: 0 }, { path: "README.md", additions: 3, deletions: 1 },
    { path: "assets/diagram.png", additions: null, deletions: null }
  ]
};
const ok2 = shoot("commit-details", strip(getCommitDetailsHtml({ cspSource: "qa" }, "api-service", details, "en")), "900,620");

rmSync(dir, { recursive: true, force: true });
console.log(`${ok1 && ok2 ? "PASS" : "FAIL"} rendered run-command.png and commit-details.png in qa-artifacts`);
if (!(ok1 && ok2)) process.exit(1);
