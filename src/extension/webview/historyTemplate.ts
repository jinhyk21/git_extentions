import type { Webview } from "vscode";
import { translate, type AppLanguage } from "../../shared/i18n";
import type { CommitGraph } from "../../shared/types/history";

export function getHistoryHtml(
  webview: Webview,
  repositoryName: string,
  graph: CommitGraph,
  language: AppLanguage = "en"
): string {
  const nonce = createNonce();
  const translations = Object.fromEntries(
    ["History", "Refresh", "No commits found.", "Commit details"].map((message) => [message, translate(language, message)])
  );
  const dataScript = JSON.stringify({ repositoryName, graph, translations });

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${translate(language, "History")}</title>
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
  header button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    padding: 4px 12px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
  }
  header button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  main {
    flex: 1 1 auto;
    overflow: auto;
  }
  #rows {
    display: block;
  }
  .commit-row {
    display: flex;
    align-items: stretch;
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .commit-row:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .commit-graph-cell {
    flex: 0 0 auto;
  }
  .commit-info {
    flex: 1 1 auto;
    min-width: 0;
    padding: 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: center;
  }
  .commit-subject {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .commit-meta {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .commit-hash {
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-descriptionForeground);
  }
  .ref-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    border: 1px solid var(--vscode-panel-border);
    white-space: nowrap;
  }
  .ref-badge.head {
    border-color: var(--vscode-gitDecoration-modifiedResourceForeground, currentColor);
    color: var(--vscode-gitDecoration-modifiedResourceForeground, currentColor);
  }
  .ref-badge.tag {
    border-color: var(--vscode-gitDecoration-addedResourceForeground, currentColor);
    color: var(--vscode-gitDecoration-addedResourceForeground, currentColor);
  }
  .ref-badge.remote {
    border-color: var(--vscode-descriptionForeground);
    color: var(--vscode-descriptionForeground);
  }
  .details-button {
    margin-left: auto;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    cursor: pointer;
    padding: 0 8px;
    font-size: 14px;
  }
  .details-button:hover { color: var(--vscode-foreground); }
  .empty-state {
    padding: 24px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
  }
</style>
</head>
<body>
<header>
  <h1 id="title"></h1>
  <button id="refreshButton">${translate(language, "Refresh")}</button>
</header>
<main>
  <div id="rows"></div>
</main>
<script nonce="${nonce}">
  const historyData = ${dataScript};
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
  const tr = (message) => historyData.translations[message] || message;
  document.getElementById('title').textContent = historyData.repositoryName + ' — ' + tr('History');

  const rowsRoot = document.getElementById('rows');
  const ROW_HEIGHT = 28;
  const COLUMN_WIDTH = 16;
  const NODE_RADIUS = 4;
  const LANE_COLORS = [
    'var(--vscode-charts-blue, #4a9eda)',
    'var(--vscode-charts-green, #59a869)',
    'var(--vscode-charts-orange, #d68c45)',
    'var(--vscode-charts-purple, #a672d6)',
    'var(--vscode-charts-red, #d9534f)',
    'var(--vscode-charts-yellow, #d6c145)'
  ];

  function laneColor(column) {
    return LANE_COLORS[column % LANE_COLORS.length];
  }

  function buildGraphSvg(columnCount) {
    const width = Math.max(columnCount * COLUMN_WIDTH, COLUMN_WIDTH);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(ROW_HEIGHT));
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + ROW_HEIGHT);
    svg.setAttribute('role', 'presentation');
    return svg;
  }

  function columnX(column) {
    return COLUMN_WIDTH * column + COLUMN_WIDTH / 2;
  }

  function renderRows() {
    rowsRoot.textContent = '';

    const nodes = historyData.graph.nodes;
    if (nodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = tr('No commits found.');
      rowsRoot.appendChild(empty);
      return;
    }

    const edgesByRow = new Map();
    for (const edge of historyData.graph.edges) {
      const spanStart = Math.min(edge.fromRow, edge.toRow);
      const spanEnd = Math.max(edge.fromRow, edge.toRow);
      for (let row = spanStart; row < spanEnd; row += 1) {
        const list = edgesByRow.get(row) || [];
        list.push(edge);
        edgesByRow.set(row, list);
      }
    }

    nodes.forEach((node, row) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'commit-row';
      rowElement.dataset.hash = node.commit.hash;

      const graphCell = document.createElement('div');
      graphCell.className = 'commit-graph-cell';
      const svg = buildGraphSvg(historyData.graph.columnCount);

      const passingEdges = edgesByRow.get(row) || [];
      for (const edge of passingEdges) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const isTopHalf = edge.fromRow <= row;
        const fromColumn = isTopHalf ? edge.fromColumn : edge.toColumn;
        const toColumn = isTopHalf ? edge.toColumn : edge.fromColumn;
        line.setAttribute('x1', String(columnX(fromColumn)));
        line.setAttribute('x2', String(columnX(toColumn)));
        line.setAttribute('y1', isTopHalf ? '0' : String(ROW_HEIGHT));
        line.setAttribute('y2', isTopHalf ? String(ROW_HEIGHT) : '0');
        line.setAttribute('stroke', laneColor(Math.min(edge.fromColumn, edge.toColumn)));
        line.setAttribute('stroke-width', '1.5');
        svg.appendChild(line);
      }

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(columnX(node.column)));
      circle.setAttribute('cy', String(ROW_HEIGHT / 2));
      circle.setAttribute('r', String(NODE_RADIUS));
      circle.setAttribute('fill', laneColor(node.column));
      svg.appendChild(circle);

      graphCell.appendChild(svg);
      rowElement.appendChild(graphCell);

      const info = document.createElement('div');
      info.className = 'commit-info';

      const subjectLine = document.createElement('div');
      subjectLine.className = 'commit-subject';

      for (const ref of node.commit.refs) {
        const badge = document.createElement('span');
        badge.className = 'ref-badge' + (ref.isHead ? ' head' : ref.isTag ? ' tag' : ref.isRemote ? ' remote' : '');
        badge.textContent = ref.name;
        subjectLine.appendChild(badge);
      }

      const subjectText = document.createElement('span');
      subjectText.textContent = node.commit.subject;
      subjectLine.appendChild(subjectText);
      info.appendChild(subjectLine);

      const metaLine = document.createElement('div');
      metaLine.className = 'commit-meta';
      const hashSpan = document.createElement('span');
      hashSpan.className = 'commit-hash';
      hashSpan.textContent = node.commit.abbreviatedHash;
      metaLine.appendChild(hashSpan);
      metaLine.appendChild(document.createTextNode(' — ' + node.commit.authorName + ' — ' + formatDate(node.commit.authorDate)));
      info.appendChild(metaLine);

      rowElement.appendChild(info);

      const detailsButton = document.createElement('button');
      detailsButton.className = 'details-button';
      detailsButton.textContent = 'ⓘ';
      detailsButton.title = tr('Commit details');
      detailsButton.setAttribute('aria-label', tr('Commit details'));
      detailsButton.addEventListener('click', (event) => {
        event.stopPropagation();
        vscodeApi.postMessage({ type: 'showCommitDetails', hash: node.commit.hash });
      });
      rowElement.appendChild(detailsButton);

      rowElement.addEventListener('click', () => {
        vscodeApi.postMessage({
          type: 'openCommitDiff',
          hash: node.commit.hash,
          hasParent: node.commit.parentHashes.length > 0
        });
      });

      rowsRoot.appendChild(rowElement);
    });
  }

  function formatDate(isoDate) {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
      return isoDate;
    }
    return parsed.toLocaleString();
  }

  document.getElementById('refreshButton').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'refresh' });
  });

  renderRows();
  `;
}
