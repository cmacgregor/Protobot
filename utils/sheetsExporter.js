// utils/sheetsExporter.js
// Google Sheets mirror of the movie log. The database is the source of truth;
// a watchparty is written here once, when it ends.
// Columns A–K: Title (IMDb link), URL, Posted Date, Service, Genre, Rewatch Count,
// Runtime, Host, Start Attendees, End Attendees, Type

const { auth, sheets } = require('@googleapis/sheets');
const { fetchTMDBInfo } = require('./tmdb');

const SHEET_RANGE = 'Sheet1!A2:K2';

let cachedClient = null;

function isSheetsConfigured() {
	return Boolean(process.env.GOOGLE_SHEETS_CREDENTIALS && process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

function getSheetsClient() {
	if (!isSheetsConfigured()) {
		throw new Error('Google Sheets credentials not configured');
	}
	if (!cachedClient) {
		const credentials = JSON.parse(
			Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS, 'base64').toString(),
		);
		const googleAuth = new auth.GoogleAuth({
			credentials,
			scopes: ['https://www.googleapis.com/auth/spreadsheets'],
		});
		cachedClient = sheets({ version: 'v4', auth: googleAuth });
	}
	return cachedClient;
}

const TYPE_LABELS = { movie: 'Movie', tv: 'Show' };

/**
 * Build one sheet row (columns A–K).
 * @param {Object} movie
 * @param {string} [titleValue] - what goes in column A (plain title or a HYPERLINK formula)
 */
function toRow(movie, titleValue = movie.title) {
	return [
		titleValue,
		movie.url,
		movie.postedDate.toLocaleString(),
		movie.service,
		movie.genre || '',
		movie.rewatchCount || 1,
		movie.runtime || '',
		movie.host,
		movie.attendees || '',
		movie.endAttendees || '',
		TYPE_LABELS[movie.mediaType] || '',
	];
}

/** Column A value: a link to IMDb when we know the id. Quotes are doubled so they can't break the formula. */
function titleCell(title, imdbId) {
	return imdbId
		? `=HYPERLINK("https://www.imdb.com/title/${imdbId}/", "${title.replace(/"/g, '""')}")`
		: title;
}

async function appendRows(rows, valueInputOption) {
	await getSheetsClient().spreadsheets.values.append({
		spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
		range: SHEET_RANGE,
		valueInputOption,
		insertDataOption: 'INSERT_ROWS',
		requestBody: { values: rows },
	});
}

/**
 * Append a finished watchparty.
 * @param {Object} movie - title, url, postedDate, service, genre, rewatchCount, runtime, imdbId,
 *   host, attendees (start), endAttendees, mediaType ('movie'|'tv'|null)
 */
async function exportMovieToSheet(movie) {
	// Fail fast before any TMDB lookups
	getSheetsClient();

	let { genre, runtime, imdbId } = movie;
	if (!genre || !runtime || !imdbId) {
		const info = await fetchTMDBInfo(movie.title);
		genre = genre || info.genre || '';
		runtime = runtime || info.runtime;
		imdbId = imdbId || info.imdbId;
	}

	const row = toRow({ ...movie, genre, runtime }, titleCell(movie.title, imdbId));
	// USER_ENTERED so the HYPERLINK formula is evaluated
	await appendRows([row], 'USER_ENTERED');
}

/**
 * Append many entries at once (used by /exportmovies). Values are written as plain text.
 * @param {Object[]} movies
 */
async function exportMoviesToSheet(movies) {
	await appendRows(movies.map(m => toRow(m)), 'RAW');
}

/**
 * All values in the movie log (header row included), as displayed in the sheet.
 * @returns {Promise<string[][]>}
 */
async function readSheetRows() {
	const response = await getSheetsClient().spreadsheets.values.get({
		spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
		range: 'Sheet1!A:K',
	});
	return response.data.values || [];
}

module.exports = {
	isSheetsConfigured,
	exportMovieToSheet,
	exportMoviesToSheet,
	readSheetRows,
	// Exported for tests
	toRow,
	titleCell,
};
