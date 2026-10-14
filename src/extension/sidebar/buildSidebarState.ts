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
  const converted = visible.map((repository) => convert(repository, showClean));

  return { repositories: converted, summary: summarize(converted), showClean };
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
    children,
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
