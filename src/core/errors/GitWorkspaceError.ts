import type { ErrorCode } from "../../shared/constants/errorCodes";

export class GitWorkspaceError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "GitWorkspaceError";
  }
}
