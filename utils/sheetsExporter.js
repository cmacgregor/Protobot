// utils/sheetsExporter.js
const { auth, sheets } = require('@googleapis/sheets');
const fetch = require('node-fetch');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

/**
 * Fetches genre, runtime, and IMDB ID from TMDB API
 * @param {string} title - Movie/show title
 * @returns {Promise<{genre: string|null, runtime: number|null, imdbId: string|null}>}
 */
async function fetchTMDBInfo(title) {
	if (!TMDB_API_KEY || !title) return { genre: null, runtime: null, imdbId: null };
	try {
		const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(
			TMDB_API_KEY,
		)}&query=${encodeURIComponent(title)}&include_adult=false&language=en-US&page=1`;
		const res = await fetch(url, { timeout: 6000 });
		if (!res.ok) return { genre: null, runtime: null, imdbId: null };
		const data = await res.json();
		if (!data?.results?.length) return { genre: null, runtime: null, imdbId: null };

		const best = data.results[0];
		let genre = null;
		let runtime = null;
		let imdbId = null;

		// Get genres
		if (best?.genre_ids?.length) {
			const genreMap = {
				28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
				99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
				27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
				10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
				10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
				10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
			};
			const genres = best.genre_ids.slice(0, 3).map(id => genreMap[id] || '').filter(Boolean);
			genre = genres.join(', ');
		}

		// Get runtime and IMDB ID - need to fetch full details
		if (best?.id && best?.media_type) {
			const detailType = best.media_type === 'movie' ? 'movie' : 'tv';
			const detailUrl = `https://api.themoviedb.org/3/${detailType}/${best.id}?api_key=${encodeURIComponent(TMDB_API_KEY)}`;
			const detailRes = await fetch(detailUrl, { timeout: 6000 });
			if (detailRes.ok) {
				const details = await detailRes.json();
				// For movies, runtime is in minutes. For TV, use episode_run_time average or first episode
				if (details.runtime) {
					runtime = details.runtime;
				}
				else if (details.episode_run_time?.length) {
					runtime = details.episode_run_time[0];
				}

				// Get IMDB ID
				if (details.imdb_id) {
					imdbId = details.imdb_id;
				}
			}
		}

		return { genre, runtime, imdbId };
	}
	catch {
		return { genre: null, runtime: null, imdbId: null };
	}
}

/**
 * Fetches genre information from TMDB API (backwards compatibility)
 * @param {string} title - Movie/show title
 * @returns {Promise<string|null>} Comma-separated genre names or null
 */
async function fetchGenreFromTMDB(title) {
	const info = await fetchTMDBInfo(title);
	return info.genre;
}

/**
 * Exports a single movie entry to Google Sheets
 * @param {Object} movieData - Movie data to export
 * @param {string} movieData.title - Movie title
 * @param {string} movieData.url - Movie URL
 * @param {Date} movieData.postedDate - Date posted
 * @param {string} movieData.host - Host username
 * @param {string} movieData.service - Streaming service
 * @param {string} movieData.attendees - Comma-separated start attendee list
 * @param {string} movieData.genre - Genre (optional, will fetch if not provided)
 * @param {number} movieData.rewatchCount - Rewatch count (defaults to 1)
 * @param {number} movieData.runtime - Runtime in minutes (optional, will fetch if not provided)
 * @param {string} movieData.imdbId - IMDB ID (optional, will fetch if not provided)
 * @returns {Promise<void>}
 * @throws {Error} If Google Sheets credentials are not configured or export fails
 */
async function exportMovieToSheet(movieData) {
	// Validate credentials
	if (!process.env.GOOGLE_SHEETS_CREDENTIALS || !process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
		throw new Error('Google Sheets credentials not configured');
	}

	// Fetch TMDB info if not provided
	let genre = movieData.genre;
	let runtime = movieData.runtime;
	let imdbId = movieData.imdbId;
	if (!genre || !runtime || !imdbId) {
		const tmdbInfo = await fetchTMDBInfo(movieData.title);
		if (!genre) genre = tmdbInfo.genre || '';
		if (!runtime) runtime = tmdbInfo.runtime;
		if (!imdbId) imdbId = tmdbInfo.imdbId;
	}

	const googleAuth = new auth.GoogleAuth({
		credentials: JSON.parse(
			Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS, 'base64').toString(),
		),
		scopes: ['https://www.googleapis.com/auth/spreadsheets'],
	});

	const sheetsClient = sheets({ version: 'v4', auth: googleAuth });

	// Format title with IMDB hyperlink if available
	let titleValue = movieData.title;
	if (imdbId) {
		titleValue = `=HYPERLINK("https://www.imdb.com/title/${imdbId}/", "${movieData.title}")`;
	}

	// Columns: Title (with IMDB link), URL, Posted Date, Service, Genre, Rewatch Count, Runtime, Host, Start Attendees, End Attendees
	const row = [
		titleValue,
		movieData.url,
		movieData.postedDate.toLocaleString(),
		movieData.service,
		genre,
		movieData.rewatchCount || 1,
		runtime || '',
		movieData.host,
		movieData.attendees || '',
		// End attendees - filled in later by updateEndAttendees
		'',
	];

	await sheetsClient.spreadsheets.values.append({
		spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
		// Updated range for 10 columns
		range: 'Sheet1!A2:J2',
		// Changed from RAW to USER_ENTERED to support formulas
		valueInputOption: 'USER_ENTERED',
		insertDataOption: 'INSERT_ROWS',
		resource: { values: [row] },
	});
}

/**
 * Updates end attendees for a watchparty in Google Sheets
 * @param {string} title - Movie title to find
 * @param {Date} startTime - Start time to match (for finding the correct row)
 * @param {string} endAttendees - Comma-separated end attendee list
 * @returns {Promise<boolean>} True if updated, false if not found
 */
async function updateEndAttendees(title, startTime, endAttendees) {
	if (!process.env.GOOGLE_SHEETS_CREDENTIALS || !process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
		throw new Error('Google Sheets credentials not configured');
	}

	const googleAuth = new auth.GoogleAuth({
		credentials: JSON.parse(
			Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS, 'base64').toString(),
		),
		scopes: ['https://www.googleapis.com/auth/spreadsheets'],
	});

	const sheetsClient = sheets({ version: 'v4', auth: googleAuth });

	// Read all data to find the matching row
	const response = await sheetsClient.spreadsheets.values.get({
		spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
		range: 'Sheet1!A:J',
	});

	const rows = response.data.values || [];
	const targetTimestamp = startTime.toLocaleString();

	// Find the row (skip header row)
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		const rowTitle = row[0];
		const rowTimestamp = row[2];

		// Match by title and timestamp
		if (rowTitle === title && rowTimestamp === targetTimestamp) {
			// Update column J (index 9) with end attendees
			// Sheets rows are 1-indexed
			const rowNumber = i + 1;
			await sheetsClient.spreadsheets.values.update({
				spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
				range: `Sheet1!J${rowNumber}`,
				valueInputOption: 'RAW',
				resource: { values: [[endAttendees]] },
			});

			console.log(`[SHEETS] Updated end attendees for "${title}" at row ${rowNumber}`);
			return true;
		}
	}

	console.warn(`[SHEETS] Could not find row for "${title}" with timestamp ${targetTimestamp}`);
	return false;
}

module.exports = { exportMovieToSheet, fetchGenreFromTMDB, fetchTMDBInfo, updateEndAttendees };
