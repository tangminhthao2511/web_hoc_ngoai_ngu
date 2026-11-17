import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, hydrateLearningState } from '../src/context/LearningContext';
import { compactProgress, LEGACY_KEY, ProgressSync } from '../src/services/progressSync';
import { apiRequest, ApiError } from '../src/services/api';
import { sanitizeProgress, type ProgressResponse } from '../shared/progress';
import type { AuthUserSession } from '../src/utils/auth';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const controllers: ProgressSync[] = [];
afterEach(() => { controllers.forEach(controller => controller.stop()); controllers.length = 0; });
function setup() {
  const storage = new MemoryStorage();
  let remote: ProgressResponse = { state: null, revision: 0, mutationId: null, imported: false };
  let loseResponse = false;
  let offline = false;
  const writes: string[] = [];
  const request: typeof apiRequest = async <T>(_path: string, init?: RequestInit) => {
    if (offline) throw new Error('offline');
    if (init?.method !== 'PUT') return structuredClone(remote) as T;
    const input = JSON.parse(String(init.body));
    writes.push(input.mutationId);
    if (input.mutationId !== remote.mutationId) {
      if (input.revision !== remote.revision) throw new ApiError('conflict', 409);
      remote = { state: sanitizeProgress(input.state), revision: remote.revision + 1, mutationId: input.mutationId, imported: remote.imported || input.importLegacy };
    }
    if (loseResponse) { loseResponse = false; throw new Error('response lost'); }
    return { revision: remote.revision, imported: remote.imported } as T;
  };
  function controller(userId = 'a', isGuest = false) {
    const session: AuthUserSession = { userId, name: userId, email: `${userId}@example.com`, preferredLanguage: 'en', loggedInAt: '', isGuest };
    const value = new ProgressSync(session, createInitialState, hydrateLearningState, storage, request);
    controllers.push(value);
    return value;
  }
  return { storage, controller, writes, get remote() { return remote; }, set remote(value) { remote = value; },
    loseNextResponse: () => { loseResponse = true; }, setOffline: (value: boolean) => { offline = value; } };
}

describe('progress persistence and recovery', () => {
  it('omits unmodified built-in vocabulary and strips old credentials', () => {
    const state = createInitialState();
    state.settings.aiConfig.apiKey = 'private-key';
    state.settings.aiConfig.endpoint = 'https://old-provider.example?key=secret';
    expect(compactProgress(state).vocabItems).toHaveLength(0);
    expect(JSON.stringify(compactProgress(state))).not.toContain('private-key');
    expect(JSON.stringify(compactProgress(state))).not.toContain('key=secret');
    state.vocabItems = state.vocabItems.map((item, i) => i === 0 ? { ...item, repetitions: 1 } : item);
    expect(compactProgress(state).vocabItems).toHaveLength(1);
  });
  it('blocks writes before the initial read and keeps guest changes local', async () => {
    const test = setup();
    const controller = test.controller();
    controller.update(state => ({ ...state, xp: 999 }));
    expect(controller.getSnapshot().state.xp).toBe(0);
    const guest = test.controller('guest-local', true);
    await guest.start();
    guest.update(state => ({ ...state, xp: 9 }));
    await guest.flush();
    expect(test.writes).toHaveLength(0);
    expect(test.storage.getItem('manabi_progress_v2:guest-local')).toContain('"xp":9');
  });
  it('retries a lost response using the original id without duplicating the write', async () => {
    const test = setup();
    const controller = test.controller();
    await controller.start();
    controller.update(state => ({ ...state, xp: 10 }));
    test.loseNextResponse();
    await controller.flush();
    expect(controller.getSnapshot().status).toBe('error');
    await controller.retry();
    expect(test.remote.revision).toBe(1);
    expect(test.writes[0]).toBe(test.writes[1]);
    expect(controller.getSnapshot().status).toBe('saved');
  });
  it('preserves edits made after a lost response across a page reload', async () => {
    const test = setup();
    const controller = test.controller();
    await controller.start();
    controller.update(state => ({ ...state, xp: 10 }));
    test.loseNextResponse();
    await controller.flush();
    controller.update(state => ({ ...state, xp: 20 }));
    controller.stop();
    const reloaded = test.controller();
    await reloaded.start();
    expect(reloaded.getSnapshot().state.xp).toBe(20);
    await reloaded.flush();
    expect(test.remote.state?.xp).toBe(20);
    expect(test.remote.revision).toBe(2);
  });
  it('keeps an edit made before the debounce fires across a reload', async () => {
    const test = setup();
    const controller = test.controller();
    await controller.start();
    controller.update(state => ({ ...state, xp: 31 }));
    controller.stop();
    const reloaded = test.controller();
    await reloaded.start();
    expect(reloaded.getSnapshot().state.xp).toBe(31);
    await reloaded.flush();
    expect(test.remote.state?.xp).toBe(31);
  });
  it('preserves offline edits and isolates account caches', async () => {
    const test = setup();
    const controller = test.controller();
    await controller.start();
    controller.update(state => ({ ...state, xp: 12 }));
    test.setOffline(true);
    await controller.flush();
    controller.stop();
    test.setOffline(false);
    expect(test.controller('b').getSnapshot().state.xp).toBe(0);
    const reloaded = test.controller();
    await reloaded.start();
    await reloaded.flush();
    expect(test.remote.state?.xp).toBe(12);
  });
  it('detects a competing edit and backs up the local version before loading remote', async () => {
    const test = setup();
    const controller = test.controller();
    await controller.start();
    controller.update(state => ({ ...state, xp: 12 }));
    test.remote = { state: { ...createInitialState(), xp: 99 }, revision: 1, mutationId: crypto.randomUUID(), imported: false };
    await controller.flush();
    expect(controller.getSnapshot().status).toBe('conflict');
    expect(controller.getSnapshot().state.xp).toBe(12);
    await controller.reloadRemote();
    expect(controller.getSnapshot().state.xp).toBe(99);
    expect(JSON.parse(test.storage.getItem('manabi_progress_v2:a:conflict-backup')!).xp).toBe(12);
  });
  it('imports old device progress only after an explicit action and only once', async () => {
    const test = setup();
    test.storage.setItem(LEGACY_KEY, JSON.stringify({ ...createInitialState(), xp: 88 }));
    const controller = test.controller();
    await controller.start();
    expect(controller.getSnapshot().state.xp).toBe(0);
    expect(controller.importLegacy()).toBe(true);
    await controller.flush();
    expect(test.remote.state?.xp).toBe(88);
    expect(controller.importLegacy()).toBe(false);
    expect(test.storage.getItem(LEGACY_KEY)).not.toBeNull();
  });
});
