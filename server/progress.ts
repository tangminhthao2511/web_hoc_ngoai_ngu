import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { learningHead, learningRecord } from './db/schema';
import { COLLECTIONS, splitProgress, sanitizeProgress, type ProgressResponse, type writeProgressSchema } from '../shared/progress';
import type { z } from 'zod';

export async function readProgress(db: D1Database, userId: string): Promise<ProgressResponse> {
  const orm = drizzle(db);
  const [heads, records] = await orm.batch([
    orm.select().from(learningHead).where(eq(learningHead.userId, userId)),
    orm.select().from(learningRecord).where(eq(learningRecord.userId, userId)).orderBy(learningRecord.position),
  ]);
  const head = heads[0];
  if (!head) return { state: null, revision: 0, mutationId: null, imported: false };
  const data = JSON.parse(head.summary);
  for (const kind of COLLECTIONS) {
    const items = records.filter(record => record.kind === kind);
    data[kind] = ['lessonProgress', 'studyLogs'].includes(kind)
      ? Object.fromEntries(items.map(record => [record.id, JSON.parse(record.data)]))
      : items.map(record => JSON.parse(record.data));
  }
  return { state: sanitizeProgress(data), revision: head.revision, mutationId: head.mutationId, imported: head.imported };
}

export async function writeProgress(db: D1Database, userId: string, input: z.infer<typeof writeProgressSchema>) {
  const current = await readProgress(db, userId);
  if (current.mutationId === input.mutationId) return { ok: true as const, revision: current.revision, imported: current.imported };
  if (current.revision !== input.revision) return { ok: false as const, code: 'CONFLICT' };
  if (input.importLegacy && current.imported) return { ok: false as const, code: 'ALREADY_IMPORTED' };
  const { summary, collections } = splitProgress(input.state);
  const revision = input.revision + 1;
  const imported = current.imported || input.importLegacy;
  const statements = [db.prepare(`
    INSERT INTO learning_head (user_id, revision, mutation_id, imported, summary, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ?7 = 0 OR EXISTS (SELECT 1 FROM learning_head WHERE user_id = ?1)
    ON CONFLICT(user_id) DO UPDATE SET revision = ?2, mutation_id = ?3,
      imported = ?4, summary = ?5, updated_at = ?6 WHERE learning_head.revision = ?7
    RETURNING revision
  `)
    .bind(userId, revision, input.mutationId, Number(imported), JSON.stringify(summary), Date.now(), input.revision)];
  // D1 batch is atomic. Every entity statement is gated on the CAS result so a
  // concurrent stale writer cannot overwrite or delete another device's rows.
  for (const kind of COLLECTIONS) {
    const rows = JSON.stringify(collections[kind]);
    const guard = 'EXISTS (SELECT 1 FROM learning_head WHERE user_id = ?1 AND revision = ?4 AND mutation_id = ?5)';
    statements.push(db.prepare(`DELETE FROM learning_record WHERE user_id = ?1 AND kind = ?2 AND ${guard}
      AND id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?3))`)
      .bind(userId, kind, rows, revision, input.mutationId));
    statements.push(db.prepare(`INSERT INTO learning_record (user_id, kind, id, data, position)
      SELECT ?1, ?2, json_extract(value, '$.id'), json_extract(value, '$.data'), CAST(key AS INTEGER)
      FROM json_each(?3) WHERE ${guard}
      ON CONFLICT(user_id, kind, id) DO UPDATE SET data = excluded.data, position = excluded.position
      WHERE learning_record.data != excluded.data OR learning_record.position != excluded.position`)
      .bind(userId, kind, rows, revision, input.mutationId));
  }
  const results = await db.batch(statements);
  if (!results[0].results.length) {
    const latest = await readProgress(db, userId);
    if (latest.mutationId === input.mutationId) return { ok: true as const, revision: latest.revision, imported: latest.imported };
    return { ok: false as const, code: 'CONFLICT' };
  }
  return { ok: true as const, revision, imported };
}
