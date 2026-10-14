/** Messages the sidebar webview may send. Kept free of the vscode API so it is unit-testable. */
export type FileRef = { readonly path: string; readonly kind: string };

export type SidebarMessage =
  | { readonly type: "ready" | "refresh" | "fetchAll" }
  | { readonly type: "setShowClean"; readonly value: boolean }
  | { readonly type: "commit"; readonly repo: string; readonly message: string }
  | { readonly type: "command"; readonly command: string; readonly repo: string; readonly files?: readonly FileRef[] };

export function isSidebarMessage(value: unknown): value is SidebarMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "ready":
    case "refresh":
    case "fetchAll":
      return true;
    case "setShowClean":
      return typeof record.value === "boolean";
    case "commit":
      return typeof record.repo === "string" && typeof record.message === "string";
    case "command":
      return (
        typeof record.command === "string" &&
        typeof record.repo === "string" &&
        (record.files === undefined ||
          (Array.isArray(record.files) &&
            record.files.every(
              (file) =>
                typeof file === "object" &&
                file !== null &&
                typeof (file as FileRef).path === "string" &&
                typeof (file as FileRef).kind === "string"
            )))
      );
    default:
      return false;
  }
}
