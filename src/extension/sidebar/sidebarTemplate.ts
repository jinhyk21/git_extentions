import type { Webview } from "vscode";
import { translate, type AppLanguage } from "../../shared/i18n";
import type { SidebarState } from "../../shared/types/sidebar";

/** Every string the sidebar client looks up with tr(); kept in sync by a unit test. */
export const SIDEBAR_MESSAGES = [
  "Merge",
  "Rebase",
  "Cherry Pick",
  "Revert",
  "Conflicted",
  "Staged",
  "Unstaged",
  "Untracked",
  "{count} repositories",
  "{count} changed files",
  "{count} conflicts",
  "{count} conflict",
  "{count} staged",
  "{count} selected",
  "{count} clean",
  "Clean repositories ({count})",
  "Hide clean repositories",
  "Show clean repositories",
  "No matches",
  "All repositories are clean",
  "Nothing needs your attention right now.",
  "No Git repositories found",
  "Loading…",
  "Status unavailable",
  "Branch: {branch}",
  "Resolve First Conflict",
  "Resolve",
  "Resolve and stage every conflicted file before continuing.",
  "Resolve conflict",
  "Pull",
  "Push",
  "Fetch",
  "Show History",
  "Run Command",
  "More actions",
  "{operation} in progress",
  "Continue",
  "Skip",
  "Abort",
  "Commit",
  "Commit message",
  "Nothing staged — will offer to stage all",
  "Stage All",
  "Unstage All",
  "Stage",
  "Unstage",
  "Discard",
  "Open diff",
  "Open file",
  "Show {count} more…",
  "Clear selection",
  "Clear",
  "Stash Push",
  "Repository Actions",
  "Search repositories and files…",
  "Refresh",
  "Fetch All",
  "Collapse All"
] as const;

export type SidebarBoot = {
  readonly state: SidebarState;
  readonly busy: readonly string[];
};

export function getSidebarHtml(
  webview: Webview,
  scriptUri: string,
  styleUri: string,
  boot: SidebarBoot,
  language: AppLanguage
): string {
  const nonce = createNonce();
  const translations = Object.fromEntries(SIDEBAR_MESSAGES.map((message) => [message, translate(language, message)]));
  // "<" is escaped so repository names or paths can never close the script tag.
  const data = JSON.stringify({ ...boot, translations }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="${styleUri}" />
<title>Git Workspace Pro</title>
</head>
<body>
<header class="top">
  <div class="toolbar">
    <div class="summary" id="summary" aria-live="polite"></div>
    <button class="icon-btn" id="fetchAll"></button>
    <button class="icon-btn" id="refresh"></button>
    <button class="icon-btn" id="collapseAll"></button>
    <button class="chip-btn" id="toggleClean"></button>
  </div>
  <div class="search">
    <span id="searchIcon"></span>
    <input type="text" id="search" spellcheck="false" autocomplete="off" />
    <button class="icon-btn clear" id="clearSearch"></button>
  </div>
</header>
<main id="list"></main>
<div id="selection"></div>
<div id="menu" role="menu"></div>
<script type="application/json" id="boot">${data}</script>
<script nonce="${nonce}" src="${scriptUri}"></script>
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
