// utils/db.js
// SQLite database (data/protobot.db by default). Schema changes are applied as
// numbered migrations tracked in PRAGMA user_version.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
	// 1: watchparty records
	`
	CREATE TABLE titles (
		id          INTEGER PRIMARY KEY,
		tmdb_id     INTEGER,
		media_type  TEXT,
		name        TEXT NOT NULL,
		year        INTEGER,
		genres      TEXT,
		runtime     INTEGER,
		imdb_id     TEXT,
		poster_url  TEXT,
		UNIQUE (media_type, tmdb_id)
	);

	CREATE TABLE watchparties (
		id                INTEGER PRIMARY KEY,
		guild_id          TEXT,
		channel_id        TEXT,
		voice_channel_id  TEXT,
		title_id          INTEGER REFERENCES titles(id),
		display_name      TEXT NOT NULL,
		url               TEXT,
		host_id           TEXT,
		host_tag          TEXT,
		started_at        TEXT,
		ended_at          TEXT,
		end_reason        TEXT,
		weekly_event_id   TEXT,
		source            TEXT NOT NULL DEFAULT 'live'
	);
	CREATE INDEX watchparties_active ON watchparties (channel_id) WHERE ended_at IS NULL;

	-- Raw join/leave spans while a party is live
	CREATE TABLE attendance_sessions (
		id         INTEGER PRIMARY KEY,
		party_id   INTEGER NOT NULL REFERENCES watchparties(id),
		user_id    TEXT NOT NULL,
		user_tag   TEXT,
		joined_at  TEXT NOT NULL,
		left_at    TEXT
	);
	CREATE INDEX attendance_open ON attendance_sessions (party_id, user_id) WHERE left_at IS NULL;

	-- Final per-person result, written when a party ends (or imported)
	CREATE TABLE party_attendees (
		party_id         INTEGER NOT NULL REFERENCES watchparties(id),
		user_id          TEXT,
		user_tag         TEXT,
		minutes          INTEGER,
		present_at_start INTEGER NOT NULL DEFAULT 0,
		present_at_end   INTEGER NOT NULL DEFAULT 0,
		watched          INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX party_attendees_party ON party_attendees (party_id);
	CREATE INDEX party_attendees_user ON party_attendees (user_id);
	`,
];

/**
 * Open a database and bring its schema up to date.
 * @param {string} filePath - path on disk, or ':memory:'
 * @returns {DatabaseSync}
 */
function openDb(filePath) {
	if (filePath !== ':memory:') fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const db = new DatabaseSync(filePath);
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

	const { user_version: version } = db.prepare('PRAGMA user_version').get();
	for (let i = version; i < MIGRATIONS.length; i++) {
		db.exec('BEGIN');
		try {
			db.exec(MIGRATIONS[i]);
			db.exec(`PRAGMA user_version = ${i + 1}`);
			db.exec('COMMIT');
		}
		catch (err) {
			db.exec('ROLLBACK');
			throw new Error(`Database migration ${i + 1} failed: ${err.message}`);
		}
	}
	return db;
}

let shared = null;

/** The bot's database (DB_PATH, default ./data/protobot.db). */
function getDb() {
	if (!shared) shared = openDb(process.env.DB_PATH || './data/protobot.db');
	return shared;
}

module.exports = { openDb, getDb };
