// utils/tmdb.js
// TMDB lookups (poster, genre, runtime, IMDb id). Uses Node's built-in fetch.

const REQUEST_TIMEOUT_MS = 6000;

const GENRES = {
	28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
	99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
	27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
	10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
	10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
	10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

const EMPTY_INFO = Object.freeze({ genre: null, runtime: null, imdbId: null, posterUrl: null });

function apiKey() {
	return process.env.TMDB_API_KEY || '';
}

async function getJson(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
	if (!res.ok) return null;
	return res.json();
}

/**
 * Look up a movie or show on TMDB by title.
 * Never throws; any missing piece comes back as null.
 * @param {string} title
 * @returns {Promise<{genre: string|null, runtime: number|null, imdbId: string|null, posterUrl: string|null}>}
 */
async function fetchTMDBInfo(title) {
	const key = apiKey();
	if (!key || !title) return { ...EMPTY_INFO };

	try {
		const searchUrl = 'https://api.themoviedb.org/3/search/multi'
			+ `?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(title)}`
			+ '&include_adult=false&language=en-US&page=1';
		const data = await getJson(searchUrl);
		const results = data?.results ?? [];
		if (results.length === 0) return { ...EMPTY_INFO };

		const best = results[0];
		const info = { ...EMPTY_INFO };

		const withPoster = results.find(r => r.poster_path);
		if (withPoster) info.posterUrl = `https://image.tmdb.org/t/p/w780${withPoster.poster_path}`;

		if (best.genre_ids?.length) {
			info.genre = best.genre_ids.slice(0, 3).map(id => GENRES[id]).filter(Boolean).join(', ') || null;
		}

		// Runtime and IMDb id are only on the details endpoint
		if (best.id && best.media_type) {
			const type = best.media_type === 'movie' ? 'movie' : 'tv';
			const details = await getJson(
				`https://api.themoviedb.org/3/${type}/${best.id}?api_key=${encodeURIComponent(key)}`,
			);
			if (details) {
				info.runtime = details.runtime || details.episode_run_time?.[0] || null;
				info.imdbId = details.imdb_id || null;
			}
		}

		return info;
	}
	catch (err) {
		console.warn(`[TMDB] Lookup failed for "${title}": ${err.message}`);
		return { ...EMPTY_INFO };
	}
}

module.exports = { fetchTMDBInfo };
