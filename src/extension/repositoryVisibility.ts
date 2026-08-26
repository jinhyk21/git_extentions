import type { RepositoryNode } from "../shared/types/repository";

/**
 * Keep the tree focused on repositories that need attention.
 *
 * A clean parent is still shown when one of its nested repositories needs
 * attention so the changed child remains reachable from the tree.
 */
export function shouldShowRepository(repository: RepositoryNode): boolean {
  const status = repository.status;

  if (!status || repository.statusError) {
    return true;
  }

  if (
    status.files.length > 0 ||
    status.ahead > 0 ||
    status.behind > 0 ||
    status.operation !== undefined
  ) {
    return true;
  }

  return repository.children.some(shouldShowRepository);
}
