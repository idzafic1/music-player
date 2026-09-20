import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPerformRefresh, DEFAULT_MIN_REFRESH_INTERVAL_MS } from '../src/services/refreshPolicy.ts';

test('refresh policy: disallows refresh when offline', () => {
  const decision = shouldPerformRefresh({
    isOnline: false,
    isMetered: false,
    appState: 'active',
    isManual: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'offline');

  const manualDecision = shouldPerformRefresh({
    isOnline: false,
    isMetered: false,
    appState: 'active',
    isManual: true,
  });
  assert.equal(manualDecision.allowed, false);
  assert.equal(manualDecision.reason, 'offline');
});

test('refresh policy: disallows automatic refresh on metered connections', () => {
  const decision = shouldPerformRefresh({
    isOnline: true,
    isMetered: true,
    appState: 'active',
    isManual: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'metered_connection');
});

test('refresh policy: allows manual pull-to-refresh on metered connections', () => {
  const decision = shouldPerformRefresh({
    isOnline: true,
    isMetered: true,
    appState: 'active',
    isManual: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'manual');
});

test('refresh policy: disallows refresh when app is not in active state', () => {
  const bgDecision = shouldPerformRefresh({
    isOnline: true,
    isMetered: false,
    appState: 'background',
    isManual: false,
  });
  assert.equal(bgDecision.allowed, false);
  assert.equal(bgDecision.reason, 'app_not_active');

  const inactiveDecision = shouldPerformRefresh({
    isOnline: true,
    isMetered: false,
    appState: 'inactive',
    isManual: false,
  });
  assert.equal(inactiveDecision.allowed, false);
  assert.equal(inactiveDecision.reason, 'app_not_active');
});

test('refresh policy: throttles automatic refresh within minimum interval', () => {
  const now = 1000000;
  const recentRefresh = now - (DEFAULT_MIN_REFRESH_INTERVAL_MS - 1000); // 1 sec before threshold

  const decision = shouldPerformRefresh(
    {
      isOnline: true,
      isMetered: false,
      appState: 'active',
      isManual: false,
      lastRefreshedAt: recentRefresh,
    },
    now
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'throttled');
});

test('refresh policy: allows automatic refresh once minimum interval has elapsed or on initial load', () => {
  const now = 1000000;

  // Initial load (no previous refresh)
  const initialDecision = shouldPerformRefresh(
    {
      isOnline: true,
      isMetered: false,
      appState: 'active',
      isManual: false,
      lastRefreshedAt: null,
    },
    now
  );
  assert.equal(initialDecision.allowed, true);
  assert.equal(initialDecision.reason, 'policy_allowed');

  // Elapsed interval
  const pastRefresh = now - (DEFAULT_MIN_REFRESH_INTERVAL_MS + 1000);
  const elapsedDecision = shouldPerformRefresh(
    {
      isOnline: true,
      isMetered: false,
      appState: 'active',
      isManual: false,
      lastRefreshedAt: pastRefresh,
    },
    now
  );
  assert.equal(elapsedDecision.allowed, true);
  assert.equal(elapsedDecision.reason, 'policy_allowed');
});

test('refresh policy: manual refresh bypasses throttling', () => {
  const now = 1000000;
  const recentRefresh = now - 5000; // 5 seconds ago

  const decision = shouldPerformRefresh(
    {
      isOnline: true,
      isMetered: false,
      appState: 'active',
      isManual: true,
      lastRefreshedAt: recentRefresh,
    },
    now
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'manual');
});
