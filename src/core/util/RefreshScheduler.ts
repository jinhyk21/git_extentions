/**
 * Coalesces bursts of "something changed" signals per key (a repository path)
 * into as few refreshes as possible:
 *  - signals are debounced (`delayMs`), but a refresh is forced after `maxWaitMs`
 *    of continuous activity so the UI still updates during a long build;
 *  - a key never has two refreshes in flight; a signal that arrives meanwhile
 *    schedules exactly one more run afterwards.
 */
export class RefreshScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly firstSignal = new Map<string, number>();
  private readonly running = new Set<string>();
  private readonly rerun = new Set<string>();
  private disposed = false;

  public constructor(
    private readonly refresh: (key: string) => Promise<void>,
    private readonly delayMs = 800,
    private readonly maxWaitMs = 4000
  ) {}

  public schedule(key: string): void {
    if (this.disposed) {
      return;
    }

    if (this.running.has(key)) {
      this.rerun.add(key);
      return;
    }

    const now = Date.now();
    const first = this.firstSignal.get(key) ?? now;
    this.firstSignal.set(key, first);

    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const wait = Math.max(0, Math.min(this.delayMs, first + this.maxWaitMs - now));
    this.timers.set(
      key,
      setTimeout(() => void this.run(key), wait)
    );
  }

  public dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.firstSignal.clear();
    this.rerun.clear();
  }

  private async run(key: string): Promise<void> {
    this.timers.delete(key);
    this.firstSignal.delete(key);
    this.running.add(key);
    try {
      await this.refresh(key);
    } catch {
      // A failed refresh must not break scheduling; the next signal retries.
    } finally {
      this.running.delete(key);
      if (this.rerun.delete(key)) {
        this.schedule(key);
      }
    }
  }
}
