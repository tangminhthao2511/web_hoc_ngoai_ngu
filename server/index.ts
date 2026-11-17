import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { createAuth } from './auth';
import { readProgress, writeProgress } from './progress';
import { writeProgressSchema } from '../shared/progress';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== c.env.APP_ORIGIN) {
    return c.json({ error: 'Nguồn yêu cầu không hợp lệ.', code: 'INVALID_ORIGIN' }, 403);
  }
  await next();
});
app.use('/api/*', bodyLimit({ maxSize: 1_500_000, onError: c => c.json({ error: 'Dữ liệu quá lớn.', code: 'PAYLOAD_TOO_LARGE' }, 413) }));
app.get('/api/health', async c => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ ok: true });
});
app.get('/api/config', c => c.json({
  googleLogin: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
  aiEnabled: Boolean(c.env.AI_API_KEY && c.env.AI_MODEL && ['gemini', 'openai_compatible'].includes(c.env.AI_PROVIDER)),
}));
app.on(['GET', 'POST'], '/api/auth/*', c => createAuth(c.env).handler(c.req.raw));
app.use('/api/*', async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Vui lòng đăng nhập lại.', code: 'UNAUTHORIZED' }, 401);
  c.set('userId', session.user.id);
  await next();
});
app.get('/api/progress', async c => c.json(await readProgress(c.env.DB, c.get('userId'))));
app.put('/api/progress', async c => {
  const input = writeProgressSchema.safeParse(await c.req.json());
  if (!input.success) return c.json({ error: 'Dữ liệu học không hợp lệ.', code: 'INVALID_PROGRESS' }, 400);
  const result = await writeProgress(c.env.DB, c.get('userId'), input.data);
  if (!result.ok) return c.json({ error: 'Tiến độ đã thay đổi. Hãy tải bản đã lưu trước khi tiếp tục.', code: result.code }, 409);
  return c.json(result);
});
const tutorSchema = z.object({
  language: z.enum(['en', 'jp']), prompt: z.string().trim().min(1).max(4000), level: z.string().max(200),
});
app.post('/api/ai/tutor', async c => {
  const input = tutorSchema.safeParse(await c.req.json());
  if (!input.success) return c.json({ error: 'Câu hỏi không hợp lệ hoặc quá dài.', code: 'INVALID_PROMPT' }, 400);
  const { AI_API_KEY: key, AI_MODEL: model, AI_PROVIDER: provider } = c.env;
  if (!key || !model || !['gemini', 'openai_compatible'].includes(provider)) {
    return c.json({ error: 'Trợ lý AI chưa được bật.', code: 'AI_DISABLED' }, 503);
  }
  const quota = await c.env.DB.prepare(`INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 WHERE count < 30 RETURNING count`)
    .bind(c.get('userId'), new Date().toISOString().slice(0, 10)).first();
  if (!quota) return c.json({ error: 'Bạn đã dùng hết 30 lượt AI hôm nay.', code: 'AI_QUOTA' }, 429);
  const { language, prompt, level } = input.data;
  const system = language === 'en'
    ? `Bạn là trợ lý học tiếng Anh, giải thích bằng tiếng Việt cho học viên ${level}, hướng đến B2. Sửa lỗi và đưa 1–2 ví dụ tự nhiên.`
    : `Bạn là trợ lý học tiếng Nhật N5, giải thích bằng tiếng Việt cho học viên ${level}. Kèm Hiragana, Romaji và nghĩa tiếng Việt.`;
  try {
    const url = provider === 'gemini'
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      : 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(25_000),
      headers: { 'Content-Type': 'application/json', ...(provider === 'gemini' ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify(provider === 'gemini' ? {
        systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000 },
      } : { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_completion_tokens: 1000 }),
    });
    if (!response.ok) throw new Error('Upstream failure');
    // Bound buffering even if the external service returns an unexpected body.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 128_000) throw new Error('Response too large');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const reply = provider === 'gemini' ? data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') : data.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply) throw new Error('Empty reply');
    return c.json({ reply, modeUsed: 'live_api' as const });
  } catch {
    return c.json({ error: 'Không kết nối được trợ lý AI. Vui lòng thử lại sau.', code: 'AI_UNAVAILABLE' }, 502);
  }
});
app.notFound(c => c.json({ error: 'API không tồn tại.', code: 'NOT_FOUND' }, 404));
app.onError((error, c) => {
  if (error instanceof SyntaxError) return c.json({ error: 'JSON không hợp lệ.', code: 'INVALID_JSON' }, 400);
  const requestId = crypto.randomUUID();
  // Never log request bodies, cookies, upstream URLs or exception messages,
  // which may contain credentials or user notes.
  console.error(JSON.stringify({ event: 'api_error', requestId, type: error.name }));
  return c.json({ error: 'Không xử lý được yêu cầu.', code: 'INTERNAL_ERROR', requestId }, 500);
});
export default app;
