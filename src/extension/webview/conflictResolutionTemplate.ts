import type { Webview } from "vscode";
import type { ConflictSegment } from "../../core/git/parseConflictMarkers";
import { translate, type AppLanguage, type TranslationValues } from "../../shared/i18n";
import type { GitOperationState } from "../../shared/types/repository";

export type ConflictEditorData = {
  readonly filePath: string;
  readonly repositoryName: string;
  readonly result: string;
  readonly base: string;
  readonly current: string;
  readonly incoming: string;
  readonly baseExists: boolean;
  readonly currentExists: boolean;
  readonly incomingExists: boolean;
  readonly segments: readonly ConflictSegment[];
  readonly operation?: GitOperationState;
  readonly language?: AppLanguage;
};

export function getConflictResolutionHtml(webview: Webview, data: ConflictEditorData): string {
  const nonce = createNonce();
  const language = data.language ?? "en";
  const tr = (message: string, values?: TranslationValues) => translate(language, message, values);
  const translations = Object.fromEntries(CONFLICT_TRANSLATION_KEYS.map((message) => [message, tr(message)]));
  const dataScript = serializeForInlineScript({ ...data, language, translations });

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${escapeHtml(tr("Merge Revisions"))}</title>
<style>
  :root {
    color-scheme: dark;
    --bg: var(--vscode-editor-background, #1e1f22);
    --panel: var(--vscode-sideBar-background, #2b2d30);
    --panel-2: var(--vscode-editorGroupHeader-tabsBackground, #252629);
    --border: var(--vscode-panel-border, #3c3f41);
    --text: var(--vscode-editor-foreground, #bcbec4);
    --muted: var(--vscode-descriptionForeground, #868a91);
    --blue: var(--vscode-charts-blue, #3574a8);
    --blue-soft: color-mix(in srgb, var(--blue) 35%, transparent);
    --green: var(--vscode-charts-green, #397b53);
    --green-soft: color-mix(in srgb, var(--green) 38%, transparent);
    --red: var(--vscode-charts-red, #8b4b3e);
    --red-soft: color-mix(in srgb, var(--red) 36%, transparent);
    --line-height: 22px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    height: 100vh;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text);
    background: var(--bg);
    font-family: var(--vscode-font-family, Inter, sans-serif);
  }
  button, select { font: inherit; }
  button {
    border: 1px solid transparent;
    border-radius: 4px;
    min-height: 28px;
    padding: 3px 9px;
    color: var(--text);
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover {
    border-color: var(--border);
    background: color-mix(in srgb, var(--text) 10%, transparent);
  }
  button:disabled { opacity: .42; cursor: not-allowed; }
  button.primary {
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .titlebar {
    flex: 0 0 auto;
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .titlebar strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }
  .merge-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 42px;
    padding: 5px 9px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .toolbar-separator {
    width: 1px;
    align-self: stretch;
    margin: 2px 4px;
    background: var(--border);
  }
  .toolbar-label {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .icon-button {
    min-width: 30px;
    padding: 2px 7px;
    font-size: 17px;
    line-height: 1;
  }
  .accept-button { white-space: nowrap; }
  select {
    min-height: 28px;
    padding: 2px 28px 2px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    background: var(--panel-2);
  }
  .operation-meta {
    margin-left: auto;
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .workspace {
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .column-headers,
  .merge-grid {
    display: grid;
    grid-template-columns:
      minmax(280px, 1fr)
      48px
      minmax(320px, 1.15fr)
      48px
      minmax(280px, 1fr);
    min-width: 1040px;
  }
  .column-headers {
    flex: 0 0 auto;
    border-bottom: 1px solid var(--border);
    background: var(--panel-2);
  }
  .column-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 34px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 600;
  }
  .column-header.left { color: #72a7d8; }
  .column-header.result {
    color: #82b1df;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }
  .column-header.right { color: #78c092; }
  .column-header small {
    color: var(--muted);
    font-size: 10px;
    font-weight: 500;
  }
  .header-gutter { border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
  .editor-scroll {
    min-height: 0;
    flex: 1;
    overflow: auto;
    scrollbar-color: var(--muted) transparent;
  }
  .merge-grid { align-content: start; }
  .code-cell,
  .result-cell,
  .action-gutter {
    min-width: 0;
    position: relative;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }
  .code-cell,
  .result-cell {
    display: flex;
    min-height: var(--line-height);
    background: var(--bg);
  }
  .code-cell.left { border-right: 1px solid var(--border); }
  .code-cell.right { border-left: 1px solid var(--border); }
  .line-numbers {
    flex: 0 0 44px;
    padding: 3px 8px 3px 4px;
    text-align: right;
    white-space: pre;
    user-select: none;
    color: color-mix(in srgb, var(--muted) 65%, transparent);
    background: color-mix(in srgb, var(--panel-2) 55%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    font-family: var(--vscode-editor-font-family, "JetBrains Mono", monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: var(--line-height);
  }
  pre.code {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 3px 9px;
    overflow: hidden;
    white-space: pre;
    color: var(--text);
    font-family: var(--vscode-editor-font-family, "JetBrains Mono", monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: var(--line-height);
    tab-size: 2;
  }
  .context-cell pre.code { color: color-mix(in srgb, var(--text) 88%, transparent); }
  .conflict-cell.left { background: var(--blue-soft); }
  .conflict-cell.right { background: var(--green-soft); }
  .conflict-cell.deleted {
    background:
      repeating-linear-gradient(
        -45deg,
        color-mix(in srgb, var(--red) 28%, transparent),
        color-mix(in srgb, var(--red) 28%, transparent) 7px,
        transparent 7px,
        transparent 14px
      );
  }
  .empty-side {
    padding: 6px 10px;
    color: var(--muted);
    font-style: italic;
  }
  .word-change {
    padding: 1px 0;
    border-radius: 2px;
    background: color-mix(in srgb, #79aee3 45%, transparent);
  }
  .right .word-change { background: color-mix(in srgb, #74b68b 45%, transparent); }
  .action-gutter {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding-top: 3px;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    background: var(--panel-2);
  }
  .action-gutter.conflict-left {
    background: linear-gradient(90deg, var(--blue-soft), color-mix(in srgb, var(--blue) 18%, var(--panel-2)));
  }
  .action-gutter.conflict-right {
    background: linear-gradient(90deg, color-mix(in srgb, var(--green) 18%, var(--panel-2)), var(--green-soft));
  }
  .action-gutter.conflict-left::before,
  .action-gutter.conflict-right::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: .72;
    pointer-events: none;
  }
  .action-gutter.conflict-left::before {
    background: var(--blue-soft);
    clip-path: polygon(0 0, 62% 0, 100% 25%, 100% 75%, 62% 100%, 0 100%);
  }
  .action-gutter.conflict-right::before {
    background: var(--green-soft);
    clip-path: polygon(38% 0, 100% 0, 100% 100%, 38% 100%, 0 75%, 0 25%);
  }
  .hunk-action {
    position: relative;
    z-index: 1;
    min-width: 20px;
    min-height: 23px;
    padding: 0 3px;
    border-radius: 2px;
    color: color-mix(in srgb, var(--text) 88%, transparent);
    font-size: 18px;
    line-height: 20px;
  }
  .hunk-action.reject { font-size: 15px; }
  .result-cell {
    flex-direction: column;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }
  .result-cell.active {
    outline: 1px solid color-mix(in srgb, var(--blue) 75%, white);
    outline-offset: -1px;
  }
  .result-cell.unresolved { background: var(--red-soft); }
  .result-cell.choice-current { background: var(--blue-soft); }
  .result-cell.choice-incoming { background: var(--green-soft); }
  .result-cell.choice-both {
    background: linear-gradient(90deg, var(--blue-soft), var(--green-soft));
  }
  .result-cell.choice-base { background: color-mix(in srgb, #a078c2 30%, transparent); }
  .result-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 3px;
    min-height: 27px;
    padding: 2px 5px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  }
  .result-toolbar span {
    margin-right: auto;
    align-self: center;
    color: var(--muted);
    font-size: 10px;
  }
  .result-toolbar button {
    min-height: 21px;
    padding: 0 6px;
    font-size: 10px;
  }
  .result-edit-wrap {
    min-height: var(--line-height);
    flex: 1;
    display: flex;
  }
  textarea.result-editor {
    flex: 1;
    min-width: 0;
    min-height: 100%;
    resize: none;
    overflow: hidden;
    border: 0;
    outline: 0;
    padding: 3px 9px;
    color: var(--text);
    background: transparent;
    font-family: var(--vscode-editor-font-family, "JetBrains Mono", monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: var(--line-height);
    white-space: pre;
    tab-size: 2;
  }
  textarea.result-editor::placeholder {
    color: color-mix(in srgb, var(--muted) 72%, transparent);
    font-style: italic;
  }
  .syntax-keyword { color: #cf8e6d; }
  .syntax-string { color: #6aab73; }
  .syntax-comment { color: #7a7e85; font-style: italic; }
  .syntax-number { color: #2aacb8; }
  .base-panel {
    flex: 0 0 auto;
    display: none;
    max-height: 28vh;
    overflow: auto;
    border-top: 1px solid var(--border);
    background: var(--panel-2);
  }
  .base-panel.visible { display: block; }
  .base-panel header {
    position: sticky;
    top: 0;
    padding: 6px 10px;
    color: #b493d2;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
  }
  .base-panel pre {
    margin: 0;
    padding: 8px 12px;
    white-space: pre;
    font-family: var(--vscode-editor-font-family, "JetBrains Mono", monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: var(--line-height);
  }
  .statusbar {
    flex: 0 0 auto;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 3px 10px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    background: var(--panel);
    font-size: 11px;
  }
  .statusbar .ready { color: #73bd8b; }
  .statusbar .warning { color: #d89278; }
  @media (max-width: 900px) {
    .titlebar { justify-content: flex-start; }
    .merge-toolbar { flex-wrap: nowrap; }
    .operation-meta { margin-left: 0; }
  }
  @media (max-width: 1300px) {
    .toolbar-label,
    .operation-meta { display: none; }
  }
  /* ---- polish: motion, focus and depth (visual only; layout and ids are unchanged) ---- */
  :root { --ease: cubic-bezier(0.2, 0.8, 0.2, 1); }
  body { animation: gwp-fade 240ms var(--ease) both; }
  button {
    border-radius: 6px;
    transition: background 140ms, border-color 140ms, transform 90ms, box-shadow 160ms, filter 140ms;
  }
  button:active:not(:disabled) { transform: scale(0.96); }
  button:focus-visible, select:focus-visible { outline: 1px solid var(--vscode-focusBorder, #0078d4); outline-offset: 1px; }
  button.primary { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); }
  button.primary:hover:not(:disabled) { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); filter: brightness(1.06); }
  select { border-radius: 6px; transition: border-color 140ms, box-shadow 140ms; }
  .titlebar, .merge-toolbar { box-shadow: 0 1px 0 rgba(0, 0, 0, 0.15); }
  .titlebar strong { letter-spacing: 0.01em; }
  .merge-toolbar { scrollbar-width: thin; }
  .code-cell, .context-cell, .gutter-cell { transition: background-color 180ms ease; }
  @keyframes gwp-fade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
  }
</style>
</head>
<body>
<div class="titlebar">
  <strong id="mergeTitle"></strong>
</div>
<div class="merge-toolbar">
  <span class="toolbar-label">${escapeHtml(tr("Apply non-conflicting changes:"))}</span>
  <button class="accept-button" id="acceptAllCurrentButton" title="${escapeHtml(tr("Accept every current-side conflict"))}">≫ ${escapeHtml(tr("Left"))}</button>
  <button class="accept-button" id="acceptAllBothButton" title="${escapeHtml(tr("Accept both sides for every conflict"))}">≫≪ ${escapeHtml(tr("All"))}</button>
  <button class="accept-button" id="acceptAllIncomingButton" title="${escapeHtml(tr("Accept every incoming-side conflict"))}">≪ ${escapeHtml(tr("Right"))}</button>
  <span class="toolbar-separator"></span>
  <button class="icon-button" id="previousButton" title="${escapeHtml(tr("Previous conflict"))}">↑</button>
  <button class="icon-button" id="nextButton" title="${escapeHtml(tr("Next conflict"))}">↓</button>
  <select id="ignoreMode" title="${escapeHtml(tr("Whitespace comparison"))}">
    <option value="none">${escapeHtml(tr("Do not ignore"))}</option>
    <option value="trim">${escapeHtml(tr("Ignore leading/trailing whitespace"))}</option>
    <option value="all">${escapeHtml(tr("Ignore whitespaces"))}</option>
  </select>
  <select id="highlightMode" title="${escapeHtml(tr("Difference highlighting"))}">
    <option value="words">${escapeHtml(tr("Highlight words"))}</option>
    <option value="lines">${escapeHtml(tr("Highlight lines"))}</option>
  </select>
  <button id="detailsButton" title="${escapeHtml(tr("Show or hide the Base revision"))}">${escapeHtml(tr("Details"))}</button>
  <button id="nativeButton" title="${escapeHtml(tr("Open the VS Code native Merge Editor"))}">${escapeHtml(tr("Native"))}</button>
  <span class="operation-meta" id="operationMeta"></span>
  <button class="icon-button" id="cancelButton" title="${escapeHtml(tr("Close without applying"))}">✕</button>
  <button class="primary" id="saveButton">${escapeHtml(tr("Apply"))}</button>
</div>
<main class="workspace">
  <div class="column-headers">
    <div class="column-header left"><span id="currentTitle"></span><small>${escapeHtml(tr("Read-only"))}</small></div>
    <div class="header-gutter"></div>
    <div class="column-header result"><span>${escapeHtml(tr("Result"))}</span><small>${escapeHtml(tr("Editable"))}</small></div>
    <div class="header-gutter"></div>
    <div class="column-header right"><span id="incomingTitle"></span><small>${escapeHtml(tr("Read-only"))}</small></div>
  </div>
  <div class="editor-scroll" id="editorScroll">
    <div class="merge-grid" id="mergeGrid"></div>
  </div>
</main>
<section class="base-panel" id="basePanel">
  <header>${escapeHtml(tr("Base revision"))}</header>
  <pre id="baseContent"></pre>
</section>
<footer class="statusbar">
  <span id="conflictStatus"></span>
  <span id="selectionStatus"></span>
  <span id="fileStatus"></span>
</footer>
<script nonce="${nonce}">
  const conflictData = ${dataScript};
  ${getClientScript()}
</script>
</body>
</html>`;
}

const CONFLICT_TRANSLATION_KEYS = [
  "Merge Revisions for {file}",
  "Base revision is unavailable.",
  "Changes from {source}",
  "current branch",
  "incoming branch",
  "Current",
  "Incoming",
  "Deleted in {side}",
  "Reject current change",
  "Accept current change",
  "Accept incoming change",
  "Reject incoming change",
  "Conflict {number}",
  "Base",
  "Both",
  "Mark Resolved",
  "Reset",
  "Resolve with arrows or edit the Result here…",
  "Selected conflict {current}/{total}",
  "Delete",
  "Apply",
  "{resolved} / {total} conflicts resolved",
  "Conflict markers remain",
  "Result is ready to apply",
  "Resolve every highlighted block",
  "Hide Details",
  "Details"
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function createNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < 32; index += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function getClientScript(): string {
  return `
  const vscodeApi = acquireVsCodeApi();
  function tr(message, values = {}) {
    const localized = conflictData.translations[message] || message;
    return localized.replace(/\\{(\\w+)\\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
    );
  }
  const mergeGrid = document.getElementById('mergeGrid');
  const editorScroll = document.getElementById('editorScroll');
  const saveButton = document.getElementById('saveButton');
  const conflictStatus = document.getElementById('conflictStatus');
  const selectionStatus = document.getElementById('selectionStatus');
  const fileStatus = document.getElementById('fileStatus');
  const originalEndsWithNewline = conflictData.result.endsWith('\\n');
  const conflictRows = [];
  const resultEditors = [];
  let activeConflictIndex = 0;
  let deleteResult = false;
  let highlightMode = 'words';
  let ignoreMode = 'none';

  const parsedConflicts = conflictData.segments.filter((segment) => segment.kind === 'conflict');
  const hasMarkerConflicts = parsedConflicts.length > 0;
  const editorSegments = hasMarkerConflicts
    ? conflictData.segments
    : [{
        kind: 'conflict',
        oursLabel: 'Current',
        theirsLabel: 'Incoming',
        ours: conflictData.current,
        theirs: conflictData.incoming,
        base: conflictData.base,
        synthetic: true,
        initialResult: conflictData.result
      }];

  document.getElementById('mergeTitle').textContent =
    tr('Merge Revisions for {file}', { file: conflictData.filePath });
  document.getElementById('operationMeta').textContent =
    conflictData.repositoryName + (conflictData.operation ? ' · ' + formatOperation(conflictData.operation) : '');
  document.getElementById('baseContent').textContent =
    conflictData.baseExists ? conflictData.base : tr('Base revision is unavailable.');
  document.getElementById('currentTitle').textContent =
    tr('Changes from {source}', { source: currentLabel() });
  document.getElementById('incomingTitle').textContent =
    tr('Changes from {source}', { source: incomingLabel() });

  function currentLabel() {
    const conflict = parsedConflicts[0];
    return conflict && conflict.oursLabel && conflict.oursLabel !== 'HEAD'
      ? conflict.oursLabel
      : tr('current branch');
  }

  function incomingLabel() {
    const conflict = parsedConflicts[0];
    return conflict && conflict.theirsLabel
      ? conflict.theirsLabel
      : tr('incoming branch');
  }

  function formatOperation(operation) {
    const name = operation.type
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return operation.currentStep && operation.totalSteps
      ? name + ' ' + operation.currentStep + '/' + operation.totalSteps
      : name;
  }

  function normalizeForComparison(value) {
    if (ignoreMode === 'trim') {
      return value.split('\\n').map((line) => line.trim()).join('\\n');
    }
    if (ignoreMode === 'all') {
      return value.replace(/\\s+/g, '');
    }
    return value;
  }

  function splitLines(value) {
    if (value.length === 0) {
      return [];
    }
    return value.split('\\n');
  }

  function lineNumbers(start, count) {
    return Array.from({ length: count }, (_, index) => String(start + index)).join('\\n');
  }

  function tokenize(value) {
    return value.match(/\\/\\/[^\\n]*|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\s+|[A-Za-z_$][\\w$]*|\\d+(?:\\.\\d+)?|./gs) || [];
  }

  function syntaxClass(token) {
    if (/^\\/\\//.test(token)) {
      return 'syntax-comment';
    }
    if (/^["']/.test(token)) {
      return 'syntax-string';
    }
    if (/^(?:export|import|from|function|return|const|let|var|class|interface|type|public|private|protected|async|await|if|else|for|while|new|throw|try|catch|finally|extends|implements|readonly|static|void|string|number|boolean)$/.test(token)) {
      return 'syntax-keyword';
    }
    if (/^\\d/.test(token)) {
      return 'syntax-number';
    }
    return '';
  }

  function changedTokenMask(value, otherValue) {
    const tokens = tokenize(value);
    const otherTokens = tokenize(otherValue);
    if (tokens.length > 220 || otherTokens.length > 220) {
      return { tokens, changed: tokens.map(() => true) };
    }
    const rows = tokens.length + 1;
    const columns = otherTokens.length + 1;
    const table = Array.from({ length: rows }, () => new Uint16Array(columns));
    for (let leftIndex = tokens.length - 1; leftIndex >= 0; leftIndex -= 1) {
      for (let rightIndex = otherTokens.length - 1; rightIndex >= 0; rightIndex -= 1) {
        table[leftIndex][rightIndex] = tokens[leftIndex] === otherTokens[rightIndex]
          ? table[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
      }
    }
    const matched = new Set();
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < tokens.length && rightIndex < otherTokens.length) {
      if (tokens[leftIndex] === otherTokens[rightIndex]) {
        matched.add(leftIndex);
        leftIndex += 1;
        rightIndex += 1;
      } else if (table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1]) {
        leftIndex += 1;
      } else {
        rightIndex += 1;
      }
    }
    return {
      tokens,
      changed: tokens.map((_, index) => !matched.has(index))
    };
  }

  function renderCode(pre, value, otherValue, isConflict) {
    pre.textContent = '';
    pre.dataset.text = value;
    pre.dataset.other = otherValue;
    pre.dataset.conflict = String(isConflict);
    const diff = isConflict && highlightMode === 'words' && normalizeForComparison(value) !== normalizeForComparison(otherValue)
      ? changedTokenMask(value, otherValue)
      : { tokens: tokenize(value), changed: tokenize(value).map(() => false) };
    diff.tokens.forEach((token, index) => {
      const tokenSyntaxClass = syntaxClass(token);
      const isChanged = diff.changed[index] && !/^\\s+$/.test(token);
      if (!isChanged && !tokenSyntaxClass) {
        pre.appendChild(document.createTextNode(token));
        return;
      }
      const span = document.createElement('span');
      span.className = [isChanged ? 'word-change' : '', tokenSyntaxClass].filter(Boolean).join(' ');
      span.textContent = token;
      pre.appendChild(span);
    });
  }

  function createCodeCell(side, value, otherValue, startLine, isConflict, exists = true) {
    const cell = document.createElement('div');
    cell.className = 'code-cell ' + side + ' ' + (isConflict ? 'conflict-cell' : 'context-cell');
    if (!exists) {
      cell.classList.add('deleted');
      const deleted = document.createElement('div');
      deleted.className = 'empty-side';
      deleted.textContent = '<' + tr('Deleted in {side}', {
        side: side === 'left' ? tr('Current') : tr('Incoming')
      }) + '>';
      cell.appendChild(deleted);
      return cell;
    }

    const lines = splitLines(value);
    const numbers = document.createElement('div');
    numbers.className = 'line-numbers';
    numbers.textContent = lineNumbers(startLine, lines.length);
    const pre = document.createElement('pre');
    pre.className = 'code';
    renderCode(pre, value, otherValue, isConflict);
    cell.appendChild(numbers);
    cell.appendChild(pre);
    return cell;
  }

  function createGutter(side, conflictIndex, isConflict) {
    const gutter = document.createElement('div');
    gutter.className = 'action-gutter' + (isConflict ? ' conflict-' + side : '');
    if (!isConflict) {
      return gutter;
    }

    if (side === 'left') {
      gutter.appendChild(actionButton('×', tr('Reject current change'), () => resetConflict(conflictIndex), 'reject'));
      gutter.appendChild(actionButton('»', tr('Accept current change'), () => chooseConflict(conflictIndex, 'current')));
    } else {
      gutter.appendChild(actionButton('«', tr('Accept incoming change'), () => chooseConflict(conflictIndex, 'incoming')));
      gutter.appendChild(actionButton('×', tr('Reject incoming change'), () => resetConflict(conflictIndex), 'reject'));
    }
    return gutter;
  }

  function actionButton(text, title, handler, extraClass = '') {
    const button = document.createElement('button');
    button.className = 'hunk-action ' + extraClass;
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', handler);
    return button;
  }

  function createResultCell(segment, conflictIndex, startLine, minLines, isConflict) {
    const cell = document.createElement('div');
    cell.className = 'result-cell ' + (isConflict ? 'unresolved' : 'context-cell');
    cell.dataset.conflictIndex = isConflict ? String(conflictIndex) : '';
    cell.style.minHeight = Math.max(1, minLines) * 22 + (isConflict ? 29 : 0) + 'px';

    if (isConflict) {
      const toolbar = document.createElement('div');
      toolbar.className = 'result-toolbar';
      const label = document.createElement('span');
      label.textContent = tr('Conflict {number}', { number: conflictIndex + 1 });
      toolbar.appendChild(label);
      if (segment.base !== undefined) {
        toolbar.appendChild(smallButton(tr('Base'), () => chooseConflict(conflictIndex, 'base')));
      }
      toolbar.appendChild(smallButton(tr('Both'), () => chooseConflict(conflictIndex, 'both')));
      toolbar.appendChild(smallButton(tr('Mark Resolved'), () => markManualResolved(conflictIndex)));
      toolbar.appendChild(smallButton(tr('Reset'), () => resetConflict(conflictIndex)));
      cell.appendChild(toolbar);
    }

    const wrap = document.createElement('div');
    wrap.className = 'result-edit-wrap';
    const numbers = document.createElement('div');
    numbers.className = 'line-numbers result-line-numbers';
    numbers.dataset.start = String(startLine);
    const editor = document.createElement('textarea');
    editor.className = 'result-editor';
    editor.spellcheck = false;
    editor.dataset.conflictIndex = isConflict ? String(conflictIndex) : '';
    editor.value = isConflict
      ? (segment.synthetic ? segment.initialResult || '' : '')
      : segment.text;
    editor.placeholder = isConflict ? tr('Resolve with arrows or edit the Result here…') : '';
    editor.addEventListener('focus', () => {
      if (isConflict) {
        setActiveConflict(conflictIndex);
      }
    });
    editor.addEventListener('input', () => {
      deleteResult = false;
      autoSizeEditor(editor);
      if (isConflict) {
        const row = conflictRows[conflictIndex];
        row.resolved = !containsConflictMarkers(editor.value);
        row.choice = 'manual';
        applyResultState(row);
      }
      recalculateResultLineNumbers();
      updateState();
    });
    wrap.appendChild(numbers);
    wrap.appendChild(editor);
    cell.appendChild(wrap);
    resultEditors.push(editor);
    requestAnimationFrame(() => autoSizeEditor(editor));
    return cell;
  }

  function smallButton(text, handler) {
    const button = document.createElement('button');
    button.textContent = text;
    button.addEventListener('click', handler);
    return button;
  }

  function autoSizeEditor(editor) {
    editor.style.height = 'auto';
    editor.style.height = Math.max(editor.scrollHeight, 22) + 'px';
  }

  function buildGrid() {
    mergeGrid.textContent = '';
    conflictRows.length = 0;
    resultEditors.length = 0;
    let leftLine = 1;
    let rightLine = 1;
    let resultLine = 1;
    let conflictIndex = 0;

    for (const segment of editorSegments) {
      const isConflict = segment.kind === 'conflict';
      if (!isConflict) {
        const count = splitLines(segment.text).length;
        mergeGrid.appendChild(createCodeCell('left', segment.text, segment.text, leftLine, false));
        mergeGrid.appendChild(createGutter('left', -1, false));
        mergeGrid.appendChild(createResultCell(segment, -1, resultLine, count, false));
        mergeGrid.appendChild(createGutter('right', -1, false));
        mergeGrid.appendChild(createCodeCell('right', segment.text, segment.text, rightLine, false));
        leftLine += count;
        rightLine += count;
        resultLine += count;
        continue;
      }

      const leftExists = segment.synthetic ? conflictData.currentExists : true;
      const rightExists = segment.synthetic ? conflictData.incomingExists : true;
      const leftCount = leftExists ? splitLines(segment.ours).length : 0;
      const rightCount = rightExists ? splitLines(segment.theirs).length : 0;
      const initialResultCount = splitLines(segment.initialResult || '').length;
      const minLines = Math.max(leftCount, rightCount, initialResultCount, 2);
      const leftCell = createCodeCell(
        'left',
        segment.ours,
        segment.theirs,
        leftLine,
        true,
        leftExists
      );
      const resultCell = createResultCell(segment, conflictIndex, resultLine, minLines, true);
      const rightCell = createCodeCell(
        'right',
        segment.theirs,
        segment.ours,
        rightLine,
        true,
        rightExists
      );
      mergeGrid.appendChild(leftCell);
      mergeGrid.appendChild(createGutter('left', conflictIndex, true));
      mergeGrid.appendChild(resultCell);
      mergeGrid.appendChild(createGutter('right', conflictIndex, true));
      mergeGrid.appendChild(rightCell);

      conflictRows.push({
        index: conflictIndex,
        segment,
        leftCell,
        resultCell,
        rightCell,
        editor: resultEditors[resultEditors.length - 1],
        resolved: Boolean(segment.synthetic && !containsConflictMarkers(segment.initialResult || '')),
        choice: segment.synthetic ? 'manual' : null
      });
      leftLine += leftCount;
      rightLine += rightCount;
      resultLine += initialResultCount;
      conflictIndex += 1;
    }

    recalculateResultLineNumbers();
    setActiveConflict(0);
    updateState();
  }

  function chooseConflict(index, choice) {
    const row = conflictRows[index];
    if (!row) {
      return;
    }
    const segment = row.segment;
    if (choice === 'current') {
      row.editor.value = segment.ours;
      deleteResult = Boolean(segment.synthetic && !conflictData.currentExists);
    } else if (choice === 'incoming') {
      row.editor.value = segment.theirs;
      deleteResult = Boolean(segment.synthetic && !conflictData.incomingExists);
    } else if (choice === 'both') {
      row.editor.value = [segment.ours, segment.theirs].filter(Boolean).join('\\n');
      deleteResult = false;
    } else if (choice === 'base') {
      row.editor.value = segment.base || '';
      deleteResult = false;
    }
    row.choice = choice;
    row.resolved = true;
    autoSizeEditor(row.editor);
    applyResultState(row);
    recalculateResultLineNumbers();
    setActiveConflict(index);
    updateState();
  }

  function markManualResolved(index) {
    const row = conflictRows[index];
    if (!row || containsConflictMarkers(row.editor.value)) {
      return;
    }
    row.choice = 'manual';
    row.resolved = true;
    applyResultState(row);
    updateState();
  }

  function resetConflict(index) {
    const row = conflictRows[index];
    if (!row) {
      return;
    }
    row.editor.value = row.segment.synthetic ? row.segment.initialResult || '' : '';
    row.choice = row.segment.synthetic ? 'manual' : null;
    row.resolved = Boolean(row.segment.synthetic && !containsConflictMarkers(row.editor.value));
    deleteResult = false;
    autoSizeEditor(row.editor);
    applyResultState(row);
    recalculateResultLineNumbers();
    updateState();
  }

  function applyResultState(row) {
    row.resultCell.classList.toggle('unresolved', !row.resolved);
    row.resultCell.classList.toggle('choice-current', row.choice === 'current');
    row.resultCell.classList.toggle('choice-incoming', row.choice === 'incoming');
    row.resultCell.classList.toggle('choice-both', row.choice === 'both');
    row.resultCell.classList.toggle('choice-base', row.choice === 'base');
  }

  function acceptAll(choice) {
    conflictRows.forEach((_, index) => chooseConflict(index, choice));
    setActiveConflict(0);
  }

  function setActiveConflict(index) {
    if (conflictRows.length === 0) {
      return;
    }
    activeConflictIndex = Math.max(0, Math.min(index, conflictRows.length - 1));
    conflictRows.forEach((row) => {
      row.resultCell.classList.toggle('active', row.index === activeConflictIndex);
    });
    selectionStatus.textContent = tr('Selected conflict {current}/{total}', {
      current: activeConflictIndex + 1,
      total: conflictRows.length
    });
  }

  function navigateConflict(direction) {
    if (conflictRows.length === 0) {
      return;
    }
    const nextIndex = (activeConflictIndex + direction + conflictRows.length) % conflictRows.length;
    setActiveConflict(nextIndex);
    conflictRows[nextIndex].leftCell.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function recalculateResultLineNumbers() {
    let line = 1;
    resultEditors.forEach((editor) => {
      const count = splitLines(editor.value).length;
      const numbers = editor.parentElement.querySelector('.result-line-numbers');
      numbers.textContent = lineNumbers(line, count);
      line += count;
    });
  }

  function containsConflictMarkers(content) {
    return /^<{7}(?: .*)?$/m.test(content) || /^>{7}(?: .*)?$/m.test(content);
  }

  function assembleResult() {
    const content = resultEditors.map((editor) => editor.value).join('\\n');
    return originalEndsWithNewline && !content.endsWith('\\n') ? content + '\\n' : content;
  }

  function updateState() {
    const resolvedCount = conflictRows.filter((row) => row.resolved).length;
    const result = assembleResult();
    const markerFree = !containsConflictMarkers(result);
    const ready = resolvedCount === conflictRows.length && markerFree;
    saveButton.disabled = !ready;
    saveButton.textContent = deleteResult ? tr('Delete') : tr('Apply');
    conflictStatus.textContent = tr('{resolved} / {total} conflicts resolved', {
      resolved: resolvedCount,
      total: conflictRows.length
    });
    conflictStatus.className = ready ? 'ready' : 'warning';
    fileStatus.textContent = !markerFree
      ? tr('Conflict markers remain')
      : ready
        ? tr('Result is ready to apply')
        : tr('Resolve every highlighted block');
    fileStatus.className = ready ? 'ready' : 'warning';
    document.getElementById('previousButton').disabled = conflictRows.length < 2;
    document.getElementById('nextButton').disabled = conflictRows.length < 2;
  }

  function rerenderHighlights() {
    document.querySelectorAll('pre.code').forEach((pre) => {
      renderCode(
        pre,
        pre.dataset.text || '',
        pre.dataset.other || '',
        pre.dataset.conflict === 'true'
      );
    });
  }

  document.getElementById('acceptAllCurrentButton').addEventListener('click', () => acceptAll('current'));
  document.getElementById('acceptAllBothButton').addEventListener('click', () => acceptAll('both'));
  document.getElementById('acceptAllIncomingButton').addEventListener('click', () => acceptAll('incoming'));
  document.getElementById('previousButton').addEventListener('click', () => navigateConflict(-1));
  document.getElementById('nextButton').addEventListener('click', () => navigateConflict(1));
  document.getElementById('ignoreMode').addEventListener('change', (event) => {
    ignoreMode = event.target.value;
    rerenderHighlights();
  });
  document.getElementById('highlightMode').addEventListener('change', (event) => {
    highlightMode = event.target.value;
    rerenderHighlights();
  });
  document.getElementById('detailsButton').addEventListener('click', () => {
    const panel = document.getElementById('basePanel');
    const visible = panel.classList.toggle('visible');
    document.getElementById('detailsButton').textContent = visible ? tr('Hide Details') : tr('Details');
  });
  document.getElementById('nativeButton').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'openNative' });
  });
  document.getElementById('cancelButton').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'cancel' });
  });
  saveButton.addEventListener('click', () => {
    const result = assembleResult();
    if (!saveButton.disabled && !containsConflictMarkers(result)) {
      saveButton.disabled = true;
      vscodeApi.postMessage({ type: 'save', content: result, deleteFile: deleteResult });
    }
  });

  buildGrid();
  `;
}
