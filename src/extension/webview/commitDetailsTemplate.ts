import type { Webview } from "vscode";
import { translate, type AppLanguage } from "../../shared/i18n";
import type { CommitDetails } from "../../shared/types/history";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getCommitDetailsHtml(
  webview: Webview,
  repositoryName: string,
  details: CommitDetails,
  language: AppLanguage = "en"
): string {
  const nonce = createNonce();
  const tr = (message: string, values?: Record<string, string | number>) => translate(language, message, values);
  const totalAdditions = details.files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const totalDeletions = details.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const maxChange = Math.max(1, ...details.files.map((file) => (file.additions ?? 0) + (file.deletions ?? 0)));
  const total = Math.max(1, totalAdditions + totalDeletions);
  const initials = escapeHtml(
    (details.authorName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part, index, parts) => (index === 0 || index === parts.length - 1 ? (part[0] ?? "") : ""))
      .join("") || "?").toUpperCase()
  );
  const files = details.files
    .map((file, index) => {
      const slash = file.path.lastIndexOf("/");
      const dir = slash < 0 ? "" : file.path.slice(0, slash);
      const name = slash < 0 ? file.path : file.path.slice(slash + 1);
      const changed = (file.additions ?? 0) + (file.deletions ?? 0);
      const width = Math.max(4, Math.round((changed / maxChange) * 100));
      const addShare = changed === 0 ? 0 : ((file.additions ?? 0) / changed) * 100;
      return `<li class="file" tabindex="0" data-index="${index}" data-path="${escapeHtml(file.path.toLowerCase())}" title="${escapeHtml(file.path)}" style="--i:${Math.min(index, 30)}">
  <span class="fname">${escapeHtml(name)}</span><span class="fdir">${escapeHtml(dir)}</span>
  <span class="bar" aria-hidden="true"><span class="bar-fill" style="width:${width}%"><span class="bar-add" style="width:${addShare.toFixed(1)}%"></span></span></span>
  <span class="stat">${
    file.additions === null || file.deletions === null
      ? escapeHtml(tr("binary"))
      : `<span class="add">+${file.additions}</span> <span class="del">-${file.deletions}</span>`
  }</span>
</li>`;
    })
    .join("\n");
  const parents = details.parentHashes
    .map((hash) => `<span class="chip mono">${escapeHtml(hash.slice(0, 7))}</span>`)
    .join("");
  // Only indexes cross the webview boundary; paths are resolved on the extension side.
  const script = `
  const vscodeApi = acquireVsCodeApi();
  document.getElementById('copyHash').addEventListener('click', () => vscodeApi.postMessage({ type: 'copyHash' }));
  const items = [...document.querySelectorAll('li.file')];
  const open = (item) => vscodeApi.postMessage({ type: 'openFile', index: Number(item.dataset.index) });
  items.forEach((item) => {
    item.addEventListener('click', () => open(item));
    item.addEventListener('keydown', (event) => {
      const visible = items.filter((entry) => !entry.hidden);
      const at = visible.indexOf(item);
      if (event.key === 'Enter') { event.preventDefault(); open(item); }
      else if (event.key === 'ArrowDown' && visible[at + 1]) { event.preventDefault(); visible[at + 1].focus(); }
      else if (event.key === 'ArrowUp' && at > 0) { event.preventDefault(); visible[at - 1].focus(); }
    });
  });
  const filter = document.getElementById('filter');
  if (filter) {
    filter.addEventListener('input', () => {
      const query = filter.value.trim().toLowerCase();
      items.forEach((item) => { item.hidden = query.length > 0 && !item.dataset.path.includes(query); });
    });
  }
  const dateEl = document.getElementById('relative');
  if (dateEl) {
    const date = new Date(dateEl.dataset.iso);
    if (!Number.isNaN(date.getTime())) {
      const seconds = Math.round((date.getTime() - Date.now()) / 1000);
      const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
      const formatter = new Intl.RelativeTimeFormat(dateEl.dataset.lang, { numeric: 'auto' });
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) { dateEl.textContent = formatter.format(Math.round(seconds / size), unit); break; }
      }
      dateEl.title = date.toLocaleString();
    }
  }`;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${escapeHtml(tr("Commit details"))}</title>
