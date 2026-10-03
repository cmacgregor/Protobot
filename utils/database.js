// utils/database.js
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SCHEMA_VERSION = 1;

/**
 * SQLite-backed storage for watchparties, attendance, and ratings
 */
class WatchpartyDatabase {
	constructor(filePath = process.env.DB_PATH || './data/protobot.db') {
		if (filePath !== ':memory:') {
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
		}
		this.db = new Database(filePath);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		this._migrate();
	}

	_migrate() {
		const version = this.db.pragma('user_version', { simple: true });
		if (version >= SCHEMA_VERSION) return;

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS watchparties (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				guild_id TEXT,
				channel_id TEXT NOT NULL,
				voice_channel_id TEXT,
				message_id TEXT,
				title TEXT NOT NULL,
				title_key TEXT NOT NULL,
				url TEXT,
				service TEXT,
				genre TEXT,
				runtime INTEGER,
				imdb_id TEXT,
				host_id TEXT NOT NULL,
				host_tag TEXT,
				started_at TEXT NOT NULL,
				ended_at TEXT
			);
			CREATE INDEX IF NOT EXISTS idx_watchparties_title_key ON watchparties(title_key);
			CREATE INDEX IF NOT EXISTS idx_watchparties_started_at ON watchparties(started_at);

			CREATE TABLE IF NOT EXISTS attendance (
				watchparty_id INTEGER NOT NULL REFERENCES watchparties(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL,
				user_tag TEXT,
				phase TEXT NOT NULL CHECK (phase IN ('start', 'end')),
				PRIMARY KEY (watchparty_id, user_id, phase)
			);

			CREATE TABLE IF NOT EXISTS ratings (
				watchparty_id INTEGER NOT NULL REFERENCES watchparties(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL,
				user_tag TEXT,
				score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
				rated_at TEXT NOT NULL,
				PRIMARY KEY (watchparty_id, user_id)
			);
			CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
		`);
		this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
	}

	close() {
		this.db.close();
	}

	// ---------- Watchparties ----------

	/**
	 * Records a new watchparty and its starting attendees
	 * @returns {number} The new watchparty id
	 */
	createWatchparty(data) {
		const insert = this.db.transaction(() => {
			const result = this.db.prepare(`
				INSERT INTO watchparties (guild_id, channel_id, voice_channel_id, message_id, title, title_key,
					url, service, genre, runtime, imdb_id, host_id, host_tag, started_at)
				VALUES (@guildId, @channelId, @voiceChannelId, @messageId, @title, @titleKey,
					@url, @service, @genre, @runtime, @imdbId, @hostId, @hostTag, @startedAt)
			`).run({
				guildId: data.guildId ?? null,
				channelId: data.channelId,
				voiceChannelId: data.voiceChannelId ?? null,
				messageId: data.messageId ?? null,
				title: data.title,
				titleKey: titleKey(data.title),
				url: data.url ?? null,
				service: data.service ?? null,
				genre: data.genre || null,
				runtime: data.runtime ?? null,
				imdbId: data.imdbId ?? null,
				hostId: data.hostId,
				hostTag: data.hostTag ?? null,
				startedAt: toIso(data.startedAt ?? new Date()),
			});
			const id = Number(result.lastInsertRowid);
			this._recordAttendance(id, data.attendees || [], 'start');
			return id;
		});
		return insert();
	}

	/**
	 * Marks a watchparty as ended and records the attendees present at the end
	 */
	endWatchparty(id, endAttendees = [], endedAt = new Date()) {
		this.db.transaction(() => {
			this.db.prepare('UPDATE watchparties SET ended_at = ? WHERE id = ?').run(toIso(endedAt), id);
			this.db.prepare('DELETE FROM attendance WHERE watchparty_id = ? AND phase = \'end\'').run(id);
			this._recordAttendance(id, endAttendees, 'end');
		})();
	}

	_recordAttendance(watchpartyId, attendees, phase) {
		const stmt = this.db.prepare(`
			INSERT OR REPLACE INTO attendance (watchparty_id, user_id, user_tag, phase)
			VALUES (?, ?, ?, ?)
		`);
		for (const a of attendees) stmt.run(watchpartyId, a.id, a.tag ?? null, phase);
	}

	getWatchparty(id) {
		return this.db.prepare('SELECT * FROM watchparties WHERE id = ?').get(id) || null;
	}

	/**
	 * Searches watchparties by title, most recent first (for autocomplete)
	 */
	searchWatchparties(query = '', limit = 25) {
		return this.db.prepare(`
			SELECT id, title, started_at FROM watchparties
			WHERE title_key LIKE ? ESCAPE '\\'
			ORDER BY started_at DESC
			LIMIT ?
		`).all(`%${escapeLike(titleKey(query))}%`, limit);
	}

	/**
	 * Finds the most recent watchparty with an exactly matching title
	 */
	findLatestByTitle(title) {
		return this.db.prepare(`
			SELECT * FROM watchparties WHERE title_key = ? ORDER BY started_at DESC LIMIT 1
		`).get(titleKey(title)) || null;
	}

	// ---------- Ratings ----------

	/**
	 * Creates or updates a user's rating for a watchparty
	 * @returns {number|null} The user's previous score, if any
	 */
	setRating(watchpartyId, user, score) {
		if (!Number.isInteger(score) || score < 1 || score > 10) {
			throw new RangeError('Score must be an integer from 1 to 10');
		}
		return this.db.transaction(() => {
			const previous = this.db.prepare(
				'SELECT score FROM ratings WHERE watchparty_id = ? AND user_id = ?',
			).get(watchpartyId, user.id);
			this.db.prepare(`
				INSERT INTO ratings (watchparty_id, user_id, user_tag, score, rated_at)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT (watchparty_id, user_id)
				DO UPDATE SET score = excluded.score, user_tag = excluded.user_tag, rated_at = excluded.rated_at
			`).run(watchpartyId, user.id, user.tag ?? null, score, toIso(new Date()));
			return previous ? previous.score : null;
		})();
	}

	/**
	 * Rating summary for a single watchparty
	 */
	getWatchpartyRatingSummary(watchpartyId) {
		const row = this.db.prepare(`
			SELECT COUNT(*) AS count, AVG(score) AS average FROM ratings WHERE watchparty_id = ?
		`).get(watchpartyId);
		return { count: row.count, average: row.average };
	}

	// ---------- Aggregate metrics ----------

	/**
	 * Movies ranked by average rating across all of their watchparties
	 */
	getTopMovies({ order = 'best', minRatings = 2, limit = 10 } = {}) {
		const direction = order === 'worst' ? 'ASC' : 'DESC';
		return this.db.prepare(`
			SELECT MAX(w.title) AS title, AVG(r.score) AS average, COUNT(*) AS count,
				COUNT(DISTINCT w.id) AS watchparties
			FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			GROUP BY w.title_key
			HAVING COUNT(*) >= ?
			ORDER BY average ${direction}, count DESC
			LIMIT ?
		`).all(minRatings, limit);
	}

	/**
	 * Movies with the most disagreement between raters (highest standard deviation)
	 */
	getControversialMovies({ minRatings = 3, limit = 10 } = {}) {
		const rows = this.db.prepare(`
			SELECT MAX(w.title) AS title, AVG(r.score) AS average, COUNT(*) AS count,
				AVG(r.score * r.score) - AVG(r.score) * AVG(r.score) AS variance,
				MIN(r.score) AS low, MAX(r.score) AS high
			FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			GROUP BY w.title_key
			HAVING COUNT(*) >= ?
			ORDER BY variance DESC
			LIMIT ?
		`).all(minRatings, limit);
		return rows.map(({ variance, ...r }) => ({ ...r, stddev: Math.sqrt(Math.max(variance, 0)) }));
	}

	/**
	 * Full stats for one movie (all watchparties sharing its title)
	 */
	getMovieStats(title) {
		const key = titleKey(title);
		const summary = this.db.prepare(`
			SELECT COUNT(*) AS count, AVG(r.score) AS average,
				AVG(r.score * r.score) - AVG(r.score) * AVG(r.score) AS variance
			FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			WHERE w.title_key = ?
		`).get(key);
		const watchparties = this.db.prepare(`
			SELECT w.id, w.title, w.started_at, w.ended_at, w.host_id, w.service, w.genre,
				(SELECT COUNT(*) FROM attendance a WHERE a.watchparty_id = w.id AND a.phase = 'start') AS start_count,
				(SELECT COUNT(*) FROM attendance a WHERE a.watchparty_id = w.id AND a.phase = 'end') AS end_count
			FROM watchparties w WHERE w.title_key = ?
			ORDER BY w.started_at DESC
		`).all(key);
		const distribution = this.db.prepare(`
			SELECT r.score, COUNT(*) AS count
			FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			WHERE w.title_key = ?
			GROUP BY r.score
		`).all(key);
		const ratings = this.db.prepare(`
			SELECT r.user_id, r.score
			FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			WHERE w.title_key = ?
			ORDER BY r.score DESC, r.rated_at ASC
		`).all(key);

		return {
			title: watchparties[0]?.title ?? title,
			count: summary.count,
			average: summary.average,
			stddev: summary.count ? Math.sqrt(Math.max(summary.variance, 0)) : null,
			distribution: Object.fromEntries(distribution.map(d => [d.score, d.count])),
			ratings,
			watchparties,
		};
	}

	/**
	 * Rating and attendance stats for a single user
	 */
	getUserStats(userId) {
		const ratingSummary = this.db.prepare(`
			SELECT COUNT(*) AS count, AVG(score) AS average FROM ratings WHERE user_id = ?
		`).get(userId);

		// Average difference between the user's score and the group average on the same watchparty,
		// only counting watchparties that someone else also rated
		const generosity = this.db.prepare(`
			SELECT AVG(r.score - g.average) AS delta, COUNT(*) AS count
			FROM ratings r
			JOIN (
				SELECT watchparty_id, AVG(score) AS average, COUNT(*) AS n FROM ratings GROUP BY watchparty_id
			) g ON g.watchparty_id = r.watchparty_id
			WHERE r.user_id = ? AND g.n >= 2
		`).get(userId);

		const favorites = this.db.prepare(`
			SELECT w.title, r.score FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			WHERE r.user_id = ? ORDER BY r.score DESC, r.rated_at DESC LIMIT 3
		`).all(userId);
		const leastFavorites = this.db.prepare(`
			SELECT w.title, r.score FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			WHERE r.user_id = ? ORDER BY r.score ASC, r.rated_at DESC LIMIT 3
		`).all(userId);

		const genreRows = this.db.prepare(`
			SELECT w.genre, r.score FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			WHERE r.user_id = ? AND w.genre IS NOT NULL
		`).all(userId);
		const genres = aggregateByGenre(genreRows)
			.filter(g => g.count >= 2)
			.sort((a, b) => b.average - a.average || b.count - a.count);

		const attendance = this.getUserAttendance(userId);

		return {
			ratingCount: ratingSummary.count,
			averageScore: ratingSummary.average,
			generosity: generosity.count ? generosity.delta : null,
			favorites,
			leastFavorites,
			favoriteGenre: genres[0] || null,
			attendance,
		};
	}

	getUserAttendance(userId) {
		// started/stayed only count watchparties whose end attendance was captured
		const row = this.db.prepare(`
			SELECT
				COUNT(DISTINCT a.watchparty_id) AS attended,
				COUNT(DISTINCT CASE WHEN a.phase = 'start' AND w.ended_at IS NOT NULL THEN a.watchparty_id END) AS started,
				COUNT(DISTINCT CASE WHEN a.phase = 'end' THEN a.watchparty_id END) AS finished,
				COUNT(DISTINCT CASE WHEN a.phase = 'start' AND a.watchparty_id IN (
					SELECT watchparty_id FROM attendance WHERE user_id = @userId AND phase = 'end'
				) THEN a.watchparty_id END) AS stayed
			FROM attendance a JOIN watchparties w ON w.id = a.watchparty_id
			WHERE a.user_id = @userId
		`).get({ userId });
		const hosted = this.db.prepare('SELECT COUNT(*) AS n FROM watchparties WHERE host_id = ?').get(userId).n;
		return { ...row, hosted };
	}

	/**
	 * Average rating grouped by genre, service, or host
	 */
	getBreakdown(dimension, { minRatings = 1 } = {}) {
		if (dimension === 'genre') {
			const rows = this.db.prepare(`
				SELECT w.id AS watchparty_id, w.genre, r.score
				FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
				WHERE w.genre IS NOT NULL
			`).all();
			return aggregateByGenre(rows)
				.filter(g => g.count >= minRatings)
				.sort((a, b) => b.average - a.average || b.count - a.count);
		}

		const column = { service: 'w.service', host: 'w.host_id' }[dimension];
		if (!column) throw new Error(`Unknown breakdown dimension: ${dimension}`);

		return this.db.prepare(`
			SELECT ${column} AS key, AVG(r.score) AS average, COUNT(*) AS count,
				COUNT(DISTINCT w.id) AS watchparties
			FROM ratings r JOIN watchparties w ON w.id = r.watchparty_id
			WHERE ${column} IS NOT NULL
			GROUP BY ${column}
			HAVING COUNT(*) >= ?
			ORDER BY average DESC, count DESC
		`).all(minRatings);
	}

	/**
	 * Attendance leaderboard and overall retention (start vs end attendees)
	 */
	getAttendanceStats({ limit = 10 } = {}) {
		const leaderboard = this.db.prepare(`
			SELECT user_id,
				COUNT(DISTINCT watchparty_id) AS attended,
				COUNT(DISTINCT CASE WHEN phase = 'end' THEN watchparty_id END) AS finished
			FROM attendance
			GROUP BY user_id
			ORDER BY attended DESC, finished DESC
			LIMIT ?
		`).all(limit);

		// Retention only counts watchparties whose end attendance was captured
		const retention = this.db.prepare(`
			SELECT
				COUNT(*) AS watchparties,
				SUM(start_count) AS started,
				SUM(stayed_count) AS stayed,
				AVG(start_count) AS avg_start,
				AVG(end_count) AS avg_end
			FROM (
				SELECT w.id,
					(SELECT COUNT(*) FROM attendance a WHERE a.watchparty_id = w.id AND a.phase = 'start') AS start_count,
					(SELECT COUNT(*) FROM attendance a WHERE a.watchparty_id = w.id AND a.phase = 'end') AS end_count,
					(SELECT COUNT(*) FROM attendance s JOIN attendance e
						ON e.watchparty_id = s.watchparty_id AND e.user_id = s.user_id AND e.phase = 'end'
						WHERE s.watchparty_id = w.id AND s.phase = 'start') AS stayed_count
				FROM watchparties w
				WHERE w.ended_at IS NOT NULL
			)
		`).get();

		const totals = this.db.prepare(`
			SELECT COUNT(*) AS watchparties,
				(SELECT COUNT(DISTINCT user_id) FROM attendance) AS unique_attendees
			FROM watchparties
		`).get();

		return {
			leaderboard,
			totalWatchparties: totals.watchparties,
			uniqueAttendees: totals.unique_attendees,
			endedWatchparties: retention.watchparties,
			retentionRate: retention.started ? retention.stayed / retention.started : null,
			averageStart: retention.avg_start,
			averageEnd: retention.avg_end,
		};
	}
}

function titleKey(title) {
	return String(title || '').trim().toLowerCase();
}

function escapeLike(value) {
	return value.replace(/[\\%_]/g, c => `\\${c}`);
}

function toIso(date) {
	return (date instanceof Date ? date : new Date(date)).toISOString();
}

/**
 * Genres are stored as comma-separated strings, so split and aggregate in JS
 */
function aggregateByGenre(rows) {
	const totals = new Map();
	for (const row of rows) {
		for (const genre of row.genre.split(',').map(g => g.trim()).filter(Boolean)) {
			const entry = totals.get(genre) || { key: genre, sum: 0, count: 0, watchparties: new Set() };
			entry.sum += row.score;
			entry.count += 1;
			if (row.watchparty_id !== undefined) entry.watchparties.add(row.watchparty_id);
			totals.set(genre, entry);
		}
	}
	return [...totals.values()].map(e => ({
		key: e.key,
		average: e.sum / e.count,
		count: e.count,
		watchparties: e.watchparties.size,
	}));
}

let instance = null;

/**
 * Shared database instance, opened lazily on first use
 */
function getDatabase() {
	if (!instance) instance = new WatchpartyDatabase();
	return instance;
}

module.exports = { WatchpartyDatabase, getDatabase, titleKey };
