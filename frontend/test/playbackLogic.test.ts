import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCallbackGuard,
  createProgressReporter,
  playlistProgress,
  QualifyingPlayTracker,
  resolvePlaybackUri,
} from '../src/services/playbackLogic.ts';

test('progress is clamped, monotonic, and starts at zero', () => {
  const values: number[] = [];
  const report = createProgressReporter((value) => values.push(value));
  report(0);
  report(0.4);
  report(0.2);
  report(2);
  report(-1);
  assert.deepEqual(values, [0, 0.4, 0.4, 1, 1]);
});

test('playlist progress includes completed and current item', () => {
  assert.equal(playlistProgress(0, 0, 3), 0);
  assert.equal(playlistProgress(1, 0.5, 3), 0.5);
  assert.equal(playlistProgress(3, 1, 3), 1);
});

test('local URI wins over every remote source', () => {
  assert.equal(
    resolvePlaybackUri('file:///song.m4a', 'https://server/song', 'http://api', '1'),
    'file:///song.m4a',
  );
  assert.equal(resolvePlaybackUri(null, '/stream', 'http://api', '1'), 'http://api/stream');
});

test('qualifying play pauses and resumes, then resets for a new song', () => {
  const tracker = new QualifyingPlayTracker();
  tracker.reset();
  assert.equal(tracker.tick(true, 1), false);
  assert.equal(tracker.tick(true, 1001), false);
  assert.equal(tracker.tick(false, 2001), false);
  for (let second = 3; second <= 17; second += 1) {
    assert.equal(tracker.tick(true, second * 1000 + 1), second === 17);
  }
  assert.equal(tracker.tick(true, 16001), false);
  tracker.reset();
  assert.equal(tracker.tick(true, 1), false);
  assert.equal(tracker.tick(true, 1001), false);
});

test('stale callbacks are rejected after a song switch', () => {
  const guard = createCallbackGuard();
  const first = guard.next();
  const second = guard.next();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});
