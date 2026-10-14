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
  const files = details.files
    .map(
      (file, index) => `<li class="file" data-index="${index}" title="${escapeHtml(file.path)}">
  <span class="path">${escapeHtml(file.path)}</span>
  <span class="stat">${
    file.additions === null || file.deletions === null
      ? escapeHtml(tr("binary"))
      : `<span class="add">+${file.additions}</span> <span class="del">-${file.deletions}</span>`
  }</span>
</li>`
    )
    .join("\n");
  // Only indexes cross the webview boundary; paths are resolved on the extension side.
  const script = `
  const vscodeApi = acquireVsCodeApi();
  document.getElementById('copyHash').addEventListener('click', () => vscodeApi.postMessage({ type: 'copyHash' }));
  document.querySelectorAll('li.file').forEach((item) => {
    item.addEventListener('click', () => vscodeApi.postMessage({ type: 'openFile', index: Number(item.dataset.index) }));
  });`;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${escapeHtml(tr("Commit details"))}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 6px; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.7; }
  .hash { font-family: var(--vscode-editor-font-family, monospace); }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 2px 8px; cursor: pointer; margin-left: 6px; }
  pre.body { white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); margin: 14px 0; padding: 10px; border: 1px solid var(--vscode-panel-border); }
  h2 { font-size: 13px; margin: 16px 0 6px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li.file { display: flex; justify-content: space-between; gap: 12px; padding: 3px 6px; cursor: pointer; font-size: 12px; }
  li.file:hover { background: var(--vscode-list-hoverBackground); }
  .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .add { color: var(--vscode-gitDecoration-addedResourceForeground, #59a869); }
  .del { color: var(--vscode-gitDecoration-deletedResourceForeground, #d9534f); }
</style>
</head>
<body>
<h1>${escapeHtml(details.subject)}</h1>
<div class="meta">
  <div>${escapeHtml(repositoryName)} — <span class="hash">${escapeHtml(details.hash)}</span><button id="copyHash">${escapeHtml(tr("Copy hash"))}</button></div>
  <div>${escapeHtml(tr("Author"))}: ${escapeHtml(details.authorName)} &lt;${escapeHtml(details.authorEmail)}&gt; — ${escapeHtml(details.authorDate)}</div>
  <div>${escapeHtml(tr("Committer"))}: ${escapeHtml(details.committerName)} — ${escapeHtml(details.committerDate)}</div>
  ${details.parentHashes.length > 0 ? `<div>${escapeHtml(tr("Parents"))}: <span class="hash">${escapeHtml(details.parentHashes.map((hash) => hash.slice(0, 7)).join(", "))}</span></div>` : ""}
</div>
${details.body.length > 0 ? `<pre class="body">${escapeHtml(details.body)}</pre>` : ""}
<h2>${escapeHtml(tr("{count} files changed", { count: details.files.length }))}
  — <span class="add">+${totalAdditions}</span> <span class="del">-${totalDeletions}</span></h2>
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
