import type { Webview } from "vscode";
import type { ConflictSegment } from "../../core/git/parseConflictMarkers";

export function getConflictResolutionHtml(webview: Webview, filePath: string, segments: readonly ConflictSegment[]): string {
  const nonce = createNonce();
  const dataScript = JSON.stringify({ filePath, segments });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>Resolve Conflict</title>
<style>
  :root {
    color-scheme: light dark;
  }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
  }
  header h1 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }
  .toolbar button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 4px 12px;
    border-radius: 2px;
    cursor: pointer;
    margin-left: 8px;
    font-size: 12px;
  }
  .toolbar button:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .toolbar button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  main {
    flex: 1 1 auto;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .segment-context {
    white-space: pre;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    color: var(--vscode-descriptionForeground);
    padding: 2px 8px;
  }
  .conflict-block {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
  }
  .conflict-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .conflict-side {
    padding: 6px 8px;
    white-space: pre-wrap;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    border-right: 1px solid var(--vscode-panel-border);
  }
  .conflict-side.theirs {
    border-right: none;
  }
  .conflict-side.ours {
    background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground, #2090c0) 8%, transparent);
  }
  .conflict-side.theirs {
    background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground, #2fa72f) 8%, transparent);
  }
  .conflict-side-label {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    opacity: 0.75;
    margin-bottom: 4px;
    display: block;
  }
  .conflict-actions {
    display: flex;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorWidget-background);
  }
  .conflict-actions button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    padding: 3px 10px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 11px;
  }
  .conflict-actions button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .conflict-actions button.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .result-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 auto;
    min-height: 200px;
  }
  .result-section h2 {
    font-size: 12px;
    font-weight: 600;
    margin: 0;
    opacity: 0.85;
  }
  #result {
    flex: 1 1 auto;
    width: 100%;
    min-height: 200px;
    resize: vertical;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    padding: 8px;
    box-sizing: border-box;
  }
  .status-line {
    font-size: 11px;
    opacity: 0.7;
  }
</style>
</head>
<body>
<header>
  <h1 id="title"></h1>
  <div class="toolbar">
    <span class="status-line" id="remainingStatus"></span>
    <button class="secondary" id="cancelButton">Cancel</button>
    <button id="saveButton">Save &amp; Mark Resolved</button>
  </div>
</header>
<main id="segments"></main>
<div class="result-section" style="padding: 0 12px 12px;">
  <h2>Result</h2>
  <textarea id="result" spellcheck="false"></textarea>
</div>
<script nonce="${nonce}">
  const conflictData = ${dataScript};
  ${getClientScript()}
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

function getClientScript(): string {
  return `
  const vscodeApi = acquireVsCodeApi();
  document.getElementById('title').textContent = conflictData.filePath;

  const segmentsRoot = document.getElementById('segments');
  const resultArea = document.getElementById('result');
  const remainingStatus = document.getElementById('remainingStatus');

  const choices = new Map();
  let conflictIndex = 0;

  function createTextBlock(tagName, text, className) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    return element;
  }

  function renderSegments() {
    segmentsRoot.textContent = '';
    conflictIndex = 0;

    for (const segment of conflictData.segments) {
      if (segment.kind === 'context') {
        if (segment.text.length > 0) {
          segmentsRoot.appendChild(createTextBlock('div', segment.text, 'segment-context'));
        }
        continue;
      }

      const currentIndex = conflictIndex;
      conflictIndex += 1;
      if (!choices.has(currentIndex)) {
        choices.set(currentIndex, 'ours');
      }

      const block = document.createElement('div');
      block.className = 'conflict-block';

      const columns = document.createElement('div');
      columns.className = 'conflict-columns';
      columns.appendChild(buildSide('ours', segment.oursLabel, segment.ours));
      columns.appendChild(buildSide('theirs', segment.theirsLabel, segment.theirs));
      block.appendChild(columns);

      const actions = document.createElement('div');
      actions.className = 'conflict-actions';
      actions.appendChild(buildActionButton(currentIndex, 'ours', 'Accept Current'));
      actions.appendChild(buildActionButton(currentIndex, 'theirs', 'Accept Incoming'));
      actions.appendChild(buildActionButton(currentIndex, 'both', 'Accept Both'));
      block.appendChild(actions);

      segmentsRoot.appendChild(block);
    }

    refreshActionStates();
  }

  function buildSide(kind, label, text) {
    const container = document.createElement('div');
    container.className = 'conflict-side ' + kind;
    container.appendChild(createTextBlock('span', label, 'conflict-side-label'));
    container.appendChild(createTextBlock('div', text, null));
    return container;
  }

  function buildActionButton(index, choice, label) {
    const button = document.createElement('button');
    button.textContent = label;
    button.dataset.index = String(index);
    button.dataset.choice = choice;
    button.addEventListener('click', () => {
      choices.set(index, choice);
      refreshActionStates();
      rebuildResult();
    });
    return button;
  }

  function refreshActionStates() {
    const buttons = segmentsRoot.querySelectorAll('.conflict-actions button');
    let resolvedCount = 0;
    for (const button of buttons) {
      const index = Number(button.dataset.index);
      const isActive = choices.get(index) === button.dataset.choice;
      button.classList.toggle('active', isActive);
    }
    for (const value of choices.values()) {
      if (value) {
        resolvedCount += 1;
      }
    }
    remainingStatus.textContent = resolvedCount + ' / ' + choices.size + ' conflicts resolved';
  }

  function rebuildResult() {
    const lines = [];
    let index = 0;
    for (const segment of conflictData.segments) {
      if (segment.kind === 'context') {
        if (segment.text.length > 0) {
          lines.push(segment.text);
        }
        continue;
      }

      const choice = choices.get(index);
      index += 1;

      if (choice === 'ours') {
        if (segment.ours.length > 0) {
          lines.push(segment.ours);
        }
      } else if (choice === 'theirs') {
        if (segment.theirs.length > 0) {
          lines.push(segment.theirs);
        }
      } else if (choice === 'both') {
        if (segment.ours.length > 0) {
          lines.push(segment.ours);
        }
        if (segment.theirs.length > 0) {
          lines.push(segment.theirs);
        }
      }
    }
    resultArea.value = lines.join('\\n');
  }

  document.getElementById('saveButton').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'save', content: resultArea.value });
  });

  document.getElementById('cancelButton').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'cancel' });
  });

  renderSegments();
  rebuildResult();
  `;
}
