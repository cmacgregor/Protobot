// utils/watchpartyStore.js
// Queries for titles, watchparties and attendance. All times are ISO strings.

/**
 * Insert or update a title. TMDB titles are matched on (media_type, tmdb_id);
 * titles TMDB didn't know are matched on name.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{tmdbId?: number|null, mediaType?: string|null, name: string, year?: number|null,
 *   genres?: string|null, runtime?: number|null, imdbId?: string|null, posterUrl?: string|null}} t
 * @returns {number} title id
 */
function upsertTitle(db, t) {
	if (t.tmdbId) {
		const row = db.prepare(`
			INSERT INTO titles (tmdb_id, media_type, name, year, genres, runtime, imdb_id, poster_url)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (media_type, tmdb_id) DO UPDATE SET
				name = excluded.name,
				year = COALESCE(excluded.year, year),
				genres = COALESCE(excluded.genres, genres),
				runtime = COALESCE(excluded.runtime, runtime),
				imdb_id = COALESCE(excluded.imdb_id, imdb_id),
				poster_url = COALESCE(excluded.poster_url, poster_url)
			RETURNING id
		`).get(t.tmdbId, t.mediaType ?? 'movie', t.name, t.year ?? null, t.genres ?? null,
			t.runtime ?? null, t.imdbId ?? null, t.posterUrl ?? null);
		return row.id;
	}

	const existing = db.prepare(
		'SELECT id FROM titles WHERE tmdb_id IS NULL AND lower(name) = lower(?)',
	).get(t.name);
	if (existing) return existing.id;
	return db.prepare('INSERT INTO titles (name, media_type) VALUES (?, ?) RETURNING id')
		.get(t.name, t.mediaType ?? null).id;
}

function getTitle(db, id) {
	return id ? db.prepare('SELECT * FROM titles WHERE id = ?').get(id) ?? null : null;
}

/**
 * @returns {number} party id
 */
function insertParty(db, p) {
	return db.prepare(`
		INSERT INTO watchparties (guild_id, channel_id, voice_channel_id, title_id, display_name, url, service,
			host_id, host_tag, started_at, ended_at, end_reason, weekly_event_id, source, sheet_row, posted_text)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id
	`).get(
		p.guildId ?? null, p.channelId ?? null, p.voiceChannelId ?? null, p.titleId ?? null,
		p.displayName, p.url ?? null, p.service ?? null, p.hostId ?? null, p.hostTag ?? null,
		p.startedAt ?? null, p.endedAt ?? null, p.endReason ?? null, p.weeklyEventId ?? null,
		p.source ?? 'live', p.sheetRow ?? null, p.postedText ?? null,
	).id;
}

function getParty(db, id) {
	return db.prepare('SELECT * FROM watchparties WHERE id = ?').get(id) ?? null;
}

function getActivePartyInChannel(db, channelId) {
	return db.prepare(
		'SELECT * FROM watchparties WHERE channel_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1',
	).get(channelId) ?? null;
}

function listActiveParties(db) {
	return db.prepare('SELECT * FROM watchparties WHERE ended_at IS NULL ORDER BY id').all();
}

function setPartySheetRow(db, id, sheetRow, postedText) {
	db.prepare('UPDATE watchparties SET sheet_row = ?, posted_text = ? WHERE id = ?').run(sheetRow, postedText, id);
}

function openSession(db, partyId, userId, userTag, atIso) {
	const open = db.prepare(
		'SELECT id FROM attendance_sessions WHERE party_id = ? AND user_id = ? AND left_at IS NULL',
	).get(partyId, userId);
	if (open) return;
	db.prepare('INSERT INTO attendance_sessions (party_id, user_id, user_tag, joined_at) VALUES (?, ?, ?, ?)')
		.run(partyId, userId, userTag ?? null, atIso);
}

function closeSession(db, partyId, userId, atIso) {
	db.prepare('UPDATE attendance_sessions SET left_at = ? WHERE party_id = ? AND user_id = ? AND left_at IS NULL')
		.run(atIso, partyId, userId);
}

function listOpenSessionUsers(db, partyId) {
	return db.prepare('SELECT user_id FROM attendance_sessions WHERE party_id = ? AND left_at IS NULL')
		.all(partyId).map(r => r.user_id);
}

function listSessions(db, partyId) {
	return db.prepare('SELECT * FROM attendance_sessions WHERE party_id = ? ORDER BY joined_at').all(partyId);
}

/**
 * Close the party, its open sessions, and store final attendance, in one transaction.
 */
function finishParty(db, partyId, { endedAt, endReason, attendees }) {
	db.exec('BEGIN');
	try {
		db.prepare('UPDATE attendance_sessions SET left_at = ? WHERE party_id = ? AND left_at IS NULL')
			.run(endedAt, partyId);
		db.prepare('UPDATE watchparties SET ended_at = ?, end_reason = ? WHERE id = ?').run(endedAt, endReason, partyId);
		db.prepare('DELETE FROM party_attendees WHERE party_id = ?').run(partyId);
		insertAttendees(db, partyId, attendees);
		db.exec('COMMIT');
	}
	catch (err) {
		db.exec('ROLLBACK');
		throw err;
	}
}

function insertAttendees(db, partyId, attendees) {
	const insert = db.prepare(`
		INSERT INTO party_attendees (party_id, user_id, user_tag, minutes, present_at_start, present_at_end, watched)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const a of attendees) {
		insert.run(partyId, a.userId ?? null, a.userTag ?? null, a.minutes ?? null,
			a.presentAtStart ? 1 : 0, a.presentAtEnd ? 1 : 0, a.watched ? 1 : 0);
	}
}

function listAttendees(db, partyId) {
	return db.prepare('SELECT * FROM party_attendees WHERE party_id = ? ORDER BY minutes DESC').all(partyId);
}

/**
 * Is a sheet row already in the database (imported, or logged live and mirrored)?
 * Matches on the Posted Date text, or on the row number recorded when it was mirrored.
 */
function partyExistsForSheetEntry(db, displayName, postedText, sheetRow) {
	return Boolean(db.prepare(`
		SELECT 1 FROM watchparties
		WHERE lower(display_name) = lower(?) AND (posted_text IS ? OR sheet_row = ?)
		LIMIT 1
	`).get(displayName, postedText ?? null, sheetRow ?? null));
}

module.exports = {
	upsertTitle,
	getTitle,
	insertParty,
	getParty,
	getActivePartyInChannel,
	listActiveParties,
	setPartySheetRow,
	openSession,
	closeSession,
	listOpenSessionUsers,
	listSessions,
	finishParty,
	insertAttendees,
	listAttendees,
	partyExistsForSheetEntry,
};
