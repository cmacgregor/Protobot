// utils/sheetsExporter.js
// Google Sheets writes for the movie log.
// Columns A–J: Title (IMDb link), URL, Posted Date, Service, Genre, Rewatch Count,
// Runtime, Host, Start Attendees, End Attendees

const { auth, sheets } = require('@googleapis/sheets');
const { fetchTMDBInfo } = require('./tmdb');

const SHEET_RANGE = 'Sheet1!A2:J2';

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
		// End attendees are filled in later by updateEndAttendees
		'',
	];
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
 * Append a single watchparty entry. Missing genre/runtime/IMDb id are looked up on TMDB.
 * @param {Object} movie - title, url, postedDate, host, service, attendees, genre?, rewatchCount?, runtime?, imdbId?
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

	// Double any quotes so a title like 'Say "Hi"' can't break the formula
	const titleValue = imdbId
		? `=HYPERLINK("https://www.imdb.com/title/${imdbId}/", "${movie.title.replace(/"/g, '""')}")`
		: movie.title;

	// USER_ENTERED so the HYPERLINK formula is evaluated
	await appendRows([toRow({ ...movie, genre, runtime }, titleValue)], 'USER_ENTERED');
}

/**
 * Append many entries at once (used by /exportmovies). Values are written as plain text.
 * @param {Object[]} movies
 */
async function exportMoviesToSheet(movies) {
	await appendRows(movies.map(m => toRow(m)), 'RAW');
}

/**
 * Fill in end attendees for a watchparty row, matched by title and start time.
 * @returns {Promise<boolean>} true if a row was updated
 */
async function updateEndAttendees(title, startTime, endAttendees) {
	const client = getSheetsClient();
	const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

	const response = await client.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A:J' });
	const rows = response.data.values || [];
	const targetTimestamp = startTime.toLocaleString();

	// Skip the header row; sheet rows are 1-indexed
	const index = rows.findIndex((row, i) => i > 0 && row[0] === title && row[2] === targetTimestamp);
	if (index === -1) {
		console.warn(`[SHEETS] Could not find row for "${title}" with timestamp ${targetTimestamp}`);
		return false;
	}

	const rowNumber = index + 1;
	await client.spreadsheets.values.update({
		spreadsheetId,
		range: `Sheet1!J${rowNumber}`,
		valueInputOption: 'RAW',
		requestBody: { values: [[endAttendees]] },
	});
	console.log(`[SHEETS] Updated end attendees for "${title}" at row ${rowNumber}`);
	return true;
}

module.exports = { isSheetsConfigured, exportMovieToSheet, exportMoviesToSheet, updateEndAttendees };
