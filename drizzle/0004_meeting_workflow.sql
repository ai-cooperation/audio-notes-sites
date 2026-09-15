CREATE TABLE audio_glossary (owner TEXT NOT NULL, term TEXT NOT NULL, aliases TEXT NOT NULL, reference TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(owner,term));
--> statement-breakpoint
CREATE TABLE audio_actions (id TEXT PRIMARY KEY NOT NULL, recording TEXT NOT NULL REFERENCES recordings(id), payload TEXT NOT NULL, updated TEXT NOT NULL);
