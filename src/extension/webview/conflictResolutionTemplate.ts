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
    color-scheme: light dark;
    --bg: var(--vscode-editor-background, #2b2b2b);
    --panel: var(--vscode-sideBar-background, #3c3f41);
    --panel-2: var(--vscode-editorGroupHeader-tabsBackground, #313335);
    --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
    --text: var(--vscode-editor-foreground, #bcbec4);
    --muted: var(--vscode-descriptionForeground, #868a91);
    --accent: var(--vscode-button-background, #365880);
    --blue: var(--vscode-charts-blue, #4a88c7);
    --green: var(--vscode-charts-green, #5fa05f);
    --red: var(--vscode-charts-red, #c75450);
    --purple: var(--vscode-charts-purple, #a078c2);
    --line-height: 20px;
    --strip: 28px;
    --radius: 10px;
    --radius-sm: 6px;
    --mono: var(--vscode-editor-font-family, "JetBrains Mono", Consolas, monospace);
    --mono-size: var(--vscode-editor-font-size, 13px);
    --columns: minmax(0, 1fr) 52px minmax(0, 1.15fr) 52px minmax(0, 1fr);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text);
    background: var(--bg);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: 13px;
  }
  button, select { font: inherit; font-size: 12px; }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 28px;
    padding: 2px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    background: color-mix(in srgb, var(--text) 7%, var(--panel));
    cursor: pointer;
    white-space: nowrap;
  }
  button { transition: background 140ms, border-color 140ms, box-shadow 160ms, transform 90ms, filter 140ms; }
  button:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 16%, var(--panel)); }
  button:active:not(:disabled) { transform: translateY(1px); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #3592c4);
    outline-offset: 1px;
  }
  button.primary {
    min-width: 92px;
    font-weight: 600;
    border-color: transparent;
    color: var(--vscode-button-foreground, #fff);
    background: var(--accent);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
  button.primary:not(:disabled):hover { box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4); }
  button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, var(--accent)); filter: brightness(1.1); }
  button.flat { border-color: transparent; background: transparent; }
  button.flat:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 14%, transparent); }
  select {
    min-height: 28px;
    max-width: 190px;
    padding: 1px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    background: color-mix(in srgb, var(--text) 7%, var(--panel));
  }

  /* ---- dialog title + toolbar ---- */
  .titlebar {
    flex: 0 0 auto;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 14px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .titlebar strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
  .merge-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 6px 10px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .tool-group { display: flex; align-items: center; gap: 4px; }
  .tool-group:has(.accept-button) { gap: 0; }
  .accept-button { border-radius: 0; margin-left: -1px; }
  .accept-button:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); margin-left: 0; }
  .accept-button:last-child { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
  #acceptAllCurrentButton { color: var(--blue); }
  #acceptAllIncomingButton { color: var(--green); }
  .tool-group button.flat { min-width: 28px; padding: 2px 6px; border-radius: 50%; font-size: 14px; }
  .toolbar-label { color: var(--muted); font-size: 12px; white-space: nowrap; margin-right: 2px; }
  .toolbar-sep { align-self: stretch; width: 1px; margin: 2px 2px; background: var(--border); }
  .operation-meta { margin-left: auto; color: var(--muted); font-size: 11px; white-space: nowrap; }

  /* ---- three-column surface ---- */
  .workspace { min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 10px 12px; }
  .editor-scroll {
    min-height: 0;
    flex: 1;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22); scrollbar-color: color-mix(in srgb, var(--muted) 60%, transparent) transparent; }
  .merge-surface { min-width: 900px; }
  .column-headers {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: var(--columns);
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .column-header {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 14px;
    font-weight: 600;
  }
  .column-header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .column-header small { color: var(--muted); font-size: 10px; font-weight: 400; flex: 0 0 auto; }
  .column-header.left::before, .column-header.right::before {
    content: "";
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    margin-right: 2px;
    align-self: center;
    border-radius: 50%;
    background: var(--blue);
  }
  .column-header.right::before { background: var(--green); }
  .column-header span { flex: 1; }
  .column-header.left { color: color-mix(in srgb, var(--blue) 60%, var(--text)); }
  .column-header.right { color: color-mix(in srgb, var(--green) 60%, var(--text)); }
  .column-header.result { border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
  .header-gutter { background: var(--panel); }

  .merge-grid { display: block; padding: 6px; }
  .merge-row { display: block; }
  .panes {
    display: grid;
    grid-template-columns: var(--columns);
    grid-template-areas: "left gl result gr right";
    align-items: stretch;
  }
  .pane { grid-area: left; min-width: 0; display: flex; flex-direction: column; }
  .pane.right { grid-area: right; }
  .panes > .result-cell { grid-area: result; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
  .gutter-left { grid-area: gl; }
  .gutter-right { grid-area: gr; }

  .line-numbers {
    flex: 0 0 auto;
    min-width: 44px;
    padding: 3px 8px 3px 4px;
    text-align: right;
    white-space: pre;
    user-select: none;
    color: color-mix(in srgb, var(--muted) 80%, transparent);
    background: color-mix(in srgb, var(--text) 5%, var(--bg));
    border-right: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    font-family: var(--mono);
    font-size: var(--mono-size);
    line-height: var(--line-height);
  }
  pre.code {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 3px 8px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    white-space: pre;
    color: var(--text);
    font-family: var(--mono);
    font-size: var(--mono-size);
    line-height: var(--line-height);
    tab-size: 2;
  }
  .pane-body { display: flex; flex: 1; min-width: 0; }

  /* strips above conflict blocks (aligned in all three columns) */
  .pane-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--strip);
    padding: 0 8px;
    font-size: 11px;
    color: var(--muted);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }
  .pane.left .pane-head { background: color-mix(in srgb, var(--blue) 22%, var(--bg)); color: color-mix(in srgb, var(--blue) 40%, var(--text)); }
  .pane.right .pane-head { background: color-mix(in srgb, var(--green) 22%, var(--bg)); color: color-mix(in srgb, var(--green) 40%, var(--text)); }
  .pane-head .where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pane-head small { display: none; }
  .result-head { justify-content: flex-start; background: color-mix(in srgb, var(--text) 7%, var(--bg)); color: var(--text); }
  .result-head .label { font-weight: 600; white-space: nowrap; }
  .badge {
    padding: 1px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--state, var(--red));
    background: color-mix(in srgb, var(--state, var(--red)) 18%, transparent);
  }
  .result-head { min-width: 0; overflow: hidden; }
  .result-actions { display: flex; gap: 0; margin-left: auto; flex: 0 1 auto; min-width: 0; }
  .result-actions button { min-height: 22px; padding: 0 7px; font-size: 11px; border-radius: 999px; }

  .conflict-row { --state: var(--red); }
  .conflict-row.state-current { --state: var(--blue); }
  .conflict-row.state-incoming { --state: var(--green); }
  .conflict-row.state-both, .conflict-row.state-base { --state: var(--purple); }
  .conflict-row.state-manual { --state: var(--green); }
  .conflict-row {
    margin: 8px 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--state) 55%, transparent);
    border-radius: var(--radius);
    transition: box-shadow 180ms, border-color 180ms;
  }
  .conflict-row.active { box-shadow: 0 0 0 1px var(--state), 0 6px 18px rgba(0, 0, 0, 0.3); }
  .context-block { border-radius: 4px; }
  .conflict-row .pane.left .pane-body { background: color-mix(in srgb, var(--blue) 17%, transparent); }
  .conflict-row .pane.right .pane-body { background: color-mix(in srgb, var(--green) 17%, transparent); }
  .pane.deleted .pane-body {
    background: repeating-linear-gradient(
      -45deg,
      color-mix(in srgb, var(--red) 22%, transparent),
      color-mix(in srgb, var(--red) 22%, transparent) 6px,
      transparent 6px,
      transparent 12px
    );
  }
  .empty-side { padding: 8px 12px; color: var(--muted); font-style: italic; }
  .word-change { padding: 1px 0; border-radius: 2px; background: color-mix(in srgb, var(--blue) 50%, transparent); }
  .right .word-change { background: color-mix(in srgb, var(--green) 50%, transparent); }

  /* gutters with IntelliJ-style ribbons */
  .action-gutter {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding-top: calc(var(--strip) + 2px);
    background: var(--panel-2);
  }
  .context-panes .action-gutter { padding-top: 0; }
  .conflict-row .action-gutter::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .conflict-row .gutter-left::before {
    background: color-mix(in srgb, var(--blue) 30%, transparent);
    clip-path: polygon(0 0, 55% 0, 100% 14%, 100% 86%, 55% 100%, 0 100%);
  }
  .conflict-row .gutter-right::before {
    background: color-mix(in srgb, var(--green) 30%, transparent);
    clip-path: polygon(45% 0, 100% 0, 100% 100%, 45% 100%, 0 86%, 0 14%);
  }
  .hunk-action {
    position: relative;
    z-index: 1;
    min-height: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: color-mix(in srgb, var(--text) 85%, transparent);
    font-size: 17px;
    line-height: 1;
  }
  .hunk-action.reject { font-size: 14px; }
  .hunk-action:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 24%, transparent); }

  /* result column */
  .result-cell { display: flex; flex-direction: column; min-width: 0; }
  .result-cell.unresolved .result-edit-wrap { background: color-mix(in srgb, var(--red) 16%, transparent); }
  .result-cell.choice-current .result-edit-wrap { background: color-mix(in srgb, var(--blue) 16%, transparent); }
  .result-cell.choice-incoming .result-edit-wrap { background: color-mix(in srgb, var(--green) 16%, transparent); }
  .result-cell.choice-both .result-edit-wrap { background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 16%, transparent), color-mix(in srgb, var(--green) 16%, transparent)); }
  .result-cell.choice-base .result-edit-wrap { background: color-mix(in srgb, var(--purple) 18%, transparent); }
  .result-cell.choice-manual .result-edit-wrap { background: color-mix(in srgb, var(--green) 10%, transparent); }
  .result-edit-wrap { min-height: var(--line-height); flex: 1; display: flex; }
  textarea.result-editor {
    flex: 1;
    min-width: 0;
    min-height: 100%;
    resize: none;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    border: 0;
    outline: 0;
    padding: 3px 8px;
    color: var(--text);
    background: transparent;
    font-family: var(--mono);
    font-size: var(--mono-size);
    line-height: var(--line-height);
    white-space: pre;
    tab-size: 2;
  }
  textarea.result-editor::placeholder { color: color-mix(in srgb, var(--muted) 80%, transparent); font-style: italic; }

  .syntax-keyword { color: #cc7832; }
  .syntax-string { color: #6a8759; }
  .syntax-comment { color: #808080; font-style: italic; }
  .syntax-number { color: #6897bb; }
  body.vscode-light .syntax-keyword { color: #0033b3; }
  body.vscode-light .syntax-string { color: #067d17; }
  body.vscode-light .syntax-comment { color: #8c8c8c; }
  body.vscode-light .syntax-number { color: #1750eb; }

  .base-panel {
    flex: 0 0 auto;
    display: none;
    max-height: 30vh;
    overflow: auto;
    border-top: 1px solid var(--border);
    background: var(--panel-2);
  }
  .base-panel.visible { display: block; }
  .base-panel header {
    position: sticky;
    top: 0;
    padding: 5px 12px;
    color: var(--purple);
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
  }
  .base-panel pre {
    margin: 0;
    padding: 6px 12px;
    white-space: pre;
    font-family: var(--mono);
    font-size: var(--mono-size);
    line-height: var(--line-height);
  }

  /* ---- bottom button bar ---- */
  .footer-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 16px;
    padding: 10px 14px;
    background: var(--panel);
    border-top: 1px solid var(--border);
  }
  .status { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 14px; min-width: 0; font-size: 12px; color: var(--muted); }
  .status .ready { color: var(--vscode-testing-iconPassed, var(--green)); font-weight: 600; }
  .status .warning { color: var(--vscode-editorWarning-foreground, #d9a343); }
  .footer-actions { display: flex; gap: 8px; margin-left: auto; }
  .progress { flex: 0 0 100%; height: 3px; margin: -10px -14px 0; order: -1; background: transparent; }
  .progress span { display: block; width: 0; height: 100%; border-radius: 0 3px 3px 0; background: var(--green); transition: width 220ms ease; }


  /* ================= visual polish v2: depth, gradients, motion ================= */
  :root { --ease: cubic-bezier(0.2, 0.8, 0.2, 1); --radius: 14px; --radius-sm: 8px; }
  body {
    background:
      radial-gradient(900px 340px at 12% -8%, color-mix(in srgb, var(--blue) 16%, transparent), transparent 70%),
      radial-gradient(900px 340px at 88% -8%, color-mix(in srgb, var(--green) 14%, transparent), transparent 70%),
      var(--bg);
    animation: gwp-fade 260ms var(--ease) both;
  }
  .titlebar, .merge-toolbar, .footer-bar {
    background: color-mix(in srgb, var(--panel) 82%, transparent);
    backdrop-filter: blur(10px);
  }
  .titlebar strong {
    font-size: 14px;
    letter-spacing: .02em;
    background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 70%, var(--text)), var(--text) 45%, color-mix(in srgb, var(--green) 70%, var(--text)));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28); }
  button:active:not(:disabled) { transform: translateY(0) scale(0.97); box-shadow: none; }
  button.primary {
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--purple)));
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  button.primary:disabled { filter: grayscale(.5); }
  button.primary.ready { animation: gwp-ready 2.2s ease-in-out infinite; }
  #acceptAllCurrentButton:hover:not(:disabled) { background: color-mix(in srgb, var(--blue) 24%, var(--panel)); }
  #acceptAllIncomingButton:hover:not(:disabled) { background: color-mix(in srgb, var(--green) 24%, var(--panel)); }
  select { transition: border-color 140ms, box-shadow 140ms; }
  select:hover { border-color: color-mix(in srgb, var(--accent) 70%, var(--border)); }

  .workspace { padding: 14px 16px; }
  .editor-scroll {
    border-radius: 16px;
    border-color: color-mix(in srgb, var(--text) 16%, transparent);
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.35), inset 0 1px 0 color-mix(in srgb, var(--text) 8%, transparent);
  }
  .column-headers {
    background: color-mix(in srgb, var(--panel) 88%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 0;
    box-shadow: 0 6px 14px -8px rgba(0, 0, 0, 0.5);
  }
  .column-headers { padding: 0 11px; }
  .column-header { padding: 11px 14px; }
  .column-header.left { box-shadow: inset 0 3px 0 var(--blue); background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 16%, transparent), transparent); }
  .column-header.right { box-shadow: inset 0 3px 0 var(--green); background: linear-gradient(180deg, color-mix(in srgb, var(--green) 16%, transparent), transparent); }
  .column-header.result { box-shadow: inset 0 3px 0 var(--purple); background: linear-gradient(180deg, color-mix(in srgb, var(--purple) 14%, transparent), transparent); }
  .column-header small { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--text) 9%, transparent); }
  .column-header.left::before, .column-header.right::before { box-shadow: 0 0 8px currentColor; }

  .merge-grid { padding: 10px; }
  .conflict-row {
    margin: 12px 0;
    border-radius: var(--radius);
    border: 1px solid color-mix(in srgb, var(--state) 60%, transparent);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28), 0 0 0 0 transparent;
    animation: gwp-rise 380ms var(--ease) both;
    animation-delay: calc(var(--i, 0) * 70ms);
  }
  .conflict-row.active {
    box-shadow: 0 0 0 1px var(--state), 0 8px 26px color-mix(in srgb, var(--state) 35%, transparent);
  }
  .conflict-row .pane.left .pane-body { background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 22%, transparent), color-mix(in srgb, var(--blue) 10%, transparent)); }
  .conflict-row .pane.right .pane-body { background: linear-gradient(180deg, color-mix(in srgb, var(--green) 22%, transparent), color-mix(in srgb, var(--green) 10%, transparent)); }
  .pane.left .pane-head { background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 40%, var(--bg)), color-mix(in srgb, var(--blue) 18%, var(--bg))); }
  .pane.right .pane-head { background: linear-gradient(90deg, color-mix(in srgb, var(--green) 18%, var(--bg)), color-mix(in srgb, var(--green) 40%, var(--bg))); }
  .result-head { background: linear-gradient(90deg, color-mix(in srgb, var(--state) 22%, var(--bg)), color-mix(in srgb, var(--text) 6%, var(--bg))); }
  .pane-head { font-weight: 600; letter-spacing: .03em; text-transform: uppercase; font-size: 10px; }
  .result-head .label { text-transform: none; font-size: 12px; letter-spacing: 0; }
  .badge {
    color: #fff;
    background: linear-gradient(135deg, var(--state), color-mix(in srgb, var(--state) 60%, #000));
    box-shadow: 0 1px 6px color-mix(in srgb, var(--state) 55%, transparent);
    text-transform: none;
    letter-spacing: 0;
    animation: gwp-pop 260ms var(--ease) both;
  }
  .result-actions button { background: color-mix(in srgb, var(--text) 8%, transparent); margin-left: 3px; }
  .result-actions button:hover:not(:disabled) { background: color-mix(in srgb, var(--state) 30%, transparent); }
  .result-cell.flash .result-edit-wrap { animation: gwp-flash 700ms ease-out; }

  /* curved ribbons */
  .conflict-row .action-gutter::before { display: none; }
  .action-gutter { background: color-mix(in srgb, var(--text) 3%, var(--bg)); }
  .ribbon { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .ribbon path { stroke-width: 1.2; vector-effect: non-scaling-stroke; }
  .gutter-left .ribbon path { fill: color-mix(in srgb, var(--blue) 34%, transparent); stroke: color-mix(in srgb, var(--blue) 70%, transparent); }
  .gutter-right .ribbon path { fill: color-mix(in srgb, var(--green) 34%, transparent); stroke: color-mix(in srgb, var(--green) 70%, transparent); }
  .hunk-action { transition: transform 120ms, background 140ms, box-shadow 140ms; }
  .hunk-action:hover:not(:disabled) { transform: scale(1.18); background: color-mix(in srgb, var(--text) 30%, transparent); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
  .gutter-left .hunk-action:first-child { background: color-mix(in srgb, var(--blue) 45%, transparent); color: #fff; }
  .gutter-right .hunk-action:first-child { background: color-mix(in srgb, var(--green) 45%, transparent); color: #fff; }
  .gutter-left .hunk-action:first-child:hover:not(:disabled) { background: var(--blue); }
  .gutter-right .hunk-action:first-child:hover:not(:disabled) { background: var(--green); }

  .footer-bar { padding: 12px 18px; }
  .status > span:first-child {
    padding: 2px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
    background: color-mix(in srgb, currentColor 12%, transparent);
    font-weight: 600;
  }
  .progress { height: 3px; background: color-mix(in srgb, var(--text) 8%, transparent); }
  .progress span {
    background: linear-gradient(90deg, var(--blue), var(--green));
    box-shadow: 0 0 10px color-mix(in srgb, var(--green) 70%, transparent);
  }

  /* ================= glass v3: blurred translucent pills and rings ================= */
  button {
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
    background: color-mix(in srgb, var(--text) 8%, transparent);
    backdrop-filter: blur(8px) saturate(1.3);
    box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent);
  }
  button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 16%, transparent);
    border-color: color-mix(in srgb, var(--text) 38%, transparent);
    box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent), 0 4px 14px rgba(0, 0, 0, 0.3);
  }
  /* resolve-all: separate pills, not a joined group */
  .tool-group:has(.accept-button) { gap: 8px; }
  .accept-button, .accept-button:first-child, .accept-button:last-child { border-radius: 999px; margin-left: 0; padding: 2px 16px; }
  #acceptAllCurrentButton, #acceptAllIncomingButton {
    font-weight: 600;
  }
  #acceptAllCurrentButton {
    color: color-mix(in srgb, var(--blue) 55%, #fff);
    border-color: color-mix(in srgb, var(--blue) 70%, transparent);
    background: color-mix(in srgb, var(--blue) 20%, transparent);
    box-shadow: inset 0 0 14px color-mix(in srgb, var(--blue) 22%, transparent), 0 0 12px color-mix(in srgb, var(--blue) 22%, transparent);
  }
  #acceptAllIncomingButton {
    color: color-mix(in srgb, var(--green) 55%, #fff);
    border-color: color-mix(in srgb, var(--green) 70%, transparent);
    background: color-mix(in srgb, var(--green) 20%, transparent);
    box-shadow: inset 0 0 14px color-mix(in srgb, var(--green) 22%, transparent), 0 0 12px color-mix(in srgb, var(--green) 22%, transparent);
  }
  #acceptAllBothButton { border-color: transparent; background: transparent; box-shadow: none; backdrop-filter: none; }
  #acceptAllBothButton:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 12%, transparent); }
  #acceptAllCurrentButton:hover:not(:disabled) {
    background: color-mix(in srgb, var(--blue) 34%, transparent);
    box-shadow: inset 0 0 16px color-mix(in srgb, var(--blue) 32%, transparent), 0 0 18px color-mix(in srgb, var(--blue) 40%, transparent);
  }
  #acceptAllIncomingButton:hover:not(:disabled) {
    background: color-mix(in srgb, var(--green) 34%, transparent);
    box-shadow: inset 0 0 16px color-mix(in srgb, var(--green) 32%, transparent), 0 0 18px color-mix(in srgb, var(--green) 40%, transparent);
  }
  .tool-group button.flat, .merge-toolbar button.flat { border-radius: 50%; }

  /* primary: glass blue with glow */
  button.primary {
    color: color-mix(in srgb, var(--blue) 40%, #fff);
    border-color: color-mix(in srgb, var(--blue) 75%, transparent);
    background: color-mix(in srgb, var(--blue) 26%, transparent);
    box-shadow: inset 0 0 16px color-mix(in srgb, var(--blue) 25%, transparent), 0 0 16px color-mix(in srgb, var(--blue) 28%, transparent);
  }
  button.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--blue) 40%, transparent);
    box-shadow: inset 0 0 18px color-mix(in srgb, var(--blue) 35%, transparent), 0 0 24px color-mix(in srgb, var(--blue) 45%, transparent);
  }
  button.primary:disabled { filter: none; opacity: .5; box-shadow: none; }
  button.primary.ready {
    color: color-mix(in srgb, var(--green) 45%, #fff);
    border-color: color-mix(in srgb, var(--green) 75%, transparent);
    background: color-mix(in srgb, var(--green) 26%, transparent);
  }

  /* gutter: round glass rings */
  .hunk-action {
    width: 30px;
    height: 30px;
    font-size: 17px;
    backdrop-filter: blur(6px);
  }
  .hunk-action.reject { width: 24px; height: 24px; font-size: 13px; }
  .gutter-left .hunk-action:first-child,
  .gutter-right .hunk-action:first-child { font-weight: 700; }
  .gutter-left .hunk-action:first-child {
    color: color-mix(in srgb, var(--blue) 50%, #fff);
    background: color-mix(in srgb, var(--blue) 22%, transparent);
    border: 1px solid color-mix(in srgb, var(--blue) 75%, transparent);
    box-shadow: inset 0 0 10px color-mix(in srgb, var(--blue) 30%, transparent), 0 0 12px color-mix(in srgb, var(--blue) 30%, transparent);
  }
  .gutter-right .hunk-action:first-child {
    color: color-mix(in srgb, var(--green) 50%, #fff);
    background: color-mix(in srgb, var(--green) 22%, transparent);
    border: 1px solid color-mix(in srgb, var(--green) 75%, transparent);
    box-shadow: inset 0 0 10px color-mix(in srgb, var(--green) 30%, transparent), 0 0 12px color-mix(in srgb, var(--green) 30%, transparent);
  }
  .gutter-left .hunk-action:first-child:hover:not(:disabled) {
    background: color-mix(in srgb, var(--blue) 40%, transparent);
    box-shadow: inset 0 0 12px color-mix(in srgb, var(--blue) 40%, transparent), 0 0 20px color-mix(in srgb, var(--blue) 55%, transparent);
  }
  .gutter-right .hunk-action:first-child:hover:not(:disabled) {
    background: color-mix(in srgb, var(--green) 40%, transparent);
    box-shadow: inset 0 0 12px color-mix(in srgb, var(--green) 40%, transparent), 0 0 20px color-mix(in srgb, var(--green) 55%, transparent);
  }
  .hunk-action.reject { border: 1px solid transparent; background: transparent; box-shadow: none; backdrop-filter: none; }
  .hunk-action.reject:hover:not(:disabled) { color: var(--red); background: color-mix(in srgb, var(--red) 18%, transparent); border-color: color-mix(in srgb, var(--red) 50%, transparent); }

  /* badge + result actions: glass */
  .badge {
    color: color-mix(in srgb, var(--state) 45%, #fff);
    background: color-mix(in srgb, var(--state) 22%, transparent);
    border: 1px solid color-mix(in srgb, var(--state) 70%, transparent);
    box-shadow: inset 0 0 8px color-mix(in srgb, var(--state) 25%, transparent), 0 0 10px color-mix(in srgb, var(--state) 25%, transparent);
    backdrop-filter: blur(6px);
  }
  .result-actions button {
    border-color: color-mix(in srgb, var(--text) 18%, transparent);
    background: color-mix(in srgb, var(--text) 7%, transparent);
    box-shadow: none;
  }
  .result-actions button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--state) 70%, transparent);
    background: color-mix(in srgb, var(--state) 26%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--state) 35%, transparent);
  }
  select { border-radius: 999px; padding: 1px 12px; background: color-mix(in srgb, var(--text) 8%, transparent); backdrop-filter: blur(8px); }
  .column-header small { border: 1px solid color-mix(in srgb, var(--text) 16%, transparent); backdrop-filter: blur(6px); }

  /* ================= bleed v4: colour diffuses across columns, no hard ribbons/borders ================= */
  .ribbon { display: none; }
  .conflict-row {
    border: 1px solid color-mix(in srgb, var(--state) 28%, transparent);
    background:
      radial-gradient(520px 120px at 0% 0%, color-mix(in srgb, var(--blue) 18%, transparent), transparent 70%),
      radial-gradient(520px 120px at 100% 0%, color-mix(in srgb, var(--green) 18%, transparent), transparent 70%),
      var(--bg);
  }
  .panes > .result-cell { border-left: 0; border-right: 0; }
  .conflict-row .action-gutter { background: transparent; }
  .conflict-row .gutter-left { background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 16%, transparent), transparent); }
  .conflict-row .gutter-right { background: linear-gradient(270deg, color-mix(in srgb, var(--green) 16%, transparent), transparent); }
  .conflict-row .pane.left .pane-body { background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 20%, transparent), color-mix(in srgb, var(--blue) 16%, transparent)); }
  .conflict-row .pane.right .pane-body { background: linear-gradient(90deg, color-mix(in srgb, var(--green) 16%, transparent), color-mix(in srgb, var(--green) 20%, transparent)); }
  .conflict-row .pane.left .pane-head { background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 34%, transparent), color-mix(in srgb, var(--blue) 12%, transparent)); border-bottom-color: transparent; }
  .conflict-row .pane.right .pane-head { background: linear-gradient(90deg, color-mix(in srgb, var(--green) 12%, transparent), color-mix(in srgb, var(--green) 34%, transparent)); border-bottom-color: transparent; }
  .conflict-row .result-head { background: linear-gradient(90deg, color-mix(in srgb, var(--state) 14%, transparent), color-mix(in srgb, var(--state) 26%, transparent) 50%, color-mix(in srgb, var(--state) 14%, transparent)); border-bottom-color: transparent; }
  .conflict-row .line-numbers { background: transparent; border-right-color: transparent; }
  .conflict-row .result-cell .result-edit-wrap { background: radial-gradient(420px 90px at 50% 0%, color-mix(in srgb, var(--state) 22%, transparent), color-mix(in srgb, var(--state) 8%, transparent) 75%); }
  .conflict-row .result-cell.choice-both .result-edit-wrap { background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 18%, transparent), color-mix(in srgb, var(--green) 18%, transparent)); }
  .conflict-row.active { box-shadow: 0 8px 30px color-mix(in srgb, var(--state) 28%, transparent), 0 0 0 1px color-mix(in srgb, var(--state) 45%, transparent); }
  .context-panes .action-gutter { background: transparent; }
  .context-panes .line-numbers { background: transparent; border-right-color: transparent; }
  .context-panes .result-cell { border: 0; }
  .column-header.result { border-left: 0; border-right: 0; }
  @keyframes gwp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @keyframes gwp-pop { from { transform: scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes gwp-flash { 0% { box-shadow: inset 0 0 0 100px color-mix(in srgb, var(--state, var(--green)) 35%, transparent); } 100% { box-shadow: inset 0 0 0 100px transparent; } }
  @keyframes gwp-ready {
    0%, 100% { box-shadow: 0 2px 8px color-mix(in srgb, var(--green) 40%, transparent), 0 0 0 0 color-mix(in srgb, var(--green) 55%, transparent); }
    50% { box-shadow: 0 2px 14px color-mix(in srgb, var(--green) 60%, transparent), 0 0 0 6px transparent; }
  }

  @media (max-width: 760px) {
    .toolbar-label, .operation-meta { display: none; }
    .footer-actions { width: 100%; justify-content: flex-end; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
  }
</style>
</head>
<body>
<div class="titlebar"><strong id="mergeTitle"></strong></div>
<div class="merge-toolbar">
  <span class="toolbar-label">${escapeHtml(tr("Resolve all conflicts:"))}</span>
  <div class="tool-group">
    <button class="accept-button" id="acceptAllCurrentButton" title="${escapeHtml(tr("Accept every current-side conflict"))}">≫ ${escapeHtml(tr("Left"))}</button>
    <button class="accept-button" id="acceptAllBothButton" title="${escapeHtml(tr("Accept both sides for every conflict"))}">≫≪ ${escapeHtml(tr("All"))}</button>
    <button class="accept-button" id="acceptAllIncomingButton" title="${escapeHtml(tr("Accept every incoming-side conflict"))}">≪ ${escapeHtml(tr("Right"))}</button>
  </div>
  <span class="toolbar-sep"></span>
  <div class="tool-group">
    <button class="flat" id="previousButton" title="${escapeHtml(tr("Previous conflict"))}">↑</button>
    <button class="flat" id="nextButton" title="${escapeHtml(tr("Next conflict"))}">↓</button>
  </div>
  <span class="toolbar-sep"></span>
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
</div>
<main class="workspace">
  <div class="editor-scroll" id="editorScroll">
    <div class="merge-surface">
      <div class="column-headers">
        <div class="column-header left"><span id="currentTitle"></span><small>${escapeHtml(tr("Read-only"))}</small></div>
        <div class="header-gutter"></div>
        <div class="column-header result"><span>${escapeHtml(tr("Result"))}</span><small>${escapeHtml(tr("Editable"))}</small></div>
        <div class="header-gutter"></div>
        <div class="column-header right"><span id="incomingTitle"></span><small>${escapeHtml(tr("Read-only"))}</small></div>
      </div>
      <div class="merge-grid" id="mergeGrid"></div>
    </div>
  </div>
</main>
<section class="base-panel" id="basePanel">
  <header>${escapeHtml(tr("Base revision"))}</header>
  <pre id="baseContent"></pre>
</section>
<footer class="footer-bar">
  <div class="progress"><span id="progressBar"></span></div>
  <div class="status">
    <span id="conflictStatus"></span>
    <span id="selectionStatus"></span>
    <span id="fileStatus"></span>
  </div>
  <div class="footer-actions">
    <button class="primary" id="saveButton">${escapeHtml(tr("Apply"))}</button>
    <button id="cancelButton" title="${escapeHtml(tr("Close without applying"))}">${escapeHtml(tr("Cancel"))}</button>
  </div>
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
  "Details",
  "Unresolved",
  "Edited manually",
  "Unchanged lines",
  "Resolve all conflicts:",
  "Read-only",
  "Editable",
  "Result",
  "Cancel"
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
    tr('Current') + ' · ' + currentLabel();
  document.getElementById('incomingTitle').textContent =
    tr('Incoming') + ' · ' + incomingLabel();

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

  function createCodeCell(side, value, otherValue, startLine, isConflict, exists = true, withHead = true) {
    const pane = document.createElement('section');
    pane.className = 'pane ' + side;
    const head = document.createElement('div');
    head.className = 'pane-head';
    const where = document.createElement('span');
    where.className = 'where';
    where.textContent = side === 'left' ? tr('Current') : tr('Incoming');
    head.appendChild(where);
    if (withHead) {
      pane.appendChild(head);
    }

    const body = document.createElement('div');
    body.className = 'pane-body';
    pane.appendChild(body);
    if (!exists) {
      pane.classList.add('deleted');
      const deleted = document.createElement('div');
      deleted.className = 'empty-side';
      deleted.textContent = '<' + tr('Deleted in {side}', {
        side: side === 'left' ? tr('Current') : tr('Incoming')
      }) + '>';
      body.appendChild(deleted);
      return pane;
    }

    const lines = splitLines(value);
    const numbers = document.createElement('div');
    numbers.className = 'line-numbers';
    numbers.textContent = lineNumbers(startLine, lines.length);
    const pre = document.createElement('pre');
    pre.className = 'code';
    renderCode(pre, value, otherValue, isConflict);
    body.appendChild(numbers);
    body.appendChild(pre);
    return pane;
  }

  function createGutter(side, conflictIndex, isConflict) {
    const gutter = document.createElement('div');
    gutter.className = 'action-gutter gutter-' + side;
    if (!isConflict) {
      return gutter;
    }
    if (side === 'left') {
      gutter.appendChild(actionButton('»', tr('Accept current change'), () => chooseConflict(conflictIndex, 'current'), 'hunk-action'));
      gutter.appendChild(actionButton('×', tr('Reject current change'), () => resetConflict(conflictIndex), 'hunk-action reject'));
    } else {
      gutter.appendChild(actionButton('«', tr('Accept incoming change'), () => chooseConflict(conflictIndex, 'incoming'), 'hunk-action'));
      gutter.appendChild(actionButton('×', tr('Reject incoming change'), () => resetConflict(conflictIndex), 'hunk-action reject'));
    }
    return gutter;
  }

  function actionButton(text, title, handler, extraClass = '') {
    const button = document.createElement('button');
    button.className = extraClass;
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', handler);
    return button;
  }

  function createResultCell(segment, conflictIndex, startLine, minLines, isConflict) {
    const cell = document.createElement('div');
    cell.className = 'result-cell ' + (isConflict ? 'unresolved' : 'context-cell');
    cell.dataset.conflictIndex = isConflict ? String(conflictIndex) : '';
    cell.style.minHeight = Math.max(1, minLines) * 20 + (isConflict ? 26 : 0) + 'px';

    if (isConflict) {
      const head = document.createElement('div');
      head.className = 'pane-head result-head';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = tr('Conflict {number}', { number: conflictIndex + 1 });
      const badge = document.createElement('span');
      badge.className = 'badge';
      const actions = document.createElement('div');
      actions.className = 'result-actions';
      if (segment.base !== undefined) {
        actions.appendChild(actionButton(tr('Base'), tr('Base'), () => chooseConflict(conflictIndex, 'base'), 'flat'));
      }
      actions.appendChild(actionButton(tr('Both'), tr('Both'), () => chooseConflict(conflictIndex, 'both'), 'flat'));
      actions.appendChild(actionButton(tr('Mark Resolved'), tr('Mark Resolved'), () => markManualResolved(conflictIndex), 'flat'));
      actions.appendChild(actionButton(tr('Reset'), tr('Reset'), () => resetConflict(conflictIndex), 'flat'));
      head.appendChild(label);
      head.appendChild(badge);
      head.appendChild(actions);
      cell.appendChild(head);
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
        const block = document.createElement('div');
        block.className = 'merge-row context-block';
        block.style.display = segment.text === '' ? 'none' : '';
        const contextPanes = document.createElement('div');
        contextPanes.className = 'panes context-panes';
        contextPanes.appendChild(createCodeCell('left', segment.text, segment.text, leftLine, false, true, false));
        contextPanes.appendChild(createGutter('left', -1, false));
        contextPanes.appendChild(createResultCell(segment, -1, resultLine, count, false));
        contextPanes.appendChild(createGutter('right', -1, false));
        contextPanes.appendChild(createCodeCell('right', segment.text, segment.text, rightLine, false, true, false));
        block.appendChild(contextPanes);
        mergeGrid.appendChild(block);
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
      const leftCell = createCodeCell('left', segment.ours, segment.theirs, leftLine, true, leftExists);
      const rightCell = createCodeCell('right', segment.theirs, segment.ours, rightLine, true, rightExists);
      const resultCell = createResultCell(segment, conflictIndex, resultLine, minLines, true);

      const card = document.createElement('article');
      card.className = 'merge-row conflict-row';
      card.style.setProperty('--i', String(conflictIndex));
      const panes = document.createElement('div');
      panes.className = 'panes';
      panes.appendChild(leftCell);
      panes.appendChild(createGutter('left', conflictIndex, true));
      panes.appendChild(resultCell);
      panes.appendChild(createGutter('right', conflictIndex, true));
      panes.appendChild(rightCell);
      card.appendChild(panes);
      mergeGrid.appendChild(card);

      const row = {
        index: conflictIndex,
        segment,
        card,
        badge: resultCell.querySelector('.badge'),
        leftCell: card,
        resultCell,
        rightCell,
        editor: resultEditors[resultEditors.length - 1],
        resolved: Boolean(segment.synthetic && !containsConflictMarkers(segment.initialResult || '')),
        choice: segment.synthetic ? 'manual' : null
      };
      conflictRows.push(row);
      applyResultState(row);
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
    row.resultCell.classList.remove('flash');
    void row.resultCell.offsetWidth;
    row.resultCell.classList.add('flash');
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
    for (const choice of ['current', 'incoming', 'both', 'base', 'manual']) {
      row.resultCell.classList.toggle('choice-' + choice, row.choice === choice);
      row.card.classList.toggle('state-' + choice, row.resolved && row.choice === choice);
    }
    const labels = {
      current: tr('Current'),
      incoming: tr('Incoming'),
      both: tr('Both'),
      base: tr('Base'),
      manual: tr('Edited manually')
    };
    row.badge.textContent = row.resolved ? '✓ ' + (labels[row.choice] || tr('Mark Resolved')) : tr('Unresolved');
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
      row.card.classList.toggle('active', row.index === activeConflictIndex);
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
    conflictRows[nextIndex].card.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
    saveButton.classList.toggle('ready', ready);
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
    document.getElementById('progressBar').style.width =
      (conflictRows.length === 0 ? 100 : Math.round((resolvedCount / conflictRows.length) * 100)) + '%';
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
