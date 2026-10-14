/* Git Workspace Pro sidebar. Plain JS, no dependencies; talks to the extension via postMessage. */
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const boot = JSON.parse(document.getElementById("boot").textContent);
  const translations = boot.translations || {};
  const tr = (key, values) =>
    (translations[key] || key).replace(/\{(\w+)\}/g, (m, k) => (values && k in values ? String(values[k]) : m));

  const MAX_FILES_PER_GROUP = 150;
  const GROUPS = [
    { kind: "conflicted", label: "Conflicted" },
    { kind: "staged", label: "Staged" },
    { kind: "unstaged", label: "Unstaged" },
    { kind: "untracked", label: "Untracked" }
  ];

  /* ---------- persisted UI state ---------- */
  const saved = vscode.getState() || {};
  const ui = {
    expanded: new Set(saved.expanded || []),
    collapsedGroups: new Set(saved.collapsedGroups || []),
    showAllFiles: new Set(),
    drafts: saved.drafts || {},
    filter: saved.filter || ""
  };
  let state = boot.state;
  let busy = new Set(boot.busy || []);
  const selection = new Map(); // key -> {repo, path, kind}
  let anchor = null;
  let prevKeys = new Set();
  let prevCounts = new Map();
  let prevSummary = null;
  let lastSignature = "";
  let commonBranch = "";

  function persist() {
    vscode.setState({
      expanded: [...ui.expanded],
      collapsedGroups: [...ui.collapsedGroups],
      drafts: ui.drafts,
      filter: ui.filter
    });
  }

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "data") for (const [dk, dv] of Object.entries(value)) el.dataset[dk] = dv;
      else el.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  /** Drops null/false entries: DOM append() would otherwise render them as the text "null". */
  function kids(...items) {
    return items.flat().filter((item) => item !== null && item !== undefined && item !== false);
  }

  const ICONS = {
    chevron: ["M6 3l5 5-5 5"],
    refresh: ["M13 8a5 5 0 1 1-1.5-3.5", "M13 2.5V5h-2.5"],
    fetch: ["M8 2v8", "M5 7l3 3 3-3", "M3 13h10"],
    pull: ["M8 2v10", "M4.5 8.5L8 12l3.5-3.5"],
    push: ["M8 14V4", "M4.5 7.5L8 4l3.5 3.5"],
    commit: ["M3 8.5l3.2 3.2L13 5"],
    history: ["M8 4.5V8l2.5 1.5", "M2.5 8a5.5 5.5 0 1 0 1.8-4.1", "M2.5 2.5v2.8h2.8"],
    terminal: ["M2.5 3.5h11v9h-11z", "M5 6.5l2 1.5-2 1.5", "M8.5 10h2.5"],
    more: ["M3.5 8h.01", "M8 8h.01", "M12.5 8h.01"],
    plus: ["M8 3v10", "M3 8h10"],
    minus: ["M3 8h10"],
    discard: ["M3.5 6.5h6a3 3 0 0 1 0 6H6", "M6 3.5L3.2 6.5 6 9.5"],
    file: ["M4 2.5h5l3 3v8H4z", "M9 2.5v3h3"],
    diff: ["M5 3v10", "M3 5h4", "M11 3v10", "M9 11h4"],
    eye: ["M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z", "M8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z"],
    eyeOff: ["M2 2l12 12", "M6.6 4a6 6 0 0 1 1.4-.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.9 2.4", "M4 5.4A11 11 0 0 0 1.5 8S4 12.5 8 12.5c.9 0 1.7-.2 2.4-.6"],
    collapse: ["M4 6l4-3 4 3", "M4 10l4 3 4-3"],
    search: ["M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z", "M10.5 10.5L14 14"],
    close: ["M4 4l8 8", "M12 4l-8 8"],
    branch: ["M5 2.5v8", "M11 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", "M5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", "M11 5.5c0 3-6 2-6 5"],
    warning: ["M8 2.5l6 10.5H2z", "M8 6.5v3", "M8 11.3h.01"],
    check: ["M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M5.3 8.2l1.9 1.9 3.5-3.7"],
    stash: ["M2.5 4h11v3h-11z", "M3.5 7v6.5h9V7", "M6.5 10h3"],
    play: ["M5 3.5v9l7-4.5z"],
    skip: ["M4 3.5v9l6-4.5z", "M12 3.5v9"],
    stop: ["M4 4h8v8H4z"]
  };

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    for (const d of ICONS[name] || []) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }

  function iconButton(name, label, onClick, extraClass) {
    return h(
      "button",
      {
        class: "icon-btn" + (extraClass ? " " + extraClass : ""),
        title: label,
        "aria-label": label,
        onClick: (event) => {
          event.stopPropagation();
          onClick(event);
        }
      },
      icon(name)
    );
  }

  /* ---------- messaging ---------- */
  function run(command, repo, files) {
    vscode.postMessage({ type: "command", command, repo, files });
  }

  /* ---------- derived helpers ---------- */
  function repoStateClass(repo) {
    if (repo.error) return "error";
    if (repo.loading) return "loading";
    if (repo.counts.conflicted > 0) return "conflict";
    if (repo.counts.staged + repo.counts.unstaged + repo.counts.untracked > 0 || repo.operation) return "modified";
    if (repo.ahead > 0 || repo.behind > 0) return "sync";
    return "clean";
  }

  function operationLabel(op) {
    const names = { merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry Pick", revert: "Revert" };
    const name = tr(names[op.type] || op.type);
    return op.currentStep && op.totalSteps ? name + " " + op.currentStep + "/" + op.totalSteps : name;
  }

  function splitPath(path) {
    const index = path.lastIndexOf("/");
    return index < 0 ? { dir: "", name: path } : { dir: path.slice(0, index), name: path.slice(index + 1) };
  }

  function statusLetter(file) {
    if (file.kind === "untracked") return "U";
    if (file.kind === "conflicted") return "!";
    const code = file.kind === "staged" ? file.code[0] : file.code[1];
    return (code || "M").trim() || "M";
  }

  const fileKey = (repoId, file) => repoId + "\u0000" + file.path + "\u0000" + file.kind;

  /* ---------- filtering ---------- */
  function applyFilter(repos) {
    const query = ui.filter.trim().toLowerCase();
    if (!query) return repos.map((repo) => ({ repo, files: repo.files, children: applyFilter(repo.children), forced: false }));

    const result = [];
    for (const repo of repos) {
      const selfMatch = repo.name.toLowerCase().includes(query) || (repo.branch || "").toLowerCase().includes(query);
      const files = selfMatch ? repo.files : repo.files.filter((file) => file.path.toLowerCase().includes(query));
      const children = applyFilter(repo.children);
      if (selfMatch || files.length > 0 || children.length > 0) {
        result.push({ repo, files, children, forced: !selfMatch });
      }
    }
    return result;
  }

  /* ---------- rendering ---------- */
  const listEl = document.getElementById("list");
  const summaryEl = document.getElementById("summary");
  const selectionEl = document.getElementById("selection");
  const searchInput = document.getElementById("search");
  const cleanBtn = document.getElementById("toggleClean");
  const fetchAllBtn = document.getElementById("fetchAll");

  /** The branch most repositories are on; clean rows only repeat it when they differ. */
  function mostCommonBranch(repos) {
    const counts = new Map();
    const walk = (list) => list.forEach((repo) => {
      if (repo.branch) counts.set(repo.branch, (counts.get(repo.branch) || 0) + 1);
      walk(repo.children);
    });
    walk(repos);
    let best = "";
    let bestCount = 1;
    for (const [branch, count] of counts) if (count > bestCount) { best = branch; bestCount = count; }
    return best;
  }

  function renderRepoList(nodes, isChild, keys) {
    const out = [];
    const cleanNodes = nodes.filter((node) => !node.repo.needsAttention);
    const split = cleanNodes.length > 0 && cleanNodes.length < nodes.length;
    let labelled = false;
    for (const node of nodes) {
      if (split && !node.repo.needsAttention && !labelled) {
        out.push(h("div", { class: "section-label", text: tr("Clean repositories ({count})", { count: cleanNodes.length }) }));
        labelled = true;
      }
      out.push(renderRepo(node, isChild, keys));
    }
    return out;
  }

  function renderSummary() {
    const s = state.summary;
    const chips = [];
    chips.push(h("span", { class: "chip" }, tr("{count} repositories", { count: s.repositories })));
    if (s.changedFiles > 0) chips.push(h("span", { class: "chip modified" }, tr("{count} changed files", { count: s.changedFiles })));
    if (s.conflicts > 0) chips.push(h("span", { class: "chip conflict" }, icon("warning"), tr("{count} conflicts", { count: s.conflicts })));
    if (s.ahead > 0 || s.behind > 0) chips.push(h("span", { class: "chip sync" }, "↑" + s.ahead + " ↓" + s.behind));
    if (prevSummary && JSON.stringify(prevSummary) !== JSON.stringify(s)) chips.forEach((chip) => chip.classList.add("bump"));
    prevSummary = s;
    summaryEl.replaceChildren(...chips);
  }

  function render() {
    const signature = JSON.stringify([state, ui.filter, [...ui.expanded], [...ui.collapsedGroups], [...busy], [...selection.keys()], [...ui.showAllFiles]]);
    if (signature === lastSignature) return;
    lastSignature = signature;

    const scrollTop = window.scrollY;
    const focusedKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.nav : null;
    const typing = document.activeElement && document.activeElement.tagName === "TEXTAREA" ? document.activeElement : null;
    const typingState = typing ? { key: typing.dataset.draft, start: typing.selectionStart, end: typing.selectionEnd } : null;

    renderSummary();
    cleanBtn.hidden = state.cleanCount === 0 && !state.showClean;
    cleanBtn.classList.toggle("active", state.showClean);
    cleanBtn.replaceChildren(icon(state.showClean ? "eye" : "eyeOff"), tr("{count} clean", { count: state.cleanCount }));
    cleanBtn.title = state.showClean ? tr("Hide clean repositories") : tr("Show clean repositories");
    cleanBtn.setAttribute("aria-label", cleanBtn.title);
    commonBranch = mostCommonBranch(state.repositories);

    const nextKeys = new Set();
    const nodes = applyFilter(state.repositories);
    if (nodes.length === 0) {
      listEl.replaceChildren(renderEmpty());
    } else {
      listEl.replaceChildren(...renderRepoList(nodes, false, nextKeys));
    }

    prevKeys = nextKeys;
    renderSelectionBar();

    window.scrollTo(0, scrollTop);
    if (typingState) {
      const el = listEl.querySelector('textarea[data-draft="' + CSS.escape(typingState.key) + '"]');
      if (el) {
        el.focus();
        el.setSelectionRange(typingState.start, typingState.end);
      }
    } else if (focusedKey) {
      const el = listEl.querySelector('[data-nav="' + CSS.escape(focusedKey) + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  }

  function renderEmpty() {
    if (ui.filter.trim()) {
      return h("div", { class: "empty" }, h("span", { text: tr("No matches") }));
    }
    if (state.repositories.length === 0) {
      return h(
        "div",
        { class: "empty" },
        h("div", { class: "big" }, icon("check")),
        h("strong", { text: tr("All repositories are clean") }),
        h("span", { text: tr("Nothing needs your attention right now.") }),
        h("button", { class: "cta secondary", onClick: () => vscode.postMessage({ type: "setShowClean", value: true }) }, icon("eye"), tr("Show clean repositories"))
      );
    }
    return h("div", { class: "empty" }, h("span", { text: tr("No Git repositories found") }));
  }

  function enterClass(key, keys) {
    keys.add(key);
    return prevKeys.has(key) ? "" : " enter";
  }

  function renderRepo(node, isChild, keys) {
    const repo = node.repo;
    const open = ui.expanded.has(repo.id) || (ui.filter.trim() !== "" && node.forced);
    const stateClass = repoStateClass(repo);
    const changes = repo.counts.staged + repo.counts.unstaged + repo.counts.untracked + repo.counts.conflicted;
    const compact = !repo.needsAttention;
    const card = h("div", {
      class: "card" + (compact ? " compact" : "") + (isChild ? " child" : "") + (open ? " open" : "") + (busy.has(repo.id) ? " busy" : "") + enterClass("repo:" + repo.id, keys),
      data: { repo: repo.id }
    });

    const head = h("div", {
      class: "card-head",
      tabindex: "0",
      role: "treeitem",
      "aria-expanded": String(open),
      data: { nav: "repo:" + repo.id },
      title: repo.rootPath + (repo.error ? "\n" + repo.error : ""),
      onClick: () => toggleRepo(repo.id, card),
      onContextmenu: (event) => openMenu(event, repoMenu(repo))
    });
    head._owner = card;

    const badges = h("div", { class: "badges" });
    for (const kind of ["conflicted", "staged", "unstaged", "untracked"]) {
      const count = repo.counts[kind];
      if (count > 0) {
        const badge = h("span", { class: "badge " + kind, title: tr(kind === "conflicted" ? "Conflicted" : kind === "staged" ? "Staged" : kind === "unstaged" ? "Unstaged" : "Untracked") + ": " + count, text: String(count) });
        if (prevCounts.has(repo.id + kind) && prevCounts.get(repo.id + kind) !== count) badge.classList.add("bump");
        badges.append(badge);
      }
      prevCounts.set(repo.id + kind, count);
    }

    const showPush = repo.ahead > 0 && !repo.operation && repo.counts.conflicted === 0;
    const showPull = repo.behind > 0 && !repo.operation;
    const sync = [];
    if (repo.behind > 0 && !showPull) sync.push("↓" + repo.behind);
    if (repo.ahead > 0 && !showPush) sync.push("↑" + repo.ahead);

    head.append(
      ...kids(
      h("span", { class: "chevron" }, icon("chevron")),
      h("span", { class: "dot " + stateClass, title: repo.loading ? tr("Loading…") : repo.error ? tr("Status unavailable") : "" }),
      h("span", { class: "name", text: repo.name }),
      repo.branch && !(compact && repo.branch === commonBranch) ? h("span", { class: "branch", title: tr("Branch: {branch}", { branch: repo.branch }) }, icon("branch"), h("span", { class: "text", text: repo.branch })) : null,
      sync.length ? h("span", { class: "sync-badge", text: sync.join(" ") }) : null,
      h("span", { class: "head-spacer" }),
      badges
      )
    );

    // Contextual one-click calls to action
    if (repo.counts.conflicted > 0 && !repo.operation) {
      head.append(h("button", { class: "cta danger", title: tr("Resolve First Conflict"), onClick: (e) => { e.stopPropagation(); resolveFirstConflict(repo); } }, tr("Resolve")));
    }
    if (showPull) {
      head.append(h("button", { class: "cta secondary", title: tr("Pull"), onClick: (e) => { e.stopPropagation(); run("gitWorkspacePro.pull", repo.id); } }, icon("pull"), String(repo.behind)));
    }
    if (showPush) {
      head.append(h("button", { class: "cta", title: tr("Push"), onClick: (e) => { e.stopPropagation(); run("gitWorkspacePro.push", repo.id); } }, icon("push"), String(repo.ahead)));
    }

    head.append(
      h(
        "span",
        { class: "quick" },
        iconButton("fetch", tr("Fetch"), () => run("gitWorkspacePro.fetch", repo.id)),
        iconButton("history", tr("Show History"), () => run("gitWorkspacePro.showHistory", repo.id)),
        iconButton("terminal", tr("Run Command"), () => run("gitWorkspacePro.runCustomCommand", repo.id)),
        iconButton("more", tr("More actions"), () => run("gitWorkspacePro.showRepositoryActions", repo.id))
      )
    );

    card.append(head);

    const wrap = h("div", { class: "body-wrap" });
    const body = h("div", { class: "body" });
    wrap.append(body);
    card.append(wrap);
    if (open) fillRepoBody(body, node, card, changes, keys);
    card._node = node;
    return card;
  }

  function fillRepoBody(body, node, card, changes, keys) {
    const repo = node.repo;
    const inner = h("div", { class: "body-inner", role: "group" });

    if (repo.error) {
      inner.append(h("div", { class: "op-banner conflict" }, icon("warning"), h("span", { class: "label", text: tr("Status unavailable") + ": " + repo.error })));
    }

    if (repo.operation) {
      const conflicts = repo.counts.conflicted;
      const banner = h("div", { class: "op-banner" + (conflicts ? " conflict" : "") });
      banner.append(
        icon(conflicts ? "warning" : "play"),
        h("span", { class: "label", text: tr("{operation} in progress", { operation: operationLabel(repo.operation) }) + (conflicts ? " — " + tr(conflicts === 1 ? "{count} conflict" : "{count} conflicts", { count: conflicts }) : "") })
      );
      if (conflicts) banner.append(h("button", { class: "cta danger", onClick: () => resolveFirstConflict(repo) }, tr("Resolve")));
      banner.append(h("button", { class: "cta", disabled: conflicts > 0 ? "" : null, title: conflicts ? tr("Resolve and stage every conflicted file before continuing.") : tr("Continue"), onClick: () => run("gitWorkspacePro.continueOperation", repo.id) }, icon("play"), tr("Continue")));
      if (repo.operation.type !== "merge") banner.append(h("button", { class: "cta secondary", onClick: () => run("gitWorkspacePro.skipOperation", repo.id) }, icon("skip"), tr("Skip")));
      banner.append(h("button", { class: "cta secondary", onClick: () => run("gitWorkspacePro.abortOperation", repo.id) }, icon("stop"), tr("Abort")));
      inner.append(banner);
    }

    if (changes > 0 && repo.counts.conflicted === 0) inner.append(renderCommitBox(repo));

    for (const group of GROUPS) {
      const files = node.files.filter((file) => file.kind === group.kind);
      if (files.length === 0) continue;
      inner.append(renderGroup(repo, group, files, keys));
    }

    inner.append(...renderRepoList(node.children, true, keys));
    body.append(inner);
  }

  function renderCommitBox(repo) {
    const textarea = h("textarea", {
      rows: "1",
      placeholder: tr("Commit message") + " (Ctrl+Enter)",
      "aria-label": tr("Commit message"),
      data: { draft: repo.id },
      onInput: (event) => {
        ui.drafts[repo.id] = event.target.value;
        commitBtn.disabled = event.target.value.trim().length === 0;
        persist();
      },
      onKeydown: (event) => {
        event.stopPropagation();
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      }
    });
    textarea.value = ui.drafts[repo.id] || "";
    const submit = () => {
      const message = textarea.value.trim();
      if (!message) return;
      vscode.postMessage({ type: "commit", repo: repo.id, message });
    };
    const commitBtn = h("button", { class: "cta", onClick: submit, disabled: textarea.value.trim() ? null : "" }, icon("commit"), tr("Commit"));
    const hint = repo.counts.staged === 0 ? tr("Nothing staged — will offer to stage all") : tr("{count} staged", { count: repo.counts.staged });
    return h("div", { class: "commit-box" }, textarea, h("div", { class: "row" }, h("span", { class: "hint", text: hint }), commitBtn));
  }

  function renderGroup(repo, group, files, keys) {
    const groupId = repo.id + "|" + group.kind;
    const open = !ui.collapsedGroups.has(groupId);
    const el = h("div", { class: "group" + (open ? " open" : "") + enterClass("group:" + groupId, keys) });
    const head = h(
      "div",
      { class: "group-head", tabindex: "0", role: "treeitem", "aria-expanded": String(open), data: { nav: "group:" + groupId }, onClick: () => toggleGroup(groupId, el) },
      h("span", { class: "chevron" }, icon("chevron")),
      h("span", { text: tr(group.label) }),
      h("span", { class: "count", text: "(" + files.length + ")" }),
      h("span", { class: "head-spacer" })
    );
    head._owner = el;

    const quick = h("span", { class: "quick" });
    if (group.kind === "unstaged" || group.kind === "untracked") {
      quick.append(iconButton("plus", tr("Stage All"), () => run("gitWorkspacePro.stageFile", repo.id, files.map((f) => ({ path: f.path, kind: f.kind })))));
    } else if (group.kind === "staged") {
      quick.append(iconButton("minus", tr("Unstage All"), () => run("gitWorkspacePro.unstageAll", repo.id)));
    }
    head.append(quick);
    el.append(head);

    const wrap = h("div", { class: "body-wrap" });
    const body = h("div", { class: "body" });
    wrap.append(body);
    el.append(wrap);
    if (open) fillGroupBody(body, repo, group, files);
    el._payload = { repo, group, files };
    return el;
  }

  function fillGroupBody(body, repo, group, files) {
    const showAll = ui.showAllFiles.has(repo.id + "|" + group.kind);
    const shown = showAll ? files : files.slice(0, MAX_FILES_PER_GROUP);
    const list = h("div", { class: "files" });
    for (const file of shown) list.append(renderFile(repo, file, shown));
    if (shown.length < files.length) {
      list.append(h("button", { class: "more-btn", onClick: () => { ui.showAllFiles.add(repo.id + "|" + group.kind); lastSignature = ""; render(); } }, tr("Show {count} more…", { count: files.length - shown.length })));
    }
    body.append(list);
  }

  function renderFile(repo, file, siblings) {
    const key = fileKey(repo.id, file);
    const { dir, name } = splitPath(file.path);
    const el = h("div", {
      class: "file k-" + file.kind + (selection.has(key) ? " selected" : ""),
      tabindex: "0",
      role: "treeitem",
      title: file.originalPath ? file.originalPath + " → " + file.path : file.path,
      data: { nav: "file:" + key },
      onClick: (event) => onFileClick(event, repo, file, siblings),
      onContextmenu: (event) => openMenu(event, fileMenu(repo, file))
    });
    el._owner = el;
    el._file = { repo, file, siblings };

    const quick = h("span", { class: "quick" });
    if (file.kind === "conflicted") {
      quick.append(iconButton("warning", tr("Resolve conflict"), () => runFile("gitWorkspacePro.resolveConflict", repo, file)));
    } else {
      quick.append(iconButton("diff", tr("Open diff"), () => runFile("gitWorkspacePro.openDiff", repo, file)));
    }
    quick.append(iconButton("file", tr("Open file"), () => runFile("gitWorkspacePro.openChangedFile", repo, file)));
    if (file.kind === "staged") quick.append(iconButton("minus", tr("Unstage"), () => runFile("gitWorkspacePro.unstageFile", repo, file)));
    if (file.kind === "unstaged" || file.kind === "untracked") {
      quick.append(iconButton("plus", tr("Stage"), () => runFile("gitWorkspacePro.stageFile", repo, file)));
      quick.append(iconButton("discard", tr("Discard"), () => runFile("gitWorkspacePro.discardFile", repo, file)));
    }

    el.append(h("span", { class: "code", text: statusLetter(file) }), h("span", { class: "fname", text: name }), h("span", { class: "fdir", text: dir }), quick);
    return el;
  }

  function runFile(command, repo, file) {
    run(command, repo.id, [{ path: file.path, kind: file.kind }]);
  }

  function resolveFirstConflict(repo) {
    const first = repo.files.find((file) => file.kind === "conflicted");
    if (first) runFile("gitWorkspacePro.resolveConflict", repo, first);
  }

  function primaryFileAction(repo, file) {
    if (file.kind === "conflicted") runFile("gitWorkspacePro.resolveConflict", repo, file);
    else if (file.kind === "untracked") runFile("gitWorkspacePro.openChangedFile", repo, file);
    else runFile("gitWorkspacePro.openDiff", repo, file);
  }

  /* ---------- interactions ---------- */
  function onFileClick(event, repo, file, siblings) {
    const key = fileKey(repo.id, file);
    if (event.ctrlKey || event.metaKey) {
      toggleSelect(key, repo, file);
      anchor = { repo: repo.id, key };
    } else if (event.shiftKey && anchor && anchor.repo === repo.id) {
      const keys = siblings.map((f) => fileKey(repo.id, f));
      const from = keys.indexOf(anchor.key);
      const to = keys.indexOf(key);
      if (from >= 0 && to >= 0) {
        for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) {
          selection.set(keys[i], { repo: repo.id, path: siblings[i].path, kind: siblings[i].kind });
        }
      }
    } else {
      if (selection.size > 0) selection.clear();
      anchor = { repo: repo.id, key };
      primaryFileAction(repo, file);
    }
    render();
  }

  function toggleSelect(key, repo, file) {
    if (selection.has(key)) selection.delete(key);
    else selection.set(key, { repo: repo.id, path: file.path, kind: file.kind });
  }

  function animateToggle(container, isOpen, build) {
    const body = container.querySelector(":scope > .body-wrap > .body");
    if (isOpen) {
      if (!body.firstChild) build(body);
      void container.offsetHeight; // commit the closed state so the grid transition runs
      container.classList.add("open");
    } else {
      container.classList.remove("open");
    }
  }

  function toggleRepo(id, card) {
    const open = !ui.expanded.has(id);
    if (open) ui.expanded.add(id);
    else ui.expanded.delete(id);
    persist();
    card.querySelector(":scope > .card-head").setAttribute("aria-expanded", String(open));
    animateToggle(card, open, (body) => {
      const node = card._node;
      const changes = node.repo.counts.staged + node.repo.counts.unstaged + node.repo.counts.untracked + node.repo.counts.conflicted;
      fillRepoBody(body, node, card, changes, new Set());
    });
    lastSignature = JSON.stringify([state, ui.filter, [...ui.expanded], [...ui.collapsedGroups], [...busy], [...selection.keys()], [...ui.showAllFiles]]);
  }

  function toggleGroup(groupId, el) {
    const open = ui.collapsedGroups.has(groupId);
    if (open) ui.collapsedGroups.delete(groupId);
    else ui.collapsedGroups.add(groupId);
    persist();
    el.querySelector(":scope > .group-head").setAttribute("aria-expanded", String(open));
    animateToggle(el, open, (body) => fillGroupBody(body, el._payload.repo, el._payload.group, el._payload.files));
    lastSignature = JSON.stringify([state, ui.filter, [...ui.expanded], [...ui.collapsedGroups], [...busy], [...selection.keys()], [...ui.showAllFiles]]);
  }

  function renderSelectionBar() {
    if (selection.size === 0) {
      selectionEl.classList.remove("show");
      selectionEl.replaceChildren();
      return;
    }
    const items = [...selection.values()];
    const canStage = items.some((i) => i.kind === "unstaged" || i.kind === "untracked");
    const canUnstage = items.some((i) => i.kind === "staged");
    selectionEl.classList.add("show");
    selectionEl.replaceChildren(
      ...kids(
        h("span", { class: "label", text: tr("{count} selected", { count: items.length }) }),
        canStage ? h("button", { class: "cta", onClick: () => bulk("gitWorkspacePro.stageFile", ["unstaged", "untracked"]) }, icon("plus"), tr("Stage")) : null,
        canUnstage ? h("button", { class: "cta secondary", onClick: () => bulk("gitWorkspacePro.unstageFile", ["staged"]) }, icon("minus"), tr("Unstage")) : null,
        iconButton("close", tr("Clear selection"), () => { selection.clear(); render(); })
      )
    );
  }

  function bulk(command, kinds) {
    const byRepo = new Map();
    for (const item of selection.values()) {
      if (!kinds.includes(item.kind)) continue;
      if (!byRepo.has(item.repo)) byRepo.set(item.repo, []);
      byRepo.get(item.repo).push({ path: item.path, kind: item.kind });
    }
    for (const [repo, files] of byRepo) run(command, repo, files);
    selection.clear();
    render();
  }

  /* ---------- context menu ---------- */
  const menuEl = document.getElementById("menu");

  function repoMenu(repo) {
    return [
      [tr("Fetch"), "fetch", () => run("gitWorkspacePro.fetch", repo.id)],
      [tr("Pull"), "pull", () => run("gitWorkspacePro.pull", repo.id)],
      [tr("Push"), "push", () => run("gitWorkspacePro.push", repo.id)],
      null,
      [tr("Stage All"), "plus", () => run("gitWorkspacePro.stageAll", repo.id)],
      [tr("Unstage All"), "minus", () => run("gitWorkspacePro.unstageAll", repo.id)],
      [tr("Stash Push"), "stash", () => run("gitWorkspacePro.stashPush", repo.id)],
      null,
      [tr("Show History"), "history", () => run("gitWorkspacePro.showHistory", repo.id)],
      [tr("Run Command"), "terminal", () => run("gitWorkspacePro.runCustomCommand", repo.id)],
      [tr("Repository Actions"), "more", () => run("gitWorkspacePro.showRepositoryActions", repo.id)]
    ];
  }

  function fileMenu(repo, file) {
    const items = [];
    items.push(file.kind === "conflicted"
      ? [tr("Resolve conflict"), "warning", () => runFile("gitWorkspacePro.resolveConflict", repo, file)]
      : [tr("Open diff"), "diff", () => runFile("gitWorkspacePro.openDiff", repo, file)]);
    items.push([tr("Open file"), "file", () => runFile("gitWorkspacePro.openChangedFile", repo, file)]);
    if (file.kind === "staged") items.push([tr("Unstage"), "minus", () => runFile("gitWorkspacePro.unstageFile", repo, file)]);
    if (file.kind === "unstaged" || file.kind === "untracked") {
      items.push([tr("Stage"), "plus", () => runFile("gitWorkspacePro.stageFile", repo, file)]);
      items.push(null);
      items.push([tr("Discard"), "discard", () => runFile("gitWorkspacePro.discardFile", repo, file)]);
    }
    return items;
  }

  function openMenu(event, items) {
    event.preventDefault();
    event.stopPropagation();
    menuEl.replaceChildren(
      ...items.map((item) =>
        item === null
          ? h("hr")
          : h("button", { onClick: () => { closeMenu(); item[2](); } }, icon(item[1]), item[0])
      )
    );
    menuEl.classList.add("show");
    const { innerWidth, innerHeight } = window;
    const rect = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.max(4, Math.min(event.clientX, innerWidth - rect.width - 4)) + "px";
    menuEl.style.top = Math.max(4, Math.min(event.clientY, innerHeight - rect.height - 4)) + "px";
    const first = menuEl.querySelector("button");
    if (first) first.focus();
  }

  function closeMenu() {
    menuEl.classList.remove("show");
  }

  document.addEventListener("click", closeMenu);
  window.addEventListener("blur", closeMenu);
  window.addEventListener("scroll", closeMenu, { passive: true });

  /* ---------- keyboard ---------- */
  function visibleNavItems() {
    return [...listEl.querySelectorAll("[data-nav]")].filter((el) => {
      const owner = el._owner || el;
      const parent = owner.parentElement;
      return !(parent && parent.closest(".card:not(.open), .group:not(.open)"));
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (menuEl.classList.contains("show")) { closeMenu(); return; }
      if (document.activeElement === searchInput && ui.filter) { setFilter(""); return; }
      if (selection.size > 0) { selection.clear(); render(); return; }
    }

    const target = event.target;
    if (target === searchInput || (target.tagName === "TEXTAREA")) {
      if (target === searchInput && event.key === "ArrowDown") {
        const first = visibleNavItems()[0];
        if (first) { event.preventDefault(); first.focus(); }
      }
      return;
    }

    if (menuEl.classList.contains("show")) {
      const buttons = [...menuEl.querySelectorAll("button")];
      const index = buttons.indexOf(document.activeElement);
      if (event.key === "ArrowDown") { event.preventDefault(); buttons[(index + 1) % buttons.length].focus(); }
      if (event.key === "ArrowUp") { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length].focus(); }
      return;
    }

    if (event.key === "/") { event.preventDefault(); searchInput.focus(); searchInput.select(); return; }
    if (event.key === "r" && !event.ctrlKey && !event.metaKey) { vscode.postMessage({ type: "refresh" }); return; }

    const el = target.closest && target.closest("[data-nav]");
    if (!el) return;
    const items = visibleNavItems();
    const index = items.indexOf(el);

    switch (event.key) {
      case "ArrowDown": event.preventDefault(); if (items[index + 1]) items[index + 1].focus(); break;
      case "ArrowUp": event.preventDefault(); if (index > 0) items[index - 1].focus(); else searchInput.focus(); break;
      case "ArrowRight": {
        const container = el._owner;
        if (container && !container.classList.contains("open")) { event.preventDefault(); el.click(); }
        break;
      }
      case "ArrowLeft": {
        const container = el._owner;
        if (container && container.classList.contains("open")) { event.preventDefault(); el.click(); }
        else if (container && container.parentElement) {
          const parentOwner = container.parentElement.closest(".card, .group");
          const parentHead = parentOwner && parentOwner.querySelector(":scope > .card-head, :scope > .group-head");
          if (parentHead) parentHead.focus();
        }
        break;
      }
      case "Enter": event.preventDefault(); el.click(); break;
      case " ":
        if (el._file) { event.preventDefault(); toggleSelect(fileKey(el._file.repo.id, el._file.file), el._file.repo, el._file.file); render(); }
        break;
      case "s": if (el._file && ["unstaged", "untracked"].includes(el._file.file.kind)) runFile("gitWorkspacePro.stageFile", el._file.repo, el._file.file); break;
      case "u": if (el._file && el._file.file.kind === "staged") runFile("gitWorkspacePro.unstageFile", el._file.repo, el._file.file); break;
      case "d": if (el._file && ["unstaged", "untracked"].includes(el._file.file.kind)) runFile("gitWorkspacePro.discardFile", el._file.repo, el._file.file); break;
      default: break;
    }
  });

  /* ---------- header wiring ---------- */
  function setFilter(value) {
    ui.filter = value;
    searchInput.value = value;
    clearSearch.style.display = value ? "" : "none";
    persist();
    render();
  }

  const clearSearch = document.getElementById("clearSearch");
  searchInput.placeholder = tr("Search repositories and files…");
  searchInput.setAttribute("aria-label", searchInput.placeholder);
  searchInput.value = ui.filter;
  clearSearch.style.display = ui.filter ? "" : "none";
  clearSearch.title = tr("Clear");
  searchInput.addEventListener("input", () => setFilter(searchInput.value));
  clearSearch.addEventListener("click", () => { setFilter(""); searchInput.focus(); });

  const refreshBtn = document.getElementById("refresh");
  refreshBtn.title = tr("Refresh");
  refreshBtn.setAttribute("aria-label", tr("Refresh"));
  refreshBtn.replaceChildren(icon("refresh"));
  refreshBtn.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));

  fetchAllBtn.title = tr("Fetch All");
  fetchAllBtn.setAttribute("aria-label", tr("Fetch All"));
  fetchAllBtn.replaceChildren(icon("fetch"));
  fetchAllBtn.addEventListener("click", () => vscode.postMessage({ type: "fetchAll" }));

  const collapseBtn = document.getElementById("collapseAll");
  collapseBtn.title = tr("Collapse All");
  collapseBtn.setAttribute("aria-label", tr("Collapse All"));
  collapseBtn.replaceChildren(icon("collapse"));
  collapseBtn.addEventListener("click", () => { ui.expanded.clear(); persist(); render(); });

  cleanBtn.addEventListener("click", () => vscode.postMessage({ type: "setShowClean", value: !state.showClean }));
  document.getElementById("searchIcon").replaceChildren(icon("search"));
  clearSearch.replaceChildren(icon("close"));

  /* ---------- extension messages ---------- */
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message.type !== "string") return;
    if (message.type === "state") {
      state = message.state;
      busy = new Set(message.busy || []);
      // drop selections that no longer exist
      const live = new Set();
      const walk = (repos) => repos.forEach((repo) => { repo.files.forEach((f) => live.add(fileKey(repo.id, f))); walk(repo.children); });
      walk(state.repositories);
      for (const key of [...selection.keys()]) if (!live.has(key)) selection.delete(key);
      fetchAllBtn.classList.toggle("spin", Boolean(message.fetching));
      render();
    } else if (message.type === "commitResult") {
      if (message.ok) { delete ui.drafts[message.repo]; persist(); lastSignature = ""; render(); }
    } else if (message.type === "focusSearch") {
      searchInput.focus();
      searchInput.select();
    }
  });

  listEl.setAttribute("role", "tree");
  render();
  vscode.postMessage({ type: "ready" });
})();
