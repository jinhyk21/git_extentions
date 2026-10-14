/**
 * Returns a function that runs async tasks with at most `concurrency` in
 * flight. Used to keep a workspace with dozens of repositories from spawning
 * hundreds of git processes at once.
 */
export function createLimiter(concurrency: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active -= 1;
    queue.shift()?.();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        task().then(resolve, reject).finally(next);
      };

      if (active < Math.max(1, concurrency)) {
        start();
      } else {
        queue.push(start);
      }
    });
}
