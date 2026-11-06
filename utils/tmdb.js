// utils/tmdb.js
// TMDB lookups. Uses Node's built-in fetch. Every function returns null/empty
// rather than throwing, so callers can treat TMDB as optional.

const REQUEST_TIMEOUT_MS = 6000;
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w780';

const EMPTY_INFO = Object.freeze({ genre: null, runtime: null, imdbId: null, posterUrl: null });

function apiKey() {
	return process.env.TMDB_API_KEY || '';
}

function isTmdbConfigured() {
	return Boolean(apiKey());
}

async function getJson(pathAndQuery, timeoutMs = REQUEST_TIMEOUT_MS) {
	const sep = pathAndQuery.includes('?') ? '&' : '?';
	const url = `https://api.themoviedb.org/3${pathAndQuery}${sep}api_key=${encodeURIComponent(apiKey())}`;
	const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok) return null;
	return res.json();
}

function yearOf(result) {
	const date = result.release_date || result.first_air_date || '';
	const year = Number(date.slice(0, 4));
	return Number.isFinite(year) && year > 0 ? year : null;
}

/**
 * Search movies and shows by name. Movies come first since that's most of movie night.
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.limit]
 * @param {number} [options.timeoutMs] - keep short for autocomplete (Discord allows 3s)
 * @returns {Promise<{tmdbId: number, mediaType: 'movie'|'tv', name: string, year: number|null}[]>}
 */
async function searchTitles(query, { limit = 10, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
	if (!isTmdbConfigured() || !query?.trim()) return [];
	try {
		const data = await getJson(
			`/search/multi?query=${encodeURIComponent(query.trim())}&include_adult=false&language=en-US&page=1`,
			timeoutMs,
		);
		const results = (data?.results ?? [])
			.filter(r => r.media_type === 'movie' || r.media_type === 'tv')
			.map((r, rank) => ({
				tmdbId: r.id,
				mediaType: r.media_type,
				name: r.title || r.name,
				year: yearOf(r),
				rank,
			}));
		// Stable: keep TMDB's relevance order within each type
		results.sort((a, b) => (a.mediaType === b.mediaType ? a.rank - b.rank : a.mediaType === 'movie' ? -1 : 1));
		return results.slice(0, limit).map(({ tmdbId, mediaType, name, year }) => ({ tmdbId, mediaType, name, year }));
	}
	catch (err) {
		console.warn(`[TMDB] Search failed for "${query}": ${err.message}`);
		return [];
	}
}

/**
 * Full details for one title.
 * @param {'movie'|'tv'} mediaType
 * @param {number} tmdbId
 * @returns {Promise<{tmdbId: number, mediaType: string, name: string, year: number|null,
 *   genres: string|null, runtime: number|null, imdbId: string|null, posterUrl: string|null}|null>}
 */
async function getTitleDetails(mediaType, tmdbId) {
	if (!isTmdbConfigured() || !tmdbId) return null;
	try {
		const type = mediaType === 'tv' ? 'tv' : 'movie';
		const append = type === 'tv' ? '?append_to_response=external_ids' : '';
		const d = await getJson(`/${type}/${tmdbId}${append}`);
		if (!d) return null;
		return {
			tmdbId: d.id,
			mediaType: type,
			name: d.title || d.name,
			year: yearOf(d),
			genres: d.genres?.length ? d.genres.slice(0, 3).map(g => g.name).join(', ') : null,
			runtime: d.runtime || d.episode_run_time?.[0] || null,
			imdbId: d.imdb_id || d.external_ids?.imdb_id || null,
			posterUrl: d.poster_path ? `${IMAGE_BASE}${d.poster_path}` : null,
		};
	}
	catch (err) {
		console.warn(`[TMDB] Details failed for ${mediaType}/${tmdbId}: ${err.message}`);
		return null;
	}
}

/**
 * Best TMDB match for a free-text title, with details.
 * @param {string} title
 * @returns {Promise<Awaited<ReturnType<typeof getTitleDetails>>>}
 */
async function findTitle(title) {
	const [best] = await searchTitles(title, { limit: 1 });
	return best ? getTitleDetails(best.mediaType, best.tmdbId) : null;
}

/**
 * Older shape used by /exportmovies: genre, runtime, IMDb id and poster for a title.
 * @param {string} title
 */
async function fetchTMDBInfo(title) {
	const details = await findTitle(title);
	if (!details) return { ...EMPTY_INFO };
	return {
		genre: details.genres,
		runtime: details.runtime,
		imdbId: details.imdbId,
		posterUrl: details.posterUrl,
	};
}

module.exports = { isTmdbConfigured, searchTitles, getTitleDetails, findTitle, fetchTMDBInfo };
