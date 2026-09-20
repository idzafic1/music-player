import test from 'node:test';
import assert from 'node:assert/strict';

type State = { active: Set<string>; failed: Set<string>; downloaded: Set<string> };
const start = (state: State, id: string) => state.active.has(id) ? state : { ...state, active: new Set(state.active).add(id) };
const cancel = (state: State, id: string) => {
  const active = new Set(state.active);
  active.delete(id);
  return { ...state, active };
};
const fail = (state: State, id: string) => ({ ...cancel(state, id), failed: new Set(state.failed).add(id) });
const succeed = (state: State, id: string) => {
  const next = cancel(state, id);
  const downloaded = new Set(next.downloaded);
  const failed = new Set(next.failed);
  downloaded.add(id);
  failed.delete(id);
  return { ...next, downloaded, failed };
};

test('duplicate downloads do not create duplicate active work', () => {
  const initial = { active: new Set<string>(), failed: new Set<string>(), downloaded: new Set<string>() };
  const once = start(initial, 'a');
  const twice = start(once, 'a');
  assert.deepEqual([...twice.active], ['a']);
});

test('cancellation cleans active state and retry can succeed', () => {
  const initial = { active: new Set<string>(), failed: new Set<string>(), downloaded: new Set<string>() };
  const cancelled = cancel(start(initial, 'a'), 'a');
  assert.equal(cancelled.active.has('a'), false);
  const retried = succeed(start(fail(initial, 'a'), 'a'), 'a');
  assert.equal(retried.downloaded.has('a'), true);
  assert.equal(retried.failed.has('a'), false);
});

test('playlist download continues remaining items when single track fails', () => {
  let state = { active: new Set<string>(), failed: new Set<string>(), downloaded: new Set<string>() };
  const items = ['track-1', 'track-2', 'track-3'];
  const failedTrack = 'track-2';

  for (const item of items) {
    state = start(state, item);
    if (item === failedTrack) {
      state = fail(state, item);
    } else {
      state = succeed(state, item);
    }
  }

  assert.equal(state.downloaded.has('track-1'), true);
  assert.equal(state.downloaded.has('track-2'), false);
  assert.equal(state.failed.has('track-2'), true);
  assert.equal(state.downloaded.has('track-3'), true);
});

