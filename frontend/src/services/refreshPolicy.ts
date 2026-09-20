export interface RefreshPolicyOptions {
  isOnline: boolean;
  isMetered: boolean;
  appState: string;
  isManual?: boolean;
  lastRefreshedAt?: number | null;
  minRefreshIntervalMs?: number;
}

export interface RefreshDecision {
  allowed: boolean;
  reason: 'offline' | 'metered_connection' | 'app_not_active' | 'throttled' | 'manual' | 'policy_allowed';
}

export const DEFAULT_MIN_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Determines whether a refresh operation is permitted according to connectivity,
 * network meter status, app lifecycle state, manual override, and throttling interval.
 */
export function shouldPerformRefresh(
  options: RefreshPolicyOptions,
  currentTimeMs: number = Date.now()
): RefreshDecision {
  if (!options.isOnline) {
    return { allowed: false, reason: 'offline' };
  }

  // Manual pull-to-refresh always proceeds when online, even if on metered network or recently refreshed
  if (options.isManual) {
    return { allowed: true, reason: 'manual' };
  }

  // Do not refresh if app is not in the active foreground
  if (options.appState !== 'active') {
    return { allowed: false, reason: 'app_not_active' };
  }

  // Skip automatic background refresh on metered connections (cellular / expensive network)
  if (options.isMetered) {
    return { allowed: false, reason: 'metered_connection' };
  }

  // Throttle automatic refreshes to prevent aggressive re-fetches on minor events/renders
  const minInterval = options.minRefreshIntervalMs ?? DEFAULT_MIN_REFRESH_INTERVAL_MS;
  if (options.lastRefreshedAt && currentTimeMs - options.lastRefreshedAt < minInterval) {
    return { allowed: false, reason: 'throttled' };
  }

  return { allowed: true, reason: 'policy_allowed' };
}
