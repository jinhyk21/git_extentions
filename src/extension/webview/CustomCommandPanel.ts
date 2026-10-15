import * as vscode from "vscode";
import type { RepositoryNode } from "../../shared/types/repository";
import {
  addToHistory,
  isRunCommandMessage,
  MAX_COMMAND_LENGTH,
  resolveWorkingDirectory
} from "../../core/shell/customCommandHelpers";
import { AnsiParser } from "../../core/shell/AnsiParser";
import { ShellCommandRunner, type ShellRunHandle } from "../../core/shell/ShellCommandRunner";
import { getActiveLanguage, t } from "../localization";
import { getCustomCommandHtml } from "./customCommandTemplate";

const HISTORY_KEY = "gitWorkspacePro.customCommandHistory";
const NOTICE_KEY = "gitWorkspacePro.customCommandNoticeShown";

export class CustomCommandPanel {
  private static readonly openPanels = new Map<string, CustomCommandPanel>();
  private static readonly runner = new ShellCommandRunner();

  private readonly panel: vscode.WebviewPanel;
  private running: ShellRunHandle | undefined;
  private disposed = false;

  public static open(
    context: vscode.ExtensionContext,
    repository: Pick<RepositoryNode, "rootPath" | "name">,
    onFinished: () => Promise<void>
  ): void {
    const existing = CustomCommandPanel.openPanels.get(repository.rootPath);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    CustomCommandPanel.openPanels.set(
      repository.rootPath,
      new CustomCommandPanel(context, repository, onFinished)
    );
  }

  public static disposeAll(): void {
    for (const panel of [...CustomCommandPanel.openPanels.values()]) {
      panel.panel.dispose();
    }
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repository: Pick<RepositoryNode, "rootPath" | "name">,
    private readonly onFinished: () => Promise<void>
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "gitWorkspacePro.customCommand",
      t("Run Command: {repository}", { repository: repository.name }),
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const config = vscode.workspace.getConfiguration("gitWorkspacePro.customCommand");
    this.panel.webview.html = getCustomCommandHtml(
      this.panel.webview,
      repository.name,
      this.readHistory(),
      config.get<boolean>("autoRefresh", true),
      getActiveLanguage(),
      repository.rootPath
    );

    this.panel.onDidDispose(() => {
      this.disposed = true;
      this.running?.stop();
      CustomCommandPanel.openPanels.delete(this.repository.rootPath);
    });

    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isRunCommandMessage(message)) {
        void this.run(message.script, message.cwd, message.autoRefresh);
      } else if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "copyOutput" &&
        "text" in message &&
        typeof message.text === "string"
      ) {
        void vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage(t("Output copied."));
      } else if (typeof message === "object" && message !== null && "type" in message && message.type === "stop") {
        this.running?.stop();
      }
    });
  }

  private readHistory(): string[] {
    const stored = this.context.workspaceState.get<unknown>(HISTORY_KEY, []);
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
  }

  private post(message: Record<string, unknown>): void {
    if (!this.disposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private async run(script: string, cwdInput: string, autoRefresh: boolean): Promise<void> {
    if (this.running) {
      vscode.window.showWarningMessage(t("A command is already running in this repository."));
      return;
    }

    if (script.trim().length === 0 || script.length > MAX_COMMAND_LENGTH) {
      return;
    }

    const resolved = resolveWorkingDirectory(this.repository.rootPath, cwdInput);
    if ("error" in resolved) {
      vscode.window.showErrorMessage(
        resolved.error === "outside"
          ? t("The working directory must be inside the repository.")
          : t("The working directory does not exist.")
      );
      return;
    }

    const config = vscode.workspace.getConfiguration("gitWorkspacePro.customCommand");
    const history = addToHistory(this.readHistory(), script, config.get<number>("historySize", 30));
    await this.context.workspaceState.update(HISTORY_KEY, history);
    this.post({ type: "history", items: history });
    await this.showFirstRunNotice();

    this.post({ type: "started" });
    // One parser per stream so colors and split escape sequences carry across chunks.
    const parsers = { stdout: new AnsiParser(), stderr: new AnsiParser() };
    const handle = CustomCommandPanel.runner.start(
      script,
      resolved.directory,
      (stream, text) => {
        const segments = parsers[stream].feed(text);
        if (segments.length > 0) {
          this.post({ type: "output", stream, segments });
        }
      },
      {
        shell: config.get<string>("shell", ""),
        timeoutMs: config.get<number>("timeoutSeconds", 0) * 1000
      }
    );
    this.running = handle;

    try {
      const result = await handle.result;
      this.post({ type: "finished", ...result });
    } catch (error) {
      this.post({
        type: "output",
        stream: "stderr",
        segments: [{ text: `${error instanceof Error ? error.message : String(error)}\n`, classes: "" }]
      });
      this.post({ type: "finished", exitCode: null, signal: null, durationMs: 0, stopped: false, timedOut: false });
    } finally {
      this.running = undefined;
    }

    if (autoRefresh && !this.disposed) {
      await this.onFinished().catch(() => undefined);
    }
  }

  private async showFirstRunNotice(): Promise<void> {
    if (this.context.globalState.get<boolean>(NOTICE_KEY, false)) {
      return;
    }

    await this.context.globalState.update(NOTICE_KEY, true);
    void vscode.window.showInformationMessage(
      t("Custom commands run with your user permissions inside the selected repository, like a terminal.")
    );
  }
}
