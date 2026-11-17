import { bindings, defineConfig } from 'cf/config';

export default defineConfig(({ mode }) => {
  const production = mode === 'production';
  const googleEnabled = process.env.GOOGLE_LOGIN_ENABLED === 'true';
  const aiEnabled = ['gemini', 'openai_compatible'].includes(process.env.AI_PROVIDER || '');
  return {
    worker: {
      name: process.env.CLOUDFLARE_WORKER_NAME || (production ? 'meowlanguage' : 'meowlanguage-staging'),
      entrypoint: './server/index.ts',
      compatibilityDate: '2026-11-17',
      compatibilityFlags: ['nodejs_compat'],
      assets: { notFoundHandling: 'single-page-application', runWorkerFirst: ['/api/*'] },
      env: {
        DB: bindings.d1({
          name: production ? 'meowlanguage-production' : 'meowlanguage-development',
          id: process.env.D1_DATABASE_ID || (mode === 'development' ? '11111111-1111-4111-8111-111111111111' : undefined),
        }),
        APP_ORIGIN: bindings.text(process.env.APP_ORIGIN || 'http://localhost:5173'),
        BETTER_AUTH_SECRET: bindings.secret(),
        GOOGLE_CLIENT_ID: googleEnabled ? bindings.secret() : bindings.text(''),
        GOOGLE_CLIENT_SECRET: googleEnabled ? bindings.secret() : bindings.text(''),
        AI_API_KEY: aiEnabled ? bindings.secret() : bindings.text(''),
        AI_PROVIDER: bindings.text(process.env.AI_PROVIDER || 'demo'),
        AI_MODEL: bindings.text(process.env.AI_MODEL || ''),
      },
      observability: {
        enabled: true,
        redactQueryString: true,
        logs: { enabled: true, headSamplingRate: 1 },
        traces: { enabled: true, headSamplingRate: 0.01 },
      },
    },
  };
});
