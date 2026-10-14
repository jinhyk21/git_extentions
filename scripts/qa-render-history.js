/* Renders the History webview in headless Chrome: screenshot + search/filter smoke test. */
const { spawnSync } = require("node:child_process");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { getHistoryHtml } = require("../out-test/src/extension/webview/historyTemplate");
const { buildCommitGraph } = require("../out-test/src/core/git/buildCommitGraph");

const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const artifactDirectory = path.resolve("qa-artifacts");

const authors = [["Ann Lee", "ann@x.io"], ["Bao Tran", "bao@x.io"], ["Chen Wei", "chen@x.io"]];
const commits = Array.from({ length: 60 }, (_, i) => {
  const [authorName, authorEmail] = authors[i % 3];
  return {
    hash: (i.toString(16).padStart(2, "0")).repeat(20), abbreviatedHash: i.toString(16).padStart(2, "0").repeat(3).slice(0, 7),
    parentHashes: i === 59 ? [] : [((i + 1).toString(16).padStart(2, "0")).repeat(20)],
    authorName, authorEmail, authorDate: new Date(Date.now() - i * 3600e3 * 7).toISOString(),
    subject: i % 7 === 0 ? `Merge branch 'feature/${i}'` : `Fix issue #${100 + i} in module ${i % 5}`,
    refs: i === 0 ? [{ name: "main", isHead: true, isTag: false, isRemote: false }, { name: "origin/main", isHead: false, isTag: false, isRemote: true }] : i === 3 ? [{ name: "v1.2.0", isHead: false, isTag: true, isRemote: false }] : []
  };
});

function build(scenario) {
  const html = getHistoryHtml({ cspSource: "qa" }, "api-service", buildCommitGraph(commits), "en", { hasMore: true })
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
  const harness = `<style>html{--vscode-font-family:system-ui,sans-serif;--vscode-foreground:#ccc;--vscode-editor-background:#1f1f1f;--vscode-descriptionForeground:#9d9d9d;--vscode-list-hoverBackground:#2a2d2e;--vscode-input-background:#313131;--vscode-input-foreground:#ccc;--vscode-focusBorder:#0078d4;--vscode-button-secondaryBackground:#3a3d41;--vscode-button-secondaryForeground:#fff;--vscode-panel-border:#454545;--vscode-editorWidget-background:#202020}</style>
<script>window.__msgs=[];let __s=null;window.acquireVsCodeApi=()=>({postMessage:(m)=>window.__msgs.push(m),getState:()=>__s,setState:(s)=>{__s=s}});window.addEventListener("error",(e)=>document.documentElement.setAttribute("data-error",String(e.message)));</script>`;
  return html.replace("<head>", "<head>" + harness).replace("</body>", `<script>${scenario || ""}</script></body>`);
}

function runChrome(file, extra) {
  return spawnSync(chromePath, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", ...extra, "file://" + file], { encoding: "utf8", timeout: 60000 });
}

mkdirSync(artifactDirectory, { recursive: true });
const dir = path.join(tmpdir(), `gwp-history-${process.pid}`);
mkdirSync(dir, { recursive: true });
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " - " + detail}`); if (!ok) failures += 1; };

const shot = path.join(dir, "shot.html");
writeFileSync(shot, build(""));
runChrome(shot, ["--window-size=900,520", "--virtual-time-budget=1500", `--screenshot=${path.join(artifactDirectory, "history.png")}`]);

const scenario = `window.addEventListener("load", () => setTimeout(() => {
  const out = {};
  const rows = () => document.querySelectorAll(".commit-row").length;
  out.total = rows();
  out.error = document.documentElement.getAttribute("data-error");
  out.more = !!document.querySelector(".more-wrap button");
  const search = document.getElementById("search");
  search.value = "bao"; search.dispatchEvent(new Event("input"));
  out.byAuthor = rows();
  search.value = "#105"; search.dispatchEvent(new Event("input"));
  out.bySubject = rows(); out.marks = document.querySelectorAll("mark").length;
  search.value = "zzzz"; search.dispatchEvent(new Event("input"));
  out.none = rows(); out.emptyMsg = !!document.querySelector(".empty-state");
  search.value = ""; search.dispatchEvent(new Event("input"));
  document.querySelector(".commit-row").click();
  document.querySelector(".details-button").click();
  document.querySelector(".more-wrap button").click();
  out.msgs = window.__msgs.map((m) => m.type).join(",");
  document.documentElement.setAttribute("data-result", JSON.stringify(out));
}, 300));`;
const smoke = path.join(dir, "smoke.html");
writeFileSync(smoke, build(scenario));
const dumped = runChrome(smoke, ["--virtual-time-budget=4000", "--dump-dom"]).stdout || "";
const match = /data-result="([^"]*)"/.exec(dumped);
if (!match) check("history smoke produced a result", false, "no data-result");
else {
  const out = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  check("no script errors", !out.error, out.error);
  check("renders every commit", out.total === 60, `rows=${out.total}`);
  check("offers Load more when the log is truncated", out.more === true, "missing");
  check("filters by author", out.byAuthor === 20, `rows=${out.byAuthor}`);
  check("filters by subject and highlights the match", out.bySubject === 1 && out.marks >= 1, `rows=${out.bySubject} marks=${out.marks}`);
  check("shows an empty state when nothing matches", out.none === 0 && out.emptyMsg === true, JSON.stringify(out));
  check("click, details and load-more post messages", out.msgs === "openCommitDiff,showCommitDetails,loadMore", out.msgs);
}
rmSync(dir, { recursive: true, force: true });
if (failures > 0) process.exit(1);
console.log("Screenshot: qa-artifacts/history.png");
