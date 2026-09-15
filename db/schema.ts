import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
export const recordings = sqliteTable('recordings', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), name:text('name').notNull(),
 size:integer('size').notNull(), parts:integer('parts').notNull(), uploaded:integer('uploaded').notNull().default(0),
 state:text('state').notNull().default('uploading'), created:text('created').notNull(),
}, t=>[index('recordings_owner_created').on(t.owner,t.created)]);
export const documents = sqliteTable('documents', {
 id:text('id').primaryKey(), recording:text('recording').notNull(), kind:text('kind').notNull(),
 key:text('key').notNull(), content:text('content'), asrJson:text('asr_json'), created:text('created').notNull(),
}, t=>[index('documents_recording_kind').on(t.recording,t.kind)]);
export const chunks = sqliteTable('chunks', {id:text('id').primaryKey(),recording:text('recording').notNull(), ordinal:integer('ordinal').notNull(),offset:integer('offset').notNull(),state:text('state').notNull(),key:text('key').notNull(),result:text('result')}, t=>[index('chunks_recording').on(t.recording)]);

export const groqCredentials=sqliteTable('groq_credentials',{owner:text('owner').primaryKey(),encrypted:text('encrypted').notNull(),updated:text('updated').notNull()});

export const audioTasks=sqliteTable('audio_tasks',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),manifest:text('manifest').notNull(),
 prompt:text('prompt').notNull().default(''),state:text('state').notNull().default('uploading'),
 nextAttempt:integer('next_attempt').notNull().default(0),error:text('error'),created:integer('created').notNull(),
},t=>[index('audio_tasks_owner_due').on(t.owner,t.nextAttempt)]);
export const audioSegments=sqliteTable('audio_segments',{
 id:text('id').primaryKey(),task:text('task').notNull(),ordinal:integer('ordinal').notNull(),
 key:text('key').notNull(),sha256:text('sha256').notNull(),bytes:integer('bytes').notNull(),
 durationMs:integer('duration_ms').notNull(),offsetMs:integer('offset_ms').notNull(),
 state:text('state').notNull().default('missing'),result:text('result'),attempts:integer('attempts').notNull().default(0),
},t=>[index('audio_segments_task').on(t.task,t.ordinal)]);
export const audioQuotaEvents=sqliteTable('audio_quota_events',{
 id:text('id').primaryKey(),created:integer('created').notNull(),seconds:integer('seconds').notNull(),
},t=>[index('audio_quota_time').on(t.created)]);
export const audioQueueLock=sqliteTable('audio_queue_lock',{
 id:text('id').primaryKey(),token:text('token').notNull().default(''),until:integer('until').notNull().default(0),
 blockedUntil:integer('blocked_until').notNull().default(0),
});

export const audioGlossary=sqliteTable("audio_glossary",{owner:text("owner").notNull(),term:text("term").notNull(),aliases:text("aliases").notNull(),reference:text("reference").notNull(),updated:text("updated").notNull()},t=>[primaryKey({columns:[t.owner,t.term]})]);
export const audioActions=sqliteTable("audio_actions",{id:text("id").primaryKey(),recording:text("recording").notNull().references(()=>recordings.id),payload:text("payload").notNull(),updated:text("updated").notNull()});
