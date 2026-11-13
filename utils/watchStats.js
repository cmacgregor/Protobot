// utils/watchStats.js
// Read-only queries over watchparty records for /history, /stats and /watched.
// Everything is scoped to one server and only counts parties that have ended.

// Same slack the attendance calculation uses for "there at the start"
const LATE_GRACE_MINUTES = 2;

// Party length in minutes: measured for live parties, the title's runtime for imported ones
const PARTY_MINUTES = `
	CASE
		WHEN w.ended_at > w.started_at THEN (julianday(w.ended_at) - julianday(w.started_at)) * 1440
		ELSE COALESCE(t.runtime, 0)
	END`;

/**
 * Split stored genre strings ("Horror, Sci-Fi") and count them.
 * @param {(string|null)[]} genreStrings
 * @param {number} limit
 * @returns {{genre: string, count: number}[]}
 */
function countGenres(genreStrings, limit) {
	const counts = new Map();
	for (const s of genreStrings) {
		for (const g of (s || '').split(',').map(x => x.trim()).filter(Boolean)) {
			counts.set(g, (counts.get(g) || 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([genre, count]) => ({ genre, count }))
		.sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
		.slice(0, limit);
}

/**
 * Ended parties, newest first, with which viewing of the title each one was.
 * @returns {{total: number, page: number, pages: number, items: Object[]}}
 */
function listHistory(db, guildId, { page = 1, perPage = 10 } = {}) {
	const { n: total } = db.prepare(
		'SELECT count(*) AS n FROM watchparties WHERE guild_id = ? AND ended_at IS NOT NULL',
	).get(guildId);
	const pages = Math.max(1, Math.ceil(total / perPage));
	const current = Math.min(Math.max(1, page), pages);

	const items = db.prepare(`
		WITH ranked AS (
			SELECT w.*,
				ROW_NUMBER() OVER (
					PARTITION BY COALESCE(w.title_id, -w.id)
					ORDER BY COALESCE(w.started_at, ''), w.id
				) AS watch_number
			FROM watchparties w
			WHERE w.guild_id = ? AND w.ended_at IS NOT NULL
		)
		SELECT r.id, r.display_name, r.started_at, r.host_id, r.host_tag, r.weekly_event_id, r.source,
			r.watch_number, t.name AS title_name, t.year, t.media_type,
			(SELECT count(*) FROM party_attendees a WHERE a.party_id = r.id AND a.watched = 1) AS watchers
		FROM ranked r LEFT JOIN titles t ON t.id = r.title_id
		ORDER BY COALESCE(r.started_at, '') DESC, r.id DESC
		LIMIT ? OFFSET ?
	`).all(guildId, perPage, (current - 1) * perPage);

	return { total, page: current, pages, items };
}

/** Server-wide numbers for /stats. */
function serverStats(db, guildId) {
	const totals = db.prepare(`
		SELECT count(*) AS parties,
			count(DISTINCT w.title_id) AS titles,
			COALESCE(sum(${PARTY_MINUTES}), 0) AS minutes,
			sum(w.weekly_event_id IS NOT NULL) AS weeklyParties
		FROM watchparties w LEFT JOIN titles t ON t.id = w.title_id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL
	`).get(guildId);

	const watcherCounts = db.prepare(`
		SELECT w.weekly_event_id IS NOT NULL AS weekly, avg(c.n) AS avgWatchers
		FROM watchparties w
		JOIN (SELECT party_id, sum(watched) AS n FROM party_attendees GROUP BY party_id) c ON c.party_id = w.id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL
		GROUP BY weekly
	`).all(guildId);
	const avgFor = weekly => watcherCounts.find(r => Boolean(r.weekly) === weekly)?.avgWatchers ?? null;

	const genreRows = db.prepare(`
		SELECT t.genres FROM watchparties w JOIN titles t ON t.id = w.title_id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL
	`).all(guildId);

	const rewatched = db.prepare(`
		SELECT t.name, t.year, count(*) AS times
		FROM watchparties w JOIN titles t ON t.id = w.title_id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL
		GROUP BY w.title_id HAVING times > 1
		ORDER BY times DESC, max(w.started_at) DESC
		LIMIT 5
	`).all(guildId);

	const hosts = db.prepare(`
		SELECT host_id AS userId, max(host_tag) AS userTag, count(*) AS parties
		FROM watchparties
		WHERE guild_id = ? AND ended_at IS NOT NULL AND COALESCE(host_id, host_tag) IS NOT NULL
		GROUP BY COALESCE(host_id, lower(host_tag))
		ORDER BY parties DESC
		LIMIT 5
	`).all(guildId);

	const viewers = db.prepare(`
		SELECT a.user_id AS userId, max(a.user_tag) AS userTag, sum(a.watched) AS watched
		FROM party_attendees a JOIN watchparties w ON w.id = a.party_id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL AND a.user_id IS NOT NULL
		GROUP BY a.user_id HAVING watched > 0
		ORDER BY watched DESC
		LIMIT 5
	`).all(guildId);

	return {
		parties: totals.parties,
		titles: totals.titles,
		hours: Math.round((totals.minutes / 60) * 10) / 10,
		weeklyParties: totals.weeklyParties ?? 0,
		avgWatchersWeekly: avgFor(true),
		avgWatchersOther: avgFor(false),
		topGenres: countGenres(genreRows.map(r => r.genres), 5),
		rewatched,
		topHosts: hosts,
		topViewers: viewers,
	};
}

/** One member's numbers for /stats @member. Matched by Discord user id. */
function memberStats(db, guildId, userId) {
	const rows = db.prepare(`
		SELECT w.id, w.started_at, w.source, a.watched, a.present_at_start, a.present_at_end, a.minutes,
			t.name AS title_name, t.year, t.genres, w.display_name
		FROM party_attendees a
		JOIN watchparties w ON w.id = a.party_id
		LEFT JOIN titles t ON t.id = w.title_id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL AND a.user_id = ?
		ORDER BY COALESCE(w.started_at, '') DESC, w.id DESC
	`).all(guildId, userId);

	const watched = rows.filter(r => r.watched);
	const live = rows.filter(r => r.source === 'live');

	// Share of the server's parties they watched, counted from their first one
	const first = rows.length ? rows[rows.length - 1] : null;
	const { n: partiesSinceFirst } = first?.started_at
		? db.prepare(`
			SELECT count(*) AS n FROM watchparties
			WHERE guild_id = ? AND ended_at IS NOT NULL AND started_at >= ?
		`).get(guildId, first.started_at)
		: { n: rows.length };

	// How late they arrived at live parties, from the raw voice log
	const lateRows = db.prepare(`
		SELECT (julianday(min(s.joined_at)) - julianday(w.started_at)) * 1440 AS lateMinutes
		FROM attendance_sessions s JOIN watchparties w ON w.id = s.party_id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL AND w.source = 'live' AND s.user_id = ?
		GROUP BY w.id
	`).all(guildId, userId);
	const late = lateRows.filter(r => r.lateMinutes > LATE_GRACE_MINUTES);

	const hosted = db.prepare(`
		SELECT count(*) AS n FROM watchparties WHERE guild_id = ? AND ended_at IS NOT NULL AND host_id = ?
	`).get(guildId, userId).n;

	return {
		attended: rows.length,
		watched: watched.length,
		hosted,
		attendanceRate: partiesSinceFirst ? watched.length / partiesSinceFirst : null,
		liveParties: live.length,
		lateCount: late.length,
		avgLateMinutes: late.length ? late.reduce((s, r) => s + r.lateMinutes, 0) / late.length : null,
		leftEarlyCount: live.filter(r => !r.present_at_end).length,
		topGenres: countGenres(watched.map(r => r.genres), 3),
		recent: watched.slice(0, 5).map(r => ({
			name: r.title_name || r.display_name,
			year: r.year,
			startedAt: r.started_at,
		})),
	};
}

/** Titles this server has watched whose name matches, for /watched autocomplete. */
function searchWatchedTitles(db, guildId, query, limit = 25) {
	return db.prepare(`
		SELECT t.id, t.name, t.year, count(w.id) AS times
		FROM titles t JOIN watchparties w ON w.title_id = t.id
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL AND t.name LIKE ? ESCAPE '\\'
		GROUP BY t.id
		ORDER BY times DESC, t.name
		LIMIT ?
	`).all(guildId, `%${query.replace(/[\\%_]/g, c => `\\${c}`)}%`, limit);
}

/**
 * Every time this server watched a title, newest first, with who watched.
 * @returns {{title: Object, viewings: Object[]}|null}
 */
function titleViewings(db, guildId, titleId) {
	const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(titleId);
	if (!title) return null;
	const viewings = db.prepare(`
		SELECT w.id, w.started_at, w.host_id, w.host_tag, w.weekly_event_id
		FROM watchparties w
		WHERE w.guild_id = ? AND w.ended_at IS NOT NULL AND w.title_id = ?
		ORDER BY COALESCE(w.started_at, '') DESC, w.id DESC
	`).all(guildId, titleId);
	const watchers = db.prepare(`
		SELECT user_id AS userId, user_tag AS userTag FROM party_attendees
		WHERE party_id = ? AND watched = 1 ORDER BY minutes DESC
	`);
	for (const v of viewings) v.watchers = watchers.all(v.id);
	return { title, viewings };
}

module.exports = {
	listHistory,
	serverStats,
	memberStats,
	searchWatchedTitles,
	titleViewings,
	// Exported for tests
	countGenres,
};
