/* Renders the sidebar webview in headless Chrome: screenshots + an interaction smoke test. */
const { spawnSync } = require("node:child_process");
const { mkdirSync, rmSync, writeFileSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { getSidebarHtml } = require("../out-test/src/extension/sidebar/sidebarTemplate");

const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const artifactDirectory = path.resolve("qa-artifacts");
const media = path.resolve("media/sidebar");

const counts = (s, u, t, c) => ({ staged: s, unstaged: u, untracked: t, conflicted: c });
const file = (p, kind, code) => ({ path: p, kind, code });
const manyFiles = Array.from({ length: 180 }, (_, i) => file(`src/generated/file-${i}.ts`, "unstaged", " M"));

const state = {
  showClean: true,
  cleanCount: 8,
  summary: { repositories: 13, changedFiles: 190, conflicts: 2, ahead: 3, behind: 2 },
  repositories: [
    {
      id: "/w/api", name: "api-service", rootPath: "/w/api", isSubmodule: false, loading: false, branch: "feature/payments", ahead: 2, behind: 0,
      counts: counts(1, 2, 1, 0), files: [file("src/payments/charge.ts", "staged", "M "), file("src/payments/refund.ts", "unstaged", " M"), file("README.md", "unstaged", " M"), file("notes/todo.txt", "untracked", "??")],
      children: [
        { id: "/w/api/libs/core", name: "core", rootPath: "/w/api/libs/core", isSubmodule: true, loading: false, branch: "main", ahead: 0, behind: 2, counts: counts(0, 1, 0, 0), files: [file("index.js", "unstaged", " M")], children: [], needsAttention: true }
      ],
      needsAttention: true
    },
    {
      id: "/w/web", name: "web-app", rootPath: "/w/web", isSubmodule: false, loading: false, branch: "main", ahead: 0, behind: 0,
      counts: counts(0, 0, 0, 2), operation: { type: "rebase", currentStep: 2, totalSteps: 5 },
      files: [file("src/App.tsx", "conflicted", "UU"), file("src/styles.css", "conflicted", "AA")], children: [], needsAttention: true
    },
    {
      id: "/w/big", name: "monorepo", rootPath: "/w/big", isSubmodule: false, loading: false, branch: "develop", ahead: 1, behind: 0,
      counts: counts(0, 180, 0, 0), files: manyFiles, children: [], needsAttention: true
    },
    { id: "/w/new", name: "loading-repo", rootPath: "/w/new", isSubmodule: false, loading: true, ahead: 0, behind: 0, counts: counts(0, 0, 0, 0), files: [], children: [], needsAttention: true },
    ...["lms-learning", "lms-schedule", "zoom-meeting", "shared", "ims-declaration", "license", "criteria", "lms-exam"].map((name, i) => ({
      id: "/w/" + name, name, rootPath: "/w/" + name, isSubmodule: false, loading: false, branch: i === 5 ? "release/2.0" : "dev", ahead: 0, behind: 0,
      counts: counts(0, 0, 0, 0), files: [], children: [], needsAttention: false
    })),
    { id: "/w/bad", name: "broken-repo", rootPath: "/w/bad", isSubmodule: false, loading: false, error: "fatal: not a git repository", ahead: 0, behind: 0, counts: counts(0, 0, 0, 0), files: [], children: [], needsAttention: true }
  ]
};

function build(scenarioScript, persisted) {
  const html = getSidebarHtml({ cspSource: "qa" }, "file://" + path.join(media, "sidebar.js"), "file://" + path.join(media, "sidebar.css"), { state, busy: ["/w/big"] }, "en")
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
  const harness = `
<style>html{--vscode-font-family:system-ui,sans-serif;--vscode-font-size:13px;--vscode-foreground:#cccccc;--vscode-sideBar-background:#181818;--vscode-descriptionForeground:#9d9d9d;--vscode-focusBorder:#0078d4;--vscode-input-background:#313131;--vscode-input-foreground:#cccccc;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:#3a3d41;--vscode-button-secondaryForeground:#fff;--vscode-editor-background:#1f1f1f;--vscode-list-activeSelectionBackground:#04395e;--vscode-list-activeSelectionForeground:#fff;--vscode-widget-border:#454545;--vscode-editorWidget-background:#202020;}</style>
<script>
window.__msgs = [];
let __state = ${JSON.stringify(persisted || null)};
window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__msgs.push(m), getState: () => __state, setState: (s) => { __state = s; } });
window.addEventListener("error", (e) => { document.documentElement.setAttribute("data-error", String(e.message)); });
</script>`;
  return html.replace("<head>", "<head>" + harness).replace("</body>", `<script>${scenarioScript || ""}</script></body>`);
}

function runChrome(htmlPath, extra) {
  return spawnSync(chromePath, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", ...extra, "file://" + htmlPath], { encoding: "utf8", timeout: 60000 });
}

function main() {
  mkdirSync(artifactDirectory, { recursive: true });
  const dir = path.join(tmpdir(), `gwp-sidebar-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  let failures = 0;
  const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + detail}`); if (!ok) failures += 1; };

  // 1) collapsed overview and an expanded view
  const overview = path.join(dir, "overview.html");
  writeFileSync(overview, build("", null));
  runChrome(overview, ["--window-size=380,560", `--screenshot=${path.join(artifactDirectory, "sidebar-overview.png")}`]);

  const expandedState = { expanded: ["/w/api", "/w/web", "/w/api/libs/core"], collapsedGroups: [], drafts: { "/w/api": "feat: add refunds" }, filter: "" };
  const expanded = path.join(dir, "expanded.html");
  writeFileSync(expanded, build("", expandedState));
  runChrome(expanded, ["--window-size=380,900", "--virtual-time-budget=1500", `--screenshot=${path.join(artifactDirectory, "sidebar-expanded.png")}`]);

  // 2) interaction smoke test; results are written to data attributes and read back via --dump-dom
  const scenario = `
    window.addEventListener("load", () => setTimeout(() => {
      const out = {};
      const $$ = (s) => [...document.querySelectorAll(s)];
      out.cards = $$(".card").length;
      out.chips = document.querySelectorAll("#summary .chip").length;
      out.error = document.documentElement.getAttribute("data-error");
      out.compact = $$(".card.compact").length;
      out.sectionLabel = !!document.querySelector(".section-label");
      // expand a collapsed card by clicking its header
      const head = $$(".card-head").find((h) => h.textContent.includes("monorepo"));
      head.click();
      setTimeout(() => {
        out.expandedBody = !!head.parentElement.querySelector(".group");
        out.capped = !!head.parentElement.querySelector(".more-btn");
        // multi-select with ctrl+click then stage via selection bar
        const files = $$(".card.open .file.k-unstaged");
        files[0].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
        files[1].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
        out.selectionBar = document.getElementById("selection").classList.contains("show");
        document.querySelector("#selection .cta").click();
        out.bulkStage = JSON.stringify(window.__msgs.filter((m) => m.command === "gitWorkspacePro.stageFile").map((m) => m.files.length));
        // search filter
        const search = document.getElementById("search");
        search.value = "charge"; search.dispatchEvent(new Event("input"));
        out.filtered = $$(".card").length;
        search.value = ""; search.dispatchEvent(new Event("input"));
        // plain click on a file posts the diff command
        // context menu
        const repoHead = $$(".card-head")[0];
        repoHead.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 40 }));
        out.menu = document.querySelectorAll("#menu button").length;
        document.documentElement.setAttribute("data-result", JSON.stringify(out));
      }, 400);
    }, 300));`;
  const smoke = path.join(dir, "smoke.html");
  writeFileSync(smoke, build(scenario, { expanded: ["/w/api"], collapsedGroups: [], drafts: {}, filter: "" }));
  const dumped = runChrome(smoke, ["--virtual-time-budget=4000", "--dump-dom"]).stdout || "";
  const match = /data-result="([^"]*)"/.exec(dumped);
  if (!match) {
    check("interaction smoke produced a result", false, "no data-result attribute (script error?)");
  } else {
    const out = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    check("no script errors", !out.error, out.error);
    check("renders one card per top-level and nested repository", out.cards === 14, `cards=${out.cards}`);
    check("renders summary chips", out.chips >= 3, `chips=${out.chips}`);
    check("expands a card on click", out.expandedBody === true, "no group rendered");
    check("caps very large file groups", out.capped === true, "no 'show more' button");
    check("ctrl+click shows the selection bar", out.selectionBar === true, "bar hidden");
    check("bulk stage posts one command with both files", out.bulkStage === "[2]", out.bulkStage);
    check("search filters repositories", out.filtered === 1, `cards=${out.filtered}`);
    check("clean repositories render compact under a section label", out.compact === 8 && out.sectionLabel === true, `compact=${out.compact} label=${out.sectionLabel}`);
    check("context menu lists repository actions", out.menu >= 8, `buttons=${out.menu}`);
  }

  rmSync(dir, { recursive: true, force: true });
  if (failures > 0) process.exit(1);
  console.log("Screenshots: qa-artifacts/sidebar-overview.png, sidebar-expanded.png");
}

main();
