import type { UserState } from '../types';
import type { AuthUserSession } from '../utils/auth';
import { INITIAL_VOCAB_ITEMS } from '../data/initialVocab';
import { sanitizeProgress, type ProgressResponse } from '../../shared/progress';
import { apiRequest, ApiError } from './api';

export const LEGACY_KEY = 'manabi_learning_platform_v1';
export const GUEST_PROGRESS_KEY = 'manabi_progress_v2:guest-local';
function vocabFingerprint(item: UserState['vocabItems'][number]) {
  return JSON.stringify(Object.entries(item).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
}
const builtinVocab = new Map(INITIAL_VOCAB_ITEMS.map(item => [item.id, vocabFingerprint(item)]));
export function compactProgress(state: UserState): UserState {
  const clean = sanitizeProgress(state);
  return { ...clean, vocabItems: clean.vocabItems.filter(item => vocabFingerprint(item) !== builtinVocab.get(item.id)) };
}
interface Pending { state: UserState; revision: number; mutationId: string; importLegacy: boolean }
interface Cache {
  state: UserState; revision: number; acknowledged: string | null; pending: Pending | null; imported: boolean; importing: boolean;
}
export interface SyncSnapshot {
  state: UserState; ready: boolean; status: 'loading' | 'local' | 'saved' | 'saving' | 'error' | 'conflict';
  error: string; imported: boolean;
}

// Serialize writes and persist the exact pending request before sending it. A
// lost response can then be retried with the same id, even after a page reload.
export class ProgressSync {
  private cache: Cache;
  private snapshot: SyncSnapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private active = false;
  private loading: Promise<void> | null = null;
  private readonly key: string;
  constructor(
    private session: AuthUserSession,
    private initial: () => UserState,
    private hydrate: (state: UserState) => UserState,
    private storage: Storage = localStorage,
    private request: typeof apiRequest = apiRequest,
  ) {
    this.key = `manabi_progress_v2:${session.userId}`;
    this.cache = { state: initial(), revision: 0, acknowledged: null, pending: null, imported: false, importing: false };
    try {
      const saved = JSON.parse(storage.getItem(this.key) || 'null') as Cache | null;
      if (saved && Number.isInteger(saved.revision) && saved.revision >= 0) {
        this.cache = { ...saved, state: hydrate(sanitizeProgress(saved.state)), pending: saved.pending
          ? { ...saved.pending, state: sanitizeProgress(saved.pending.state) } : null };
      }
    } catch { /* A corrupt cache is ignored; the server remains recoverable. */ }
    this.snapshot = { state: this.cache.state, ready: Boolean(session.isGuest), status: session.isGuest ? 'local' : 'loading', error: '', imported: this.cache.imported };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(status: SyncSnapshot['status'], error = '', ready = this.snapshot.ready) {
    this.snapshot = { state: this.cache.state, status, error, ready, imported: this.cache.imported };
    this.listeners.forEach(listener => listener());
  }
  private persist() {
    try { this.storage.setItem(this.key, JSON.stringify(this.cache)); return true; }
    catch { this.publish('error', 'Không lưu được bản sao trên thiết bị. Hãy xuất backup trước khi đóng trang.'); return false; }
  }
  private serialized() { return JSON.stringify(compactProgress(this.cache.state)); }
  private sessionError(error: unknown) {
    if (this.active && error instanceof ApiError && error.status === 401) {
      window.dispatchEvent(new Event('manabi:session-expired'));
    }
  }
  private dirty() { return this.serialized() !== this.cache.acknowledged || this.cache.importing; }
  start = () => {
    this.active = true;
    if (this.session.isGuest) return Promise.resolve();
    if (!this.loading) this.loading = this.pull().finally(() => { this.loading = null; });
    return this.loading;
  };
  stop = () => { this.active = false; clearTimeout(this.timer); };
  private schedule() {
    clearTimeout(this.timer);
    if (this.active && !this.session.isGuest && this.snapshot.status !== 'conflict') {
      this.timer = setTimeout(() => { void this.flush(); }, 800);
    }
  }
  update = (update: UserState | ((previous: UserState) => UserState)) => {
    if (!this.snapshot.ready) return;
    this.cache.state = sanitizeProgress(typeof update === 'function' ? update(this.cache.state) : update);
    this.publish(this.session.isGuest ? 'local' : this.snapshot.status === 'conflict' ? 'conflict' : 'saving', this.snapshot.status === 'conflict' ? this.snapshot.error : '');
    if (this.persist()) this.schedule();
  };
  private async pull() {
    try {
      const remote = await this.request<ProgressResponse>('/api/progress');
      if (!this.active) return;
      if (this.cache.pending && remote.mutationId === this.cache.pending.mutationId) {
        this.cache.acknowledged = JSON.stringify(this.cache.pending.state);
        this.cache.pending = null;
        this.cache.revision = remote.revision;
        this.cache.importing = false;
        this.cache.imported = remote.imported;
      } else if ((this.cache.pending || this.cache.acknowledged !== null && this.dirty()) && remote.revision !== this.cache.revision) {
        this.publish('conflict', 'Tiến độ trên tài khoản đã thay đổi. Xuất bản sao thiết bị trước khi tải bản trên tài khoản.', true);
        return;
      } else if (!this.cache.pending && !(this.cache.acknowledged !== null && this.dirty())) {
        this.cache.state = this.hydrate(remote.state || this.initial());
        this.cache.revision = remote.revision;
        this.cache.acknowledged = this.serialized();
        this.cache.imported = remote.imported;
      }
      this.publish(this.dirty() ? 'saving' : 'saved', '', true);
      if (this.persist() && this.dirty()) this.schedule();
    } catch (error) {
      this.sessionError(error);
      if (this.active) this.publish('error', error instanceof Error ? error.message : 'Không tải được tiến độ.');
    }
  }
  flush = async () => {
    if (this.busy || !this.active || this.session.isGuest || !this.snapshot.ready || this.snapshot.status === 'conflict') return;
    if (!this.cache.pending && !this.dirty()) { this.publish('saved'); return; }
    this.busy = true;
    this.cache.pending ||= { state: compactProgress(this.cache.state), revision: this.cache.revision, mutationId: crypto.randomUUID(), importLegacy: this.cache.importing };
    const pending = this.cache.pending;
    this.publish('saving');
    if (!this.persist()) { this.busy = false; return; }
    try {
      const result = await this.request<{ revision: number; imported: boolean }>('/api/progress', { method: 'PUT', body: JSON.stringify(pending) });
      this.cache.revision = result.revision;
      this.cache.acknowledged = JSON.stringify(pending.state);
      this.cache.imported = result.imported;
      this.cache.importing = false;
      this.cache.pending = null;
      this.publish(this.dirty() ? 'saving' : 'saved');
      this.persist();
      if (this.dirty()) this.schedule();
    } catch (error) {
      this.sessionError(error);
      this.publish(error instanceof ApiError && error.status === 409 ? 'conflict' : 'error', error instanceof Error ? error.message : 'Lưu thất bại. Bản sao vẫn còn trên thiết bị.');
    } finally { this.busy = false; }
  };
  retry = async () => {
    if (!this.snapshot.ready) return this.start();
    if (this.cache.pending || this.dirty()) return this.flush();
    if (!this.busy) return this.start();
  };
  reloadRemote = async () => {
    if (this.busy) return;
    // Preserve the losing edits for recovery before accepting the other device.
    try { this.storage.setItem(`${this.key}:conflict-backup`, JSON.stringify(this.cache.state)); }
    catch { this.publish('error', 'Không tạo được backup. Hãy xuất dữ liệu trước khi tải lại.'); return; }
    this.busy = true;
    try {
      const remote = await this.request<ProgressResponse>('/api/progress');
      if (!this.active) return;
      this.cache = { state: this.hydrate(remote.state || this.initial()), revision: remote.revision,
        acknowledged: null, pending: null, imported: remote.imported, importing: false };
      this.cache.acknowledged = this.serialized();
      this.publish('saved', '', true);
      if (this.persist() && this.dirty()) this.schedule();
    } catch (error) { this.publish('error', error instanceof Error ? error.message : 'Không tải được tiến độ.'); }
    finally { this.busy = false; }
  };
  hasLegacy = () => Boolean(this.storage.getItem(LEGACY_KEY));
  importLegacy = () => {
    if (this.cache.imported || this.cache.pending || this.busy || this.snapshot.status === 'conflict' || !this.snapshot.ready) return false;
    try {
      const raw = this.storage.getItem(LEGACY_KEY);
      if (!raw) return false;
      const state = this.hydrate(sanitizeProgress(JSON.parse(raw)));
      this.cache.importing = true;
      this.update(state);
      return true;
    } catch { return false; }
  };
}
