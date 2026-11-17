import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function deploy(options: { secret?: string; failUpload?: boolean; google?: boolean; ai?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'meowlanguage-deploy-test-'));
  directories.push(directory);
  const report = join(directory, 'report.json');
  const stub = `#!${process.execPath}
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'run') process.exit(0);
const index = args.indexOf('--secrets-file');
if (process.env.DEPLOY_EXPECT_SECRET === 'true' && index === -1) {
  console.error('The following required secrets have not been set: BETTER_AUTH_SECRET');
  process.exit(1);
}
const path = index === -1 ? null : args[index + 1];
const values = path ? JSON.parse(readFileSync(path, 'utf8')) : {};
writeFileSync(process.env.DEPLOY_TEST_REPORT, JSON.stringify({ path, keys: Object.keys(values),
  matches: !path || values.BETTER_AUTH_SECRET === process.env.BETTER_AUTH_SECRET,
  permissions: path ? statSync(path).mode & 0o777 : null, args }));
process.exit(process.env.DEPLOY_TEST_FAIL === 'true' ? 1 : 0);
`;
  for (const command of ['npm', 'npx']) writeFileSync(join(directory, command), stub, { mode: 0o700 });
  const env = { ...process.env };
  for (const name of ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AI_API_KEY']) delete env[name];
  Object.assign(env, {
    PATH: directory + ':' + process.env.PATH,
    CLOUDFLARE_WORKER_NAME: 'test-worker', APP_ORIGIN: 'https://test.example', D1_DATABASE_ID: 'test-database',
    GOOGLE_LOGIN_ENABLED: String(Boolean(options.google)), AI_PROVIDER: options.ai ? 'gemini' : 'demo',
    GOOGLE_CLIENT_ID: 'test-only-id', GOOGLE_CLIENT_SECRET: 'test-only-google-secret', AI_API_KEY: 'test-only-ai-key',
    DEPLOY_TEST_REPORT: report, DEPLOY_TEST_FAIL: String(Boolean(options.failUpload)),
    DEPLOY_EXPECT_SECRET: String(Boolean(options.secret)),
  });
  if (options.secret !== undefined) env.BETTER_AUTH_SECRET = options.secret;
  const result = spawnSync(process.execPath, [resolve('scripts/deploy.mjs')], { env, encoding: 'utf8' });
  return { result, report: existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null };
}
const secret = 'test-only-generated-auth-secret-1234567890';

describe('deploying secrets loaded from an env file', () => {
  it('uploads the auth secret with the version, without configuration variables or disabled provider keys', () => {
    const { result, report } = deploy({ secret });
    expect(result.status, result.stderr).toBe(0);
    expect(report.keys).toEqual(['BETTER_AUTH_SECRET']);
    expect(report.matches).toBe(true);
    expect(report.permissions).toBe(0o600);
    expect(existsSync(report.path)).toBe(false);
    expect(result.stdout + result.stderr).not.toContain(secret);
  });
  it('preserves existing remote secrets if local values are omitted', () => {
    const { result, report } = deploy();
    expect(result.status, result.stderr).toBe(0);
    expect(report.path).toBeNull();
  });
  it('uploads optional provider secrets only when enabled', () => {
    const { result, report } = deploy({ secret, google: true, ai: true });
    expect(result.status, result.stderr).toBe(0);
    expect(report.keys).toEqual(['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AI_API_KEY']);
  });
  it('cleans up the secrets file when upload fails', () => {
    const { result, report } = deploy({ secret, failUpload: true });
    expect(result.status).toBe(1);
    expect(report).not.toBeNull();
    expect(existsSync(report.path)).toBe(false);
  });
  it('rejects a short auth secret without exposing its value', () => {
    const { result } = deploy({ secret: 'short-test-secret' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('BETTER_AUTH_SECRET');
    expect(result.stderr).not.toContain('short-test-secret');
  });
});
