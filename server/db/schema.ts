import { integer, sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false), image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  preferredLanguage: text('preferred_language').notNull().default('en'),
});
export const session = sqliteTable('session', {
  id: text('id').primaryKey(), token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
}, table => [index('session_user_idx').on(table.userId)]);
export const account = sqliteTable('account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }), scope: text('scope'), password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [index('account_user_idx').on(table.userId)]);
export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [index('verification_identifier_idx').on(table.identifier)]);
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: integer('last_request').notNull(),
});

export const learningHead = sqliteTable('learning_head', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0), mutationId: text('mutation_id'),
  imported: integer('imported', { mode: 'boolean' }).notNull().default(false),
  summary: text('summary').notNull(), updatedAt: integer('updated_at').notNull(),
});
// One row per user-owned entity. JSON holds the domain fields so curriculum
// additions do not require copying static lesson content into the database.
export const learningRecord = sqliteTable('learning_record', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), id: text('id').notNull(), data: text('data').notNull(), position: integer('position').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.kind, table.id] })]);
export const aiUsage = sqliteTable('ai_usage', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  day: text('day').notNull(), count: integer('count').notNull().default(0),
}, table => [primaryKey({ columns: [table.userId, table.day] })]);
