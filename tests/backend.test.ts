import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import app from '../server/index';
import { createInitialState } from '../src/context/LearningContext';
import { compactProgress } from '../src/services/progressSync';

const origin = 'http://localhost:5173';
let mf: Miniflare;
let env: Env;
let cookieA: string;
let cookieB: string;
const call = (path: string, method = 'GET', body?: unknown, cookie?: string) => app.request(origin + path, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
}, env);

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'], compatibilityDate: '2026-11-17' }));
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('migrations').filter(file => file.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint').filter(sql => sql.trim())) {
      await db.prepare(sql).run();
    }
  }
  env = { DB: db, APP_ORIGIN: origin, BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-32-characters', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', AI_API_KEY: '', AI_PROVIDER: 'demo', AI_MODEL: '' };
  for (const [email, assign] of [['a@example.com', (cookie: string) => { cookieA = cookie; }], ['b@example.com', (cookie: string) => { cookieB = cookie; }]] as const) {
    const response = await call('/api/auth/sign-up/email', 'POST', { email, name: 'Test learner', password: 'Password-for-tests-42!', preferredLanguage: 'jp' });
    expect(response.status, await response.clone().text()).toBe(200);
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    expect(cookie).toContain('session_token');
    expect(response.headers.getSetCookie().some(value => /httponly/i.test(value))).toBe(true);
    assign(cookie);
  }
});
afterAll(async () => { await mf?.dispose(); });

describe('Worker API with real D1 simulation and Better Auth', () => {
  it('requires a real session and rejects cross-origin mutations', async () => {
    expect((await call('/api/progress')).status).toBe(401);
    const response = await app.request(origin + '/api/progress', { method: 'PUT', headers: { Origin: 'https://other.example', Cookie: cookieA }, body: '{}' }, env);
    expect(response.status).toBe(403);
  });
  it('preserves the preferred language in authenticated sessions', async () => {
    const response = await call('/api/auth/get-session', 'GET', undefined, cookieA);
    expect((await response.json()).user.preferredLanguage).toBe('jp');
  });
  it('saves normalized records, strips credentials and makes retry idempotent', async () => {
    const state = compactProgress(createInitialState());
    state.xp = 42;
    state.settings.aiConfig.apiKey = 'should-never-be-stored';
    const payload = { state, revision: 0, mutationId: crypto.randomUUID(), importLegacy: true };
    const first = await call('/api/progress', 'PUT', payload, cookieA);
    expect(first.status, await first.clone().text()).toBe(200);
    expect((await first.json()).revision).toBe(1);
    expect((await (await call('/api/progress', 'PUT', payload, cookieA)).json()).revision).toBe(1);
    const result = await (await call('/api/progress', 'GET', undefined, cookieA)).json();
    expect(result.state.xp).toBe(42);
    expect(result.state.settings.aiConfig.apiKey).toBe('');
    expect(result.state.notes).toHaveLength(1);
    const stored = await env.DB.prepare('SELECT summary FROM learning_head').all();
    expect(JSON.stringify(stored)).not.toContain('should-never-be-stored');
    const other = await (await call('/api/progress', 'GET', undefined, cookieB)).json();
    expect(other.state).toBeNull();
    const stale = await call('/api/progress', 'PUT', { ...payload, mutationId: crypto.randomUUID(), state: { ...state, xp: 100 } }, cookieA);
    expect(stale.status).toBe(409);
    expect((await (await call('/api/progress', 'GET', undefined, cookieA)).json()).state.xp).toBe(42);
    const duplicateImport = await call('/api/progress', 'PUT', { ...payload, revision: 1, mutationId: crypto.randomUUID() }, cookieA);
    expect(duplicateImport.status).toBe(409);
  });
  it('allows exactly one concurrent writer and preserves all winning records', async () => {
    const base = compactProgress(createInitialState());
    const responses = await Promise.all([100, 200].map(xp => call('/api/progress', 'PUT', {
      state: { ...base, xp, notes: [{ ...base.notes[0], title: `winner-${xp}` }] },
      revision: 1, mutationId: crypto.randomUUID(),
    }, cookieA)));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const saved = await (await call('/api/progress', 'GET', undefined, cookieA)).json();
    expect(saved.revision).toBe(2);
    expect(saved.state.notes[0].title).toBe(`winner-${saved.state.xp}`);
  });
  it('validates imports and returns JSON for unknown API paths', async () => {
    expect((await call('/api/progress', 'PUT', { state: { xp: 1 } }, cookieA)).status).toBe(400);
    const response = await call('/api/missing', 'GET', undefined, cookieA);
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });
  it('reports disabled AI and invalidates the session on logout', async () => {
    expect((await call('/api/ai/tutor', 'POST', { language: 'en', prompt: 'Hello', level: 'B1' }, cookieB)).status).toBe(503);
    expect((await call('/api/auth/sign-out', 'POST', {}, cookieB)).status).toBe(200);
    expect((await call('/api/progress', 'GET', undefined, cookieB)).status).toBe(401);
  });
});