<style>
  :root {
    color-scheme: light dark;
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,0.3)));
    --muted: var(--vscode-descriptionForeground);
    --add: var(--vscode-gitDecoration-addedResourceForeground, #3fb950);
    --del: var(--vscode-gitDecoration-deletedResourceForeground, #e5534b);
  }
  * { box-sizing: border-box; }
  body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 18px 20px 28px; max-width: 960px; }
  .hero { animation: rise 280ms var(--ease) both; }
  h1 { font-size: 18px; line-height: 1.35; margin: 0 0 10px; font-weight: 600; word-break: break-word; }
  .who { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
  .avatar { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-weight: 700; font-size: 11px; }
  .who strong { color: var(--vscode-foreground); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; align-items: center; }
  .chip { font-size: 11px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .mono { font-family: var(--vscode-editor-font-family, monospace); }
  button { font: inherit; font-size: 11px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 3px 10px; cursor: pointer; border-radius: 999px; transition: transform 90ms, filter 160ms; }
  button:hover { filter: brightness(1.12); }
  button:active { transform: scale(0.95); }
  pre.body { white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); line-height: 1.5; margin: 16px 0; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground) 8%); animation: rise 320ms var(--ease) 60ms both; }
  .summary { display: flex; align-items: center; gap: 12px; margin: 18px 0 8px; flex-wrap: wrap; }
  h2 { font-size: 13px; margin: 0; font-weight: 600; }
  .total-bar { flex: 1; min-width: 120px; max-width: 280px; height: 6px; border-radius: 3px; background: var(--del); overflow: hidden; }
  .total-bar > span { display: block; height: 100%; background: var(--add); transition: width 500ms var(--ease); }
  #filter { margin-left: auto; width: 200px; height: 26px; padding: 0 9px; border-radius: 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
  #filter:focus { outline: 1px solid var(--vscode-focusBorder); }
  ul { list-style: none; padding: 0; margin: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  li.file { display: flex; align-items: center; gap: 10px; padding: 5px 12px; cursor: pointer; font-size: 12px; border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); animation: rise 260ms var(--ease) both; animation-delay: calc(var(--i, 0) * 14ms); transition: background 120ms; }
  li.file:last-child { border-bottom: none; }
  li.file[hidden] { display: none; }
  li.file:hover, li.file:focus-visible { background: var(--vscode-list-hoverBackground); outline: none; }
  li.file:focus-visible { box-shadow: inset 2px 0 0 var(--vscode-focusBorder); }
  .fname { font-weight: 600; white-space: nowrap; }
  .fdir { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .bar { width: 70px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--muted) 20%, transparent); flex: none; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--del); overflow: hidden; }
  .bar-add { display: block; height: 100%; background: var(--add); }
  .stat { min-width: 76px; text-align: right; white-space: nowrap; font-family: var(--vscode-editor-font-family, monospace); flex: none; }
  .add { color: var(--add); } .del { color: var(--del); }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
</style>
</head>
<body>
<div class="hero">
  <h1>${escapeHtml(details.subject)}</h1>
  <div class="who">
    <span class="avatar">${initials}</span>
    <span><strong>${escapeHtml(details.authorName)}</strong> &lt;${escapeHtml(details.authorEmail)}&gt;</span>
    <span id="relative" data-iso="${escapeHtml(details.authorDate)}" data-lang="${escapeHtml(language === "zh-cn" ? "zh-CN" : language)}">${escapeHtml(details.authorDate)}</span>
  </div>
  <div class="chips">
    <span class="chip mono">${escapeHtml(details.hash)}</span>
    <button id="copyHash">${escapeHtml(tr("Copy hash"))}</button>
    ${parents ? `<span class="chip">${escapeHtml(tr("Parents"))}</span>${parents}` : ""}
    <span class="chip">${escapeHtml(repositoryName)}</span>
    <span class="chip">${escapeHtml(tr("Committer"))}: ${escapeHtml(details.committerName)} — ${escapeHtml(details.committerDate)}</span>
  </div>
</div>
${details.body.length > 0 ? `<pre class="body">${escapeHtml(details.body)}</pre>` : ""}
<div class="summary">
  <h2>${escapeHtml(tr("{count} files changed", { count: details.files.length }))}
    — <span class="add">+${totalAdditions}</span> <span class="del">-${totalDeletions}</span></h2>
  <div class="total-bar" aria-hidden="true"><span style="width:${((totalAdditions / total) * 100).toFixed(1)}%"></span></div>
  ${details.files.length > 8 ? `<input type="text" id="filter" placeholder="${escapeHtml(tr("Filter files…"))}" spellcheck="false" />` : ""}
</div>
<ul>
${files}
</ul>
<script nonce="${nonce}">${script}</script>
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
