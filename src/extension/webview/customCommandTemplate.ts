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
  "Failed to start the command."
] as const;

export function getCustomCommandHtml(
  webview: Webview,
  repositoryName: string,
  history: readonly string[],
  autoRefresh: boolean,
  language: AppLanguage = "en"
): string {
  const nonce = createNonce();
  const translations = Object.fromEntries(
    CUSTOM_COMMAND_MESSAGES.map((message) => [message, translate(language, message)])
  );
  // Escape "<" so repository/history content can never close the script tag.
  const data = JSON.stringify({ repositoryName, history, autoRefresh, translations }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${translate(language, "Run Command")}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 12px; display: flex; flex-direction: column; gap: 10px; height: 100vh; box-sizing: border-box; }
  h1 { font-size: 14px; margin: 0; }
  label { font-size: 12px; opacity: 0.85; display: block; margin-bottom: 4px; }
  textarea, input[type="text"] { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); padding: 6px; }
  textarea { min-height: 110px; resize: vertical; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 14px; cursor: pointer; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:disabled { opacity: 0.5; cursor: default; }
  #status { font-size: 12px; opacity: 0.85; }
  #output { flex: 1; min-height: 120px; overflow: auto; margin: 0; padding: 8px; white-space: pre-wrap; word-break: break-word; background: var(--vscode-terminal-background, var(--vscode-editor-background)); border: 1px solid var(--vscode-panel-border); font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); }
  .stderr { color: var(--vscode-terminal-ansiRed, #f14c4c); }
  details summary { cursor: pointer; font-size: 12px; }
  #history { list-style: none; padding: 0; margin: 6px 0 0; max-height: 140px; overflow: auto; }
  #history li { padding: 3px 6px; cursor: pointer; white-space: pre; overflow: hidden; text-overflow: ellipsis; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  #history li:hover { background: var(--vscode-list-hoverBackground); }
</style>
</head>
<body>
<h1 id="title"></h1>
<div>
  <label for="script" id="scriptLabel"></label>
  <textarea id="script" spellcheck="false" autofocus></textarea>
</div>
<div>
  <label for="cwd" id="cwdLabel"></label>
  <input type="text" id="cwd" spellcheck="false" />
</div>
<div class="row">
  <button id="run"></button>
  <button id="stop" class="secondary" disabled></button>
  <button id="clear" class="secondary"></button>
  <label style="margin:0"><input type="checkbox" id="autoRefresh" /> <span id="autoRefreshLabel"></span></label>
  <span id="status"></span>
</div>
<details id="historyBox">
  <summary id="historyTitle"></summary>
  <ul id="history"></ul>
</details>
<pre id="output" aria-live="polite"></pre>
<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const data = ${data};
  const tr = (key, values) => (data.translations[key] || key).replace(/\\{(\\w+)\\}/g, (m, k) => values && k in values ? String(values[k]) : m);
  const $ = (id) => document.getElementById(id);
  const MAX_OUTPUT_CHARS = 400000;

  $("title").textContent = tr("Run Command") + " — " + data.repositoryName;
  $("scriptLabel").textContent = tr("Command (multi-line supported, Ctrl+Enter to run)");
  $("cwdLabel").textContent = tr("Working directory (relative to repository, optional)");
  $("autoRefreshLabel").textContent = tr("Refresh repositories after running");
  $("historyTitle").textContent = tr("Recent commands");
  $("run").textContent = tr("Run");
  $("stop").textContent = tr("Stop");
  $("clear").textContent = tr("Clear");
  $("autoRefresh").checked = data.autoRefresh;

  function renderHistory(items) {
    const list = $("history");
    list.textContent = "";
    if (items.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = tr("No recent commands.");
      list.appendChild(empty);
      return;
    }
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      li.title = item;
      li.addEventListener("click", () => { $("script").value = item; $("script").focus(); });
      list.appendChild(li);
    }
  }
  renderHistory(data.history);

  function setRunning(running) {
    $("run").disabled = running;
    $("stop").disabled = !running;
  }

  function appendOutput(stream, text) {
    const out = $("output");
    const span = document.createElement("span");
    if (stream === "stderr") span.className = "stderr";
    span.textContent = text;
    out.appendChild(span);
    while (out.textContent.length > MAX_OUTPUT_CHARS && out.firstChild) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  }

  function run() {
    const script = $("script").value;
    if (script.trim().length === 0) return;
    vscode.postMessage({ type: "run", script, cwd: $("cwd").value, autoRefresh: $("autoRefresh").checked });
  }

  $("run").addEventListener("click", run);
  $("stop").addEventListener("click", () => vscode.postMessage({ type: "stop" }));
  $("clear").addEventListener("click", () => { $("output").textContent = ""; $("status").textContent = ""; });
  $("script").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); run(); }
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message.type !== "string") return;
    if (message.type === "started") {
      $("output").textContent = "";
      $("status").textContent = tr("Running…");
      setRunning(true);
    } else if (message.type === "output") {
      appendOutput(message.stream === "stderr" ? "stderr" : "stdout", String(message.text));
    } else if (message.type === "finished") {
      const seconds = (Number(message.durationMs) / 1000).toFixed(1);
      $("status").textContent = message.timedOut ? tr("Timed out after {seconds}s", { seconds })
        : message.stopped ? tr("Stopped after {seconds}s", { seconds })
        : message.exitCode === null ? tr("Failed to start the command.")
        : tr("Finished with exit code {code} in {seconds}s", { code: message.exitCode, seconds });
      setRunning(false);
    } else if (message.type === "history" && Array.isArray(message.items)) {
      renderHistory(message.items.map(String));
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
