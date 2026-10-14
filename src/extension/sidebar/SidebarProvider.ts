import * as vscode from "vscode";
import type { RepositoryManager } from "../../core/repository/RepositoryManager";
import type { GitChangedFile, RepositoryNode } from "../../shared/types/repository";
import { getActiveLanguage } from "../localization";
import { buildSidebarState } from "./buildSidebarState";
import { isSidebarMessage, type SidebarMessage } from "./sidebarMessages";
import { getSidebarHtml } from "./sidebarTemplate";

export const SIDEBAR_VIEW_ID = "gitWorkspacePro.dashboard";

/** Commands the sidebar may trigger; anything else coming from the webview is ignored. */
const REPOSITORY_COMMANDS = new Set([
  "gitWorkspacePro.fetch",
  "gitWorkspacePro.pull",
  "gitWorkspacePro.pullBranch",
  "gitWorkspacePro.commit",
  "gitWorkspacePro.checkoutBranch",
  "gitWorkspacePro.createBranch",
  "gitWorkspacePro.deleteBranch",
  "gitWorkspacePro.mergeBranch",
  "gitWorkspacePro.rebaseBranch",
  "gitWorkspacePro.stashPop",
  "gitWorkspacePro.restoreAll",
  "gitWorkspacePro.push",
  "gitWorkspacePro.stageAll",
  "gitWorkspacePro.unstageAll",
  "gitWorkspacePro.stashPush",
  "gitWorkspacePro.showHistory",
  "gitWorkspacePro.runCustomCommand",
  "gitWorkspacePro.showRepositoryActions",
  "gitWorkspacePro.continueOperation",
  "gitWorkspacePro.abortOperation",
  "gitWorkspacePro.skipOperation"
]);
const FILE_COMMANDS = new Set([
  "gitWorkspacePro.openChangedFile",
  "gitWorkspacePro.openDiff",
  "gitWorkspacePro.resolveConflict",
  "gitWorkspacePro.stageFile",
  "gitWorkspacePro.unstageFile",
  "gitWorkspacePro.discardFile"
]);

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private readonly busy = new Set<string>();
  private fetching = false;
  private pushTimer: NodeJS.Timeout | undefined;
  private lastPosted = "";

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly repositoryManager: RepositoryManager
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, "media", "sidebar");
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    this.renderHtml();

    view.webview.onDidReceiveMessage((message: unknown) => {
      if (isSidebarMessage(message)) {
        void this.handleMessage(message);
      }
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.postState(true);
      }
    });
    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  /** Re-render from scratch (language change). */
  public reload(): void {
    this.renderHtml();
  }

  /** Coalesces bursts of refreshes (file watcher + command refresh) into one snapshot. */
  public refresh(): void {
    if (!this.view) {
      return;
    }

    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.postState(), 40);
  }

  public setFetching(value: boolean): void {
    this.fetching = value;
    this.postState();
  }

  public focusSearch(): void {
    void this.view?.webview.postMessage({ type: "focusSearch" });
  }

  private showClean(): boolean {
    return vscode.workspace.getConfiguration("gitWorkspacePro").get<boolean>("sidebar.showCleanRepositories", false);
  }

  private snapshot() {
    return {
      state: buildSidebarState(this.repositoryManager.getRepositories(), this.showClean()),
      busy: [...this.busy]
    };
  }

  private renderHtml(): void {
    const view = this.view;
    if (!view) {
      return;
    }

    this.lastPosted = "";
    const media = vscode.Uri.joinPath(this.extensionUri, "media", "sidebar");
    view.webview.html = getSidebarHtml(
      view.webview,
      view.webview.asWebviewUri(vscode.Uri.joinPath(media, "sidebar.js")).toString(),
      view.webview.asWebviewUri(vscode.Uri.joinPath(media, "sidebar.css")).toString(),
      this.snapshot(),
      getActiveLanguage()
    );
  }

  /** Skips the post when nothing visible changed, so idle refreshes cost the webview nothing. */
  private postState(force = false): void {
    if (!this.view) {
      return;
    }

    const payload = { type: "state", ...this.snapshot(), fetching: this.fetching };
    const serialized = JSON.stringify(payload);
    if (!force && serialized === this.lastPosted) {
      return;
    }

    this.lastPosted = serialized;
    void this.view.webview.postMessage(payload);
  }

  private findRepository(rootPath: string): RepositoryNode | undefined {
    const repository = this.repositoryManager.findRepositoryForPath(rootPath);
    return repository && repository.rootPath === rootPath ? repository : undefined;
  }

  private async withBusy<T>(rootPath: string, task: () => Thenable<T>): Promise<T> {
    this.busy.add(rootPath);
    this.postState();
    try {
      return await task();
    } finally {
      this.busy.delete(rootPath);
      this.postState();
    }
  }

  private async handleMessage(message: SidebarMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.postState(true);
        return;
      case "refresh":
        await vscode.commands.executeCommand("gitWorkspacePro.refreshRepositories");
        return;
      case "fetchAll":
        await vscode.commands.executeCommand("gitWorkspacePro.fetchAll");
        return;
      case "setShowClean":
        await vscode.workspace
          .getConfiguration("gitWorkspacePro")
          .update("sidebar.showCleanRepositories", message.value, vscode.ConfigurationTarget.Global);
        return;
      case "commit": {
        const repository = this.findRepository(message.repo);
        if (!repository || message.message.trim().length === 0) {
          return;
        }

        const ok = await this.withBusy(repository.rootPath, () =>
          vscode.commands.executeCommand<boolean>("gitWorkspacePro.commitWithMessage", {
            rootPath: repository.rootPath,
            message: message.message
          })
        );
        void this.view?.webview.postMessage({ type: "commitResult", repo: repository.rootPath, ok: ok === true });
        return;
      }
      case "command":
        await this.runCommand(message);
        return;
    }
  }

  private async runCommand(message: Extract<SidebarMessage, { type: "command" }>): Promise<void> {
    const repository = this.findRepository(message.repo);
    if (!repository) {
      return;
    }

    if (REPOSITORY_COMMANDS.has(message.command)) {
      await this.withBusy(repository.rootPath, () => vscode.commands.executeCommand(message.command, repository));
      return;
    }

    if (!FILE_COMMANDS.has(message.command)) {
      return;
    }

    const files = (message.files ?? [])
      .map((ref) => repository.status?.files.find((file) => file.path === ref.path && file.kind === ref.kind))
      .filter((file): file is GitChangedFile => file !== undefined);
    const nodes = files.map((file) => ({ type: "changedFile" as const, repository, file }));
    const first = nodes[0];
    if (!first) {
      return;
    }

    await this.withBusy(repository.rootPath, async () => {
      switch (message.command) {
        case "gitWorkspacePro.stageFile":
          await vscode.commands.executeCommand(message.command, first, nodes);
          return;
        case "gitWorkspacePro.unstageFile":
          for (const node of nodes) {
            await vscode.commands.executeCommand(message.command, node);
          }
          return;
        default:
          await vscode.commands.executeCommand(message.command, first);
      }
    });
  }
}
