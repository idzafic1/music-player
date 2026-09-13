export function resolvePlaybackUri(
  localUri: string | null | undefined,
  streamUrl: string | null | undefined,
  apiBaseUrl: string,
  songId: string,
): string {
  if (localUri) return localUri;
  if (streamUrl?.startsWith('http://') || streamUrl?.startsWith('https://')) return streamUrl;
  if (streamUrl?.startsWith('/')) return `${apiBaseUrl}${streamUrl}`;
  return `${apiBaseUrl}/api/songs/${songId}/stream`;
}

export class QualifyingPlayTracker {
  private accumulated = 0;
  private lastTick = 0;
  private fired = false;

  reset(): void {
    this.accumulated = 0;
    this.lastTick = 0;
    this.fired = false;
  }

  tick(isPlaying: boolean, now: number): boolean {
    if (this.lastTick > 0 && isPlaying) {
      const delta = (now - this.lastTick) / 1000;
      if (delta > 0 && delta < 2) this.accumulated += delta;
    }
    this.lastTick = isPlaying ? now : 0;
    if (this.accumulated >= 15 && !this.fired) {
      this.fired = true;
      return true;
    }
    return false;
  }
}

export function createProgressReporter(onProgress?: (value: number) => void) {
  let last = 0;
  return (value: number) => {
    if (!onProgress || !Number.isFinite(value)) return;
    const next = Math.max(last, Math.min(1, value));
    last = next;
    onProgress(next);
  };
}

export function playlistProgress(completed: number, current: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(1, (completed + current) / total)) : 0;
}

export function createCallbackGuard() {
  let generation = 0;
  return {
    next: () => ++generation,
    isCurrent: (value: number) => value === generation,
  };
}
