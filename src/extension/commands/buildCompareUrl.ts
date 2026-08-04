export type GitHostKind = "github" | "gitlab" | "unknown";

export type ParsedRemote = {
  readonly host: string;
  readonly kind: GitHostKind;
  readonly pathWithoutGitSuffix: string;
};

/**
 * Parses a git remote URL (SSH or HTTPS form) into its host and repository
 * path, e.g. "git@github.com:org/repo.git" and "https://github.com/org/repo"
 * both yield { host: "github.com", pathWithoutGitSuffix: "org/repo" }.
 */
export function parseRemoteUrl(remoteUrl: string): ParsedRemote | undefined {
  const sshMatch = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/.exec(remoteUrl);
  if (sshMatch) {
    const host = sshMatch[1] ?? "";
    return { host, kind: classifyHost(host), pathWithoutGitSuffix: sshMatch[2] ?? "" };
  }

  try {
    const url = new URL(remoteUrl);
    const path = url.pathname.replace(/^\/+/, "").replace(/\.git\/?$/, "").replace(/\/+$/, "");
    return { host: url.host, kind: classifyHost(url.host), pathWithoutGitSuffix: path };
  } catch {
    return undefined;
  }
}

function classifyHost(host: string): GitHostKind {
  if (/github\.com$/i.test(host)) {
    return "github";
  }
  if (/gitlab\.com$/i.test(host)) {
    return "gitlab";
  }
  return "unknown";
}

/**
 * Builds a URL that opens the host's "create/compare pull or merge request"
 * page for a given branch — without needing the push output to have printed
 * a hint. GitHub and GitLab both accept this URL whether or not a PR/MR
 * already exists for the branch (existing ones are surfaced on that page).
 */
export function buildCompareUrl(remoteUrl: string, branch: string): string | undefined {
  const parsed = parseRemoteUrl(remoteUrl);
  if (!parsed || parsed.kind === "unknown") {
    return undefined;
  }

  const encodedBranch = encodeURIComponent(branch);

  if (parsed.kind === "github") {
    return `https://${parsed.host}/${parsed.pathWithoutGitSuffix}/compare/${encodedBranch}?expand=1`;
  }

  return `https://${parsed.host}/${parsed.pathWithoutGitSuffix}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodedBranch}`;
}
