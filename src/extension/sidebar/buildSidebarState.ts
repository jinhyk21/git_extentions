import type { RepositoryNode } from "../../shared/types/repository";
import type { SidebarRepository, SidebarState, SidebarSummary } from "../../shared/types/sidebar";
import { shouldShowRepository } from "../repositoryVisibility";

/**
 * Converts the repository tree into the plain, serializable snapshot the
 * sidebar webview renders. Mirrors the old tree's visibility rule: clean,
 * in-sync repositories are hidden unless `showClean` is set, but a clean
 * parent stays visible while a nested repository needs attention.
 */
export function buildSidebarState(repositories: readonly RepositoryNode[], showClean: boolean): SidebarState {
  const visible = showClean ? repositories : repositories.filter(shouldShowRepository);
  const converted = sortByAttention(visible.map((repository) => convert(repository, showClean)));

  return { repositories: converted, summary: summarize(converted), showClean, cleanCount: countClean(repositories) };
}

/** Most urgent first (conflicts, errors, changes, sync), clean last; alphabetical within a rank. */
function attentionRank(repository: SidebarRepository): number {
  if (repository.counts.conflicted > 0 || repository.operation) return 0;
  if (repository.error) return 1;
  if (repository.counts.staged + repository.counts.unstaged + repository.counts.untracked > 0) return 2;
  if (repository.ahead > 0 || repository.behind > 0) return 3;
  if (repository.loading) return 4;
  return repository.needsAttention ? 4 : 5;
}

function sortByAttention(repositories: readonly SidebarRepository[]): SidebarRepository[] {
  return [...repositories].sort(
    (left, right) => attentionRank(left) - attentionRank(right) || left.name.localeCompare(right.name)
  );
}

function countClean(repositories: readonly RepositoryNode[]): number {
  return repositories.reduce(
    (total, repository) =>
      total + (repository.status && !shouldShowRepository({ ...repository, children: [] }) ? 1 : 0) + countClean(repository.children),
    0
  );
}

function convert(repository: RepositoryNode, showClean: boolean): SidebarRepository {
  const status = repository.status;
  const children = (showClean ? repository.children : repository.children.filter(shouldShowRepository)).map((child) =>
    convert(child, showClean)
  );

  return {
    id: repository.rootPath,
    name: repository.name,
    rootPath: repository.rootPath,
    isSubmodule: repository.isSubmodule,
    loading: status === undefined && repository.statusError === undefined,
    ...(repository.statusError !== undefined ? { error: repository.statusError } : {}),
    ...(status ? { branch: status.branch } : {}),
    ahead: status?.ahead ?? 0,
    behind: status?.behind ?? 0,
    counts: status?.counts ?? { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
    ...(status?.operation
      ? {
          operation: {
            type: status.operation.type,
            ...(status.operation.currentStep !== undefined ? { currentStep: status.operation.currentStep } : {}),
            ...(status.operation.totalSteps !== undefined ? { totalSteps: status.operation.totalSteps } : {})
          }
        }
      : {}),
    files: (status?.files ?? []).map((file) => ({
      path: file.path,
      ...(file.originalPath !== undefined ? { originalPath: file.originalPath } : {}),
      kind: file.kind,
      code: `${file.indexStatus}${file.workTreeStatus}`
    })),
    children: sortByAttention(children),
    needsAttention: shouldShowRepository(repository)
  };
}

function summarize(repositories: readonly SidebarRepository[]): SidebarSummary {
  const total = { repositories: 0, changedFiles: 0, conflicts: 0, ahead: 0, behind: 0 };
  const visit = (nodes: readonly SidebarRepository[]) => {
    for (const node of nodes) {
      total.repositories += 1;
      total.changedFiles += node.files.length;
      total.conflicts += node.counts.conflicted;
      total.ahead += node.ahead;
      total.behind += node.behind;
      visit(node.children);
    }
  };
  visit(repositories);
  return total;
}
