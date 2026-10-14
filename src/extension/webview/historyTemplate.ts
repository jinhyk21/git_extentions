import type { Webview } from "vscode";
import { translate, type AppLanguage } from "../../shared/i18n";
import type { CommitGraph } from "../../shared/types/history";

export const HISTORY_MESSAGES = [
  "History",
  "Refresh",
  "No commits found.",
  "Commit details",
  "Search commits (message, author, hash, branch)…",
  "Load more commits",
  "{count} commits",
  "{shown} of {count} commits",
  "Copy hash",
  "Copied {hash}",
  "No matching commits."
] as const;

export type HistoryOptions = {
  /** True when the log hit the configured limit, so older commits may exist. */
  readonly hasMore?: boolean;
};

export function getHistoryHtml(
  webview: Webview,
  repositoryName: string,
  graph: CommitGraph,
  language: AppLanguage = "en",
  options: HistoryOptions = {}
): string {
  const nonce = createNonce();
  const translations = Object.fromEntries(HISTORY_MESSAGES.map((message) => [message, translate(language, message)]));
  // "<" is escaped so commit subjects can never close the script tag.
  const dataScript = JSON.stringify({
    repositoryName,
    graph,
    translations,
    language,
    hasMore: options.hasMore === true
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>${translate(language, "History")}</title>
<style>
  :root {
    color-scheme: light dark;
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.25)));
    --hover: var(--vscode-list-hoverBackground);
    --muted: var(--vscode-descriptionForeground);
  }
  * { box-sizing: border-box; }
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
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    background: var(--vscode-editor-background);
    z-index: 2;
  }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; white-space: nowrap; }
  .count { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .search { position: relative; flex: 1; max-width: 520px; margin-left: auto; }
  .search input {
    width: 100%; height: 28px; padding: 0 28px 0 10px; border-radius: 6px;
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    transition: box-shadow 160ms var(--ease);
  }
  .search input:focus { outline: none; box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
  .search button {
    position: absolute; right: 4px; top: 4px; width: 20px; height: 20px; border-radius: 4px;
    background: none; border: none; color: var(--muted); cursor: pointer; display: none;
  }
  .search button:hover { background: var(--hover); }
  .search.has-value button { display: block; }
  header button.action {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    transition: transform 90ms, filter 160ms;
  }
  header button.action:hover { filter: brightness(1.12); }
  header button.action:active { transform: scale(0.96); }
  main { flex: 1 1 auto; overflow: auto; position: relative; }
  #rows { display: block; padding-bottom: 12px; }

  .commit-row {
    display: flex;
    align-items: stretch;
    cursor: pointer;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    position: relative;
    transition: background 120ms;
  }
  .commit-row:hover, .commit-row:focus-visible { background: var(--hover); outline: none; }
  .commit-row:focus-visible { box-shadow: inset 2px 0 0 var(--vscode-focusBorder); }
  .commit-row.enter { animation: row-in 260ms var(--ease) both; animation-delay: calc(var(--i, 0) * 12ms); }
  .commit-graph-cell { flex: 0 0 auto; padding-left: 8px; }
  .filtering .commit-graph-cell { display: none; }
  .avatar {
    flex: 0 0 auto; align-self: center; width: 22px; height: 22px; border-radius: 50%; margin: 0 8px 0 4px;
    display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff;
  }
  .commit-info { flex: 1 1 auto; min-width: 0; padding: 6px 8px 6px 0; display: flex; flex-direction: column; gap: 2px; justify-content: center; }
  .commit-subject { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
  .commit-subject .text { overflow: hidden; text-overflow: ellipsis; }
  .commit-meta { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .commit-hash {
    font-family: var(--vscode-editor-font-family, monospace); color: var(--muted); cursor: copy; border-radius: 3px; padding: 0 2px;
  }
  .commit-hash:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2)); color: var(--vscode-foreground); }
  .ref-badge { font-size: 10px; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--border); white-space: nowrap; flex: 0 0 auto; }
  .ref-badge.head { border-color: var(--vscode-gitDecoration-modifiedResourceForeground, currentColor); color: var(--vscode-gitDecoration-modifiedResourceForeground, currentColor); background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground, currentColor) 14%, transparent); font-weight: 600; }
  .ref-badge.tag { border-color: var(--vscode-gitDecoration-addedResourceForeground, currentColor); color: var(--vscode-gitDecoration-addedResourceForeground, currentColor); }
  .ref-badge.remote { border-color: var(--muted); color: var(--muted); }
  .row-actions { display: flex; align-items: center; opacity: 0; transition: opacity 120ms; padding-right: 6px; }
  .commit-row:hover .row-actions, .commit-row:focus-within .row-actions { opacity: 1; }
  .details-button {
    background: transparent; color: var(--muted); border: none; cursor: pointer; padding: 2px 8px; font-size: 14px; border-radius: 4px;
  }
  .details-button:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2)); }
  mark { background: color-mix(in srgb, var(--vscode-editor-findMatchHighlightBackground, #ea5c0055) 100%, transparent); color: inherit; border-radius: 2px; }
  .more-wrap { padding: 12px; text-align: center; }
  .empty-state { padding: 32px; color: var(--muted); font-size: 13px; text-align: center; }
  #toast {
    position: fixed; bottom: 16px; left: 50%; transform: translate(-50%, 20px); opacity: 0; pointer-events: none;
    background: var(--vscode-editorWidget-background); border: 1px solid var(--border); border-radius: 8px; padding: 6px 14px; font-size: 12px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.35); transition: opacity 180ms, transform 180ms var(--ease);
  }
  #toast.show { opacity: 1; transform: translate(-50%, 0); }
  @keyframes row-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
</style>
</head>
<body>
<header>
  <h1 id="title"></h1>
  <span class="count" id="count"></span>
  <div class="search" id="searchBox">
    <input type="text" id="search" spellcheck="false" autocomplete="off" />
    <button id="clearSearch" aria-label="Clear">&#x2715;</button>
  </div>
  <button class="action" id="refreshButton">${translate(language, "Refresh")}</button>
</header>
<main id="scroller">
  <div id="rows" role="list"></div>
</main>
<div id="toast" role="status"></div>
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
  const tr = (message, values) => (historyData.translations[message] || message).replace(/\\{(\\w+)\\}/g, (m, k) => values && k in values ? String(values[k]) : m);
  document.getElementById('title').textContent = historyData.repositoryName + ' \\u2014 ' + tr('History');

  const rowsRoot = document.getElementById('rows');
  const scroller = document.getElementById('scroller');
  const searchInput = document.getElementById('search');
  const searchBox = document.getElementById('searchBox');
  const countEl = document.getElementById('count');
  const toastEl = document.getElementById('toast');
  const ROW_HEIGHT = 36;
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
  const AVATAR_COLORS = ['#4a9eda', '#59a869', '#d68c45', '#a672d6', '#d9534f', '#2f9e9e', '#c25d9a', '#7a8b3a'];
  const persisted = vscodeApi.getState() || {};
  let filter = typeof persisted.filter === 'string' ? persisted.filter : '';
  let firstRender = true;

  searchInput.placeholder = tr('Search commits (message, author, hash, branch)\\u2026');
  searchInput.setAttribute('aria-label', searchInput.placeholder);
  searchInput.value = filter;
  searchBox.classList.toggle('has-value', filter.length > 0);

  function laneColor(column) { return LANE_COLORS[column % LANE_COLORS.length]; }
  function columnX(column) { return COLUMN_WIDTH * column + COLUMN_WIDTH / 2; }

  function hashString(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  function initials(name) {
    const parts = name.trim().split(/\\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
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

  function formatRelative(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return isoDate;
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    const formatter = new Intl.RelativeTimeFormat(historyData.language === 'zh-cn' ? 'zh-CN' : historyData.language, { numeric: 'auto' });
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
    }
    return formatter.format(0, 'second');
  }

  function formatDate(isoDate) {
    const parsed = new Date(isoDate);
    return Number.isNaN(parsed.getTime()) ? isoDate : parsed.toLocaleString();
  }

  function highlight(text, query) {
    const fragment = document.createDocumentFragment();
    if (!query) { fragment.append(text); return fragment; }
    const lower = text.toLowerCase();
    let from = 0;
    for (;;) {
      const index = lower.indexOf(query, from);
      if (index < 0) break;
      fragment.append(text.slice(from, index));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(index, index + query.length);
      fragment.append(mark);
      from = index + query.length;
    }
    fragment.append(text.slice(from));
    return fragment;
  }

  function matches(commit, query) {
    if (!query) return true;
    return commit.subject.toLowerCase().includes(query)
      || commit.authorName.toLowerCase().includes(query)
      || commit.hash.toLowerCase().startsWith(query)
      || commit.refs.some((ref) => ref.name.toLowerCase().includes(query));
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  function renderRows() {
    rowsRoot.textContent = '';
    const query = filter.trim().toLowerCase();
    rowsRoot.parentElement.classList.toggle('filtering', query.length > 0);
    document.body.classList.toggle('filtering', query.length > 0);

    const nodes = historyData.graph.nodes;
    if (nodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = tr('No commits found.');
      rowsRoot.appendChild(empty);
      countEl.textContent = '';
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

    let shown = 0;
    nodes.forEach((node, row) => {
      if (!matches(node.commit, query)) return;
      const index = shown;
      shown += 1;

      const rowElement = document.createElement('div');
      rowElement.className = 'commit-row' + (firstRender && index < 40 ? ' enter' : '');
      rowElement.style.setProperty('--i', String(index));
      rowElement.dataset.hash = node.commit.hash;
      rowElement.tabIndex = 0;
      rowElement.setAttribute('role', 'listitem');

      const graphCell = document.createElement('div');
      graphCell.className = 'commit-graph-cell';
      const svg = buildGraphSvg(historyData.graph.columnCount);

      for (const edge of edgesByRow.get(row) || []) {
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

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.background = AVATAR_COLORS[hashString(node.commit.authorEmail || node.commit.authorName) % AVATAR_COLORS.length];
      avatar.textContent = initials(node.commit.authorName);
      avatar.title = node.commit.authorName + ' <' + node.commit.authorEmail + '>';
      rowElement.appendChild(avatar);

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
      subjectText.className = 'text';
      subjectText.appendChild(highlight(node.commit.subject, query));
      subjectLine.appendChild(subjectText);
      info.appendChild(subjectLine);

      const metaLine = document.createElement('div');
      metaLine.className = 'commit-meta';
      const hashSpan = document.createElement('span');
      hashSpan.className = 'commit-hash';
      hashSpan.textContent = node.commit.abbreviatedHash;
      hashSpan.title = tr('Copy hash');
      hashSpan.addEventListener('click', (event) => {
        event.stopPropagation();
        vscodeApi.postMessage({ type: 'copyHash', hash: node.commit.hash });
        showToast(tr('Copied {hash}', { hash: node.commit.abbreviatedHash }));
      });
      metaLine.appendChild(hashSpan);
      const when = document.createElement('span');
      when.title = formatDate(node.commit.authorDate);
      when.textContent = ' \\u2014 ';
      when.appendChild(highlight(node.commit.authorName, query));
      when.appendChild(document.createTextNode(' \\u2014 ' + formatRelative(node.commit.authorDate)));
      metaLine.appendChild(when);
      info.appendChild(metaLine);
      rowElement.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const detailsButton = document.createElement('button');
      detailsButton.className = 'details-button';
      detailsButton.textContent = '\\u24D8';
      detailsButton.title = tr('Commit details');
      detailsButton.setAttribute('aria-label', tr('Commit details'));
      detailsButton.addEventListener('click', (event) => {
        event.stopPropagation();
        vscodeApi.postMessage({ type: 'showCommitDetails', hash: node.commit.hash });
      });
      actions.appendChild(detailsButton);
      rowElement.appendChild(actions);

      const open = () => vscodeApi.postMessage({
        type: 'openCommitDiff',
        hash: node.commit.hash,
        hasParent: node.commit.parentHashes.length > 0
      });
      rowElement.addEventListener('click', open);
      rowElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); open(); }
        else if (event.key === 'i') { vscodeApi.postMessage({ type: 'showCommitDetails', hash: node.commit.hash }); }
        else if (event.key === 'c') { vscodeApi.postMessage({ type: 'copyHash', hash: node.commit.hash }); showToast(tr('Copied {hash}', { hash: node.commit.abbreviatedHash })); }
        else if (event.key === 'ArrowDown' && rowElement.nextElementSibling && rowElement.nextElementSibling.classList.contains('commit-row')) { event.preventDefault(); rowElement.nextElementSibling.focus(); }
        else if (event.key === 'ArrowUp' && rowElement.previousElementSibling) { event.preventDefault(); rowElement.previousElementSibling.focus(); }
      });

      rowsRoot.appendChild(rowElement);
    });

    countEl.textContent = query ? tr('{shown} of {count} commits', { shown, count: nodes.length }) : tr('{count} commits', { count: nodes.length });

    if (shown === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = tr('No matching commits.');
      rowsRoot.appendChild(empty);
    }

    if (historyData.hasMore) {
      const wrap = document.createElement('div');
      wrap.className = 'more-wrap';
      const button = document.createElement('button');
      button.className = 'action';
      button.textContent = tr('Load more commits');
      button.addEventListener('click', () => vscodeApi.postMessage({ type: 'loadMore' }));
      wrap.appendChild(button);
      rowsRoot.appendChild(wrap);
    }

    firstRender = false;
  }

  function setFilter(value) {
    filter = value;
    searchBox.classList.toggle('has-value', value.length > 0);
    vscodeApi.setState({ filter });
    renderRows();
  }

  searchInput.addEventListener('input', () => setFilter(searchInput.value));
  document.getElementById('clearSearch').addEventListener('click', () => { searchInput.value = ''; setFilter(''); searchInput.focus(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== searchInput) { event.preventDefault(); searchInput.focus(); searchInput.select(); }
    else if (event.key === 'Escape' && document.activeElement === searchInput) { searchInput.value = ''; setFilter(''); }
    else if (event.key === 'ArrowDown' && document.activeElement === searchInput) {
      const first = rowsRoot.querySelector('.commit-row');
      if (first) { event.preventDefault(); first.focus(); }
    }
  });
  document.getElementById('refreshButton').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'refresh' });
  });

  renderRows();
  `;
}
