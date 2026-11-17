import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.APP_ORIGIN;
if (!origin || !/^https:\/\/[^/]+$/.test(origin) || !process.env.D1_DATABASE_ID || !process.env.CLOUDFLARE_WORKER_NAME) {
  console.error('Set APP_ORIGIN (HTTPS origin without a trailing slash), D1_DATABASE_ID and CLOUDFLARE_WORKER_NAME before deployment. See docs/backend.md.');
  process.exit(1);
}
const names = ['BETTER_AUTH_SECRET'];
if (process.env.GOOGLE_LOGIN_ENABLED === 'true') names.push('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET');
if (['gemini', 'openai_compatible'].includes(process.env.AI_PROVIDER)) names.push('AI_API_KEY');
const secrets = Object.fromEntries(names.filter(name => process.env[name]).map(name => [name, process.env[name]]));
if (secrets.BETTER_AUTH_SECRET && secrets.BETTER_AUTH_SECRET.trim().length < 32) {
  console.error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) console.error(`Unable to run ${command}: ${result.error.message}`);
  return result.status ?? 1;
}
const buildStatus = run('npm', ['run', 'build']);
if (buildStatus !== 0) process.exit(buildStatus);

let directory;
try {
  const args = ['cf', 'deploy', '--prebuilt'];
  if (Object.keys(secrets).length) {
    directory = mkdtempSync(join(tmpdir(), 'meowlanguage-secrets-'));
    const file = join(directory, 'secrets.json');
    // Only declared runtime secrets are uploaded. JSON preserves dollar signs
    // literally; mode 0600 restricts the temporary file to the current user.
    writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
    args.push('--secrets-file', file);
  }
  process.exitCode = run('npx', args);
} finally {
  if (directory) rmSync(directory, { recursive: true, force: true });
}
