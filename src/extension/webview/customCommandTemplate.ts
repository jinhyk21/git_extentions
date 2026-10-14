import type { Webview } from "vscode";
import { translate, type AppLanguage } from "../../shared/i18n";

export const CUSTOM_COMMAND_MESSAGES = [
  "Run Command",
  "Run",
  "Stop",
  "Clear",
  "Command (multi-line supported, Ctrl+Enter to run)",
  "Working directory (relative to repository, optional)",
  "Refresh repositories after running",
  "Recent commands",
  "No recent commands.",
  "Output",
  "Running…",
  "Finished with exit code {code} in {seconds}s",
  "Stopped after {seconds}s",
  "Timed out after {seconds}s",
  "Failed to start the command.",
  "Copy output",
  "Follow output",
  "Show all",
  "Show fewer",
  "Ready",
  "Press Ctrl+Enter to run",
  "{count} lines",
  "Runs in"
] as const;

export function getCustomCommandHtml(
  webview: Webview,
  repositoryName: string,
  history: readonly string[],
  autoRefresh: boolean,
  language: AppLanguage = "en",
  repositoryPath = ""
): string {
  const nonce = createNonce();
  const translations = Object.fromEntries(
    CUSTOM_COMMAND_MESSAGES.map((message) => [message, translate(language, message)])
  );
  // Escape "<" so repository/history content can never close the script tag.
  const data = JSON.stringify({ repositoryName, repositoryPath, history, autoRefresh, translations }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${translate(language, "Run Command")}</title>
<style>
  :root {
    color-scheme: light dark;
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,0.3)));
    --muted: var(--vscode-descriptionForeground);
    --ok: var(--vscode-gitDecoration-addedResourceForeground, #3fb950);
    --bad: var(--vscode-gitDecoration-conflictingResourceForeground, #e5534b);
    --warn: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922);
    --mono: var(--vscode-editor-font-family, monospace);
  }
  * { box-sizing: border-box; }
  body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; height: 100vh; }
  header { display: flex; align-items: center; gap: 10px; }
  h1 { font-size: 15px; margin: 0; font-weight: 600; }
  .where { font-size: 12px; color: var(--muted); display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; margin-top: -6px; }
  .where[hidden] { display: none; }
  .where code { font-family: var(--mono); color: var(--vscode-foreground); word-break: break-all; user-select: text; }
  .repo-chip { font-size: 11px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .card { border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground) 8%); transition: border-color 160ms; }
  .card:focus-within { border-color: var(--vscode-focusBorder); }
  label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  textarea, input[type="text"] { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 6px; font-family: var(--mono); font-size: var(--vscode-editor-font-size, 13px); padding: 7px 9px; }
  textarea { min-height: 96px; resize: vertical; line-height: 1.45; }
  textarea:focus, input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 0; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row .grow { flex: 1; min-width: 160px; }
  button { font: inherit; border: none; border-radius: 6px; padding: 5px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: transform 90ms, filter 160ms, opacity 160ms; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:hover:not(:disabled) { filter: brightness(1.12); }
  button:active:not(:disabled) { transform: scale(0.96); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.danger { background: var(--bad); color: #fff; }
  button:disabled { opacity: 0.45; cursor: default; }
  button svg { width: 13px; height: 13px; fill: currentColor; }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; user-select: none; }
  .switch input { appearance: none; width: 30px; height: 16px; border-radius: 8px; background: var(--vscode-input-background); border: 1px solid var(--border); position: relative; cursor: pointer; transition: background 160ms; margin: 0; }
  .switch input::after { content: ""; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: var(--muted); transition: transform 160ms var(--ease), background 160ms; }
  .switch input:checked { background: var(--vscode-button-background); }
  .switch input:checked::after { transform: translateX(14px); background: #fff; }
  .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); transition: color 160ms, border-color 160ms, background 160ms; }
  .pill.running { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 55%, transparent); }
  .pill.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 55%, transparent); background: color-mix(in srgb, var(--ok) 10%, transparent); }
  .pill.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 55%, transparent); background: color-mix(in srgb, var(--bad) 10%, transparent); }
  .spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin 700ms linear infinite; display: none; }
  .pill.running .spinner { display: inline-block; }
  .history-wrap { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--vscode-foreground); font-family: var(--mono); font-size: 11px; animation: pop 200ms var(--ease) both; }
  .chip:hover { background: var(--vscode-list-hoverBackground); }
  .out-wrap { position: relative; flex: 1; min-height: 140px; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .out-wrap.running::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2px; z-index: 1; background: linear-gradient(90deg, transparent, var(--vscode-progressBar-background, #0e70c0), transparent); background-size: 40% 100%; background-repeat: no-repeat; animation: slide 1s linear infinite; }
  .out-bar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid var(--border); font-size: 11px; color: var(--muted); }
  .out-bar .grow { flex: 1; }
  .out-bar button { padding: 2px 8px; font-size: 11px; }
  #output { flex: 1; margin: 0; padding: 10px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: var(--vscode-terminal-background, var(--vscode-editor-background)); font-family: var(--mono); font-size: var(--vscode-editor-font-size, 13px); line-height: 1.4; }
  .stderr { color: var(--vscode-terminal-ansiRed, #f14c4c); }
  .fg-black { color: var(--vscode-terminal-ansiBlack, #555); } .fg-red { color: var(--vscode-terminal-ansiRed, #e5534b); } .fg-green { color: var(--vscode-terminal-ansiGreen, #3fb950); } .fg-yellow { color: var(--vscode-terminal-ansiYellow, #d29922); }
  .fg-blue { color: var(--vscode-terminal-ansiBlue, #58a6ff); } .fg-magenta { color: var(--vscode-terminal-ansiMagenta, #bc8cff); } .fg-cyan { color: var(--vscode-terminal-ansiCyan, #39c5cf); } .fg-white { color: var(--vscode-terminal-ansiWhite, #ddd); }
  .fg-bright-black { color: var(--vscode-terminal-ansiBrightBlack, #888); } .fg-bright-red { color: var(--vscode-terminal-ansiBrightRed, #ff7b72); } .fg-bright-green { color: var(--vscode-terminal-ansiBrightGreen, #56d364); } .fg-bright-yellow { color: var(--vscode-terminal-ansiBrightYellow, #e3b341); }
  .fg-bright-blue { color: var(--vscode-terminal-ansiBrightBlue, #79c0ff); } .fg-bright-magenta { color: var(--vscode-terminal-ansiBrightMagenta, #d2a8ff); } .fg-bright-cyan { color: var(--vscode-terminal-ansiBrightCyan, #56d4dd); } .fg-bright-white { color: var(--vscode-terminal-ansiBrightWhite, #fff); }
  .bg-red { background: color-mix(in srgb, var(--bad) 35%, transparent); } .bg-green { background: color-mix(in srgb, var(--ok) 35%, transparent); } .bg-yellow { background: color-mix(in srgb, var(--warn) 35%, transparent); } .bg-blue { background: rgba(88,166,255,0.3); }
  .bold { font-weight: 700; } .dim { opacity: 0.65; } .italic { font-style: italic; } .underline { text-decoration: underline; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
</style>
</head>
<body>
<header>
  <h1 id="title"></h1>
  <span class="repo-chip" id="repoChip"></span>
</header>
<div class="where" id="where" hidden><span id="whereLabel"></span> <code id="wherePath"></code></div>
<section class="card">
  <div>
    <label for="script" id="scriptLabel"></label>
    <textarea id="script" spellcheck="false" autofocus></textarea>
  </div>
  <div class="row">
    <div class="grow">
      <label for="cwd" id="cwdLabel"></label>
      <input type="text" id="cwd" spellcheck="false" />
    </div>
  </div>
  <div class="row">
    <button id="run"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg><span id="runText"></span></button>
    <button id="stop" class="danger" disabled><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5h9v9h-9z"/></svg><span id="stopText"></span></button>
    <button id="clear" class="secondary"></button>
    <label class="switch" style="margin:0;text-transform:none;letter-spacing:0;color:inherit;font-size:12px"><input type="checkbox" id="autoRefresh" /><span id="autoRefreshLabel"></span></label>
    <span class="pill" id="status"><span class="spinner"></span><span id="statusText"></span></span>
  </div>
  <div class="history-wrap" id="historyWrap"></div>
</section>
<section class="out-wrap" id="outWrap">
  <div class="out-bar">
    <span id="outputTitle"></span>
    <span class="grow" id="lineCount"></span>
    <label class="switch" style="margin:0;text-transform:none;letter-spacing:0;color:inherit;font-size:11px"><input type="checkbox" id="follow" checked /><span id="followLabel"></span></label>
    <button id="copy" class="secondary"></button>
  </div>
  <pre id="output" aria-live="polite"></pre>
</section>
<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const data = ${data};
  const tr = (key, values) => (data.translations[key] || key).replace(/\\{(\\w+)\\}/g, (m, k) => values && k in values ? String(values[k]) : m);
  const $ = (id) => document.getElementById(id);
  const MAX_OUTPUT_CHARS = 400000;
  const HISTORY_COLLAPSED = 6;
  let historyItems = data.history;
  let showAllHistory = false;
  let timer = null;
  let startedAt = 0;
  let lines = 0;

  $("title").textContent = tr("Run Command");
  $("repoChip").textContent = data.repositoryName;
  if (data.repositoryPath) {
    $("where").hidden = false;
    $("whereLabel").textContent = tr("Runs in");
    $("wherePath").textContent = data.repositoryPath;
    $("cwd").placeholder = data.repositoryPath;
  }
  $("scriptLabel").textContent = tr("Command (multi-line supported, Ctrl+Enter to run)");
  $("cwdLabel").textContent = tr("Working directory (relative to repository, optional)");
  $("autoRefreshLabel").textContent = tr("Refresh repositories after running");
  $("runText").textContent = tr("Run");
  $("stopText").textContent = tr("Stop");
  $("clear").textContent = tr("Clear");
  $("outputTitle").textContent = tr("Output");
  $("followLabel").textContent = tr("Follow output");
  $("copy").textContent = tr("Copy output");
  $("autoRefresh").checked = data.autoRefresh;
  $("script").placeholder = tr("Press Ctrl+Enter to run");
  setStatus("", tr("Ready"));

  function setStatus(kind, text) {
    $("status").className = "pill" + (kind ? " " + kind : "");
    $("statusText").textContent = text;
  }

  function renderHistory() {
    const wrap = $("historyWrap");
    wrap.textContent = "";
    if (historyItems.length === 0) return;
    const label = document.createElement("span");
    label.className = "repo-chip";
    label.textContent = tr("Recent commands");
    wrap.appendChild(label);
    const visible = showAllHistory ? historyItems : historyItems.slice(0, HISTORY_COLLAPSED);
    for (const item of visible) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = item.split("\\n")[0] + (item.includes("\\n") ? " \\u21B5" : "");
      chip.title = item;
      chip.addEventListener("click", () => { $("script").value = item; $("script").focus(); });
      wrap.appendChild(chip);
    }
    if (historyItems.length > HISTORY_COLLAPSED) {
      const more = document.createElement("button");
      more.className = "chip";
      more.textContent = showAllHistory ? tr("Show fewer") : tr("Show all");
      more.addEventListener("click", () => { showAllHistory = !showAllHistory; renderHistory(); });
      wrap.appendChild(more);
    }
  }
  renderHistory();

  function setRunning(running) {
    $("run").disabled = running;
    $("stop").disabled = !running;
    $("outWrap").classList.toggle("running", running);
    clearInterval(timer);
    if (running) {
      startedAt = Date.now();
      timer = setInterval(() => setStatus("running", tr("Running…") + " " + ((Date.now() - startedAt) / 1000).toFixed(0) + "s"), 500);
    }
  }

  function appendOutput(stream, segments) {
    const out = $("output");
    for (const segment of segments) {
      const span = document.createElement("span");
      span.className = (stream === "stderr" ? "stderr " : "") + segment.classes;
      span.textContent = segment.text;
      out.appendChild(span);
      lines += (segment.text.match(/\\n/g) || []).length;
    }
    while (out.textContent.length > MAX_OUTPUT_CHARS && out.firstChild) out.removeChild(out.firstChild);
    $("lineCount").textContent = tr("{count} lines", { count: lines });
    if ($("follow").checked) out.scrollTop = out.scrollHeight;
  }

  function run() {
    const script = $("script").value;
    if (script.trim().length === 0) return;
    vscode.postMessage({ type: "run", script, cwd: $("cwd").value, autoRefresh: $("autoRefresh").checked });
  }

  $("run").addEventListener("click", run);
  $("stop").addEventListener("click", () => vscode.postMessage({ type: "stop" }));
  $("clear").addEventListener("click", () => { $("output").textContent = ""; lines = 0; $("lineCount").textContent = ""; setStatus("", tr("Ready")); });
  $("copy").addEventListener("click", () => vscode.postMessage({ type: "copyOutput", text: $("output").textContent.slice(-MAX_OUTPUT_CHARS) }));
  $("script").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); run(); }
  });
  $("output").addEventListener("wheel", () => { $("follow").checked = false; }, { passive: true });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message.type !== "string") return;
    if (message.type === "started") {
      $("output").textContent = "";
      lines = 0;
      $("lineCount").textContent = "";
      setStatus("running", tr("Running…"));
      setRunning(true);
    } else if (message.type === "output" && Array.isArray(message.segments)) {
      appendOutput(message.stream === "stderr" ? "stderr" : "stdout", message.segments);
    } else if (message.type === "finished") {
      setRunning(false);
      const seconds = (Number(message.durationMs) / 1000).toFixed(1);
      if (message.timedOut) setStatus("bad", tr("Timed out after {seconds}s", { seconds }));
      else if (message.stopped) setStatus("bad", tr("Stopped after {seconds}s", { seconds }));
      else if (message.exitCode === null) setStatus("bad", tr("Failed to start the command."));
      else setStatus(message.exitCode === 0 ? "ok" : "bad", tr("Finished with exit code {code} in {seconds}s", { code: message.exitCode, seconds }));
    } else if (message.type === "history" && Array.isArray(message.items)) {
      historyItems = message.items.map(String);
      renderHistory();
    }
  });
})();
</script>
</body>
</html>`;
}

function createNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < 32; index += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
