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
	const response = await getSheetsClient().spreadsheets.values.append({
		spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
		range: SHEET_RANGE,
		valueInputOption,
		insertDataOption: 'INSERT_ROWS',
		requestBody: { values: rows },
	});
	return response.data;
}

/**
 * First row number in an A1 range like "Sheet1!A57:J57".
 * @returns {number|null}
 */
function parseRowNumber(range) {
	const match = /![A-Z]+(\d+)/.exec(range || '');
	return match ? Number(match[1]) : null;
}

/**
 * Pick the sheet row for a watchparty from the sheet's values (header included).
 * Prefers the exact Posted Date text; otherwise the newest row with this title
 * and no end attendees yet.
 * @param {string[][]} rows
 * @param {{title: string, postedText?: string|null}} party
 * @returns {number|null} 1-indexed sheet row
 */
function findWatchpartyRow(rows, { title, postedText }) {
	let fallback = null;
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i] || [];
		if (row[0] !== title) continue;
		if (postedText && row[2] === postedText) return i + 1;
		if (!row[9]) fallback = i + 1;
	}
	return fallback;
}

/**
 * Append a single watchparty entry. Missing genre/runtime/IMDb id are looked up on TMDB.
 * @param {Object} movie - title, url, postedDate, host, service, attendees, genre?, rewatchCount?, runtime?, imdbId?
 * @returns {Promise<{row: number|null, postedText: string}>} where it landed, for updating later
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

	const row = toRow({ ...movie, genre, runtime }, titleValue);
	// USER_ENTERED so the HYPERLINK formula is evaluated
	const result = await appendRows([row], 'USER_ENTERED');
	return { row: parseRowNumber(result?.updates?.updatedRange), postedText: row[2] };
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
		range: 'Sheet1!A:J',
	});
	return response.data.values || [];
}

/**
 * Fill in end attendees for a watchparty row.
 * Uses the row recorded at export time when it still holds this title; otherwise searches.
 * @param {{title: string, sheetRow?: number|null, postedText?: string|null}} party
 * @param {string} endAttendees - comma-separated
 * @returns {Promise<boolean>} true if a row was updated
 */
async function updateEndAttendees(party, endAttendees) {
	const client = getSheetsClient();
	const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

	let rowNumber = null;
	if (party.sheetRow) {
		const check = await client.spreadsheets.values.get({
			spreadsheetId,
			range: `Sheet1!A${party.sheetRow}:A${party.sheetRow}`,
		});
		// Rows can move if someone sorts or deletes, so confirm before writing
		if (check.data.values?.[0]?.[0] === party.title) rowNumber = party.sheetRow;
	}
	if (!rowNumber) {
		const response = await client.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A:J' });
		rowNumber = findWatchpartyRow(response.data.values || [], party);
	}
	if (!rowNumber) {
		console.warn(`[SHEETS] Could not find row for "${party.title}"`);
		return false;
	}

	await client.spreadsheets.values.update({
		spreadsheetId,
		range: `Sheet1!J${rowNumber}`,
		valueInputOption: 'RAW',
		requestBody: { values: [[endAttendees]] },
	});
	console.log(`[SHEETS] Updated end attendees for "${party.title}" at row ${rowNumber}`);
	return true;
}

module.exports = {
	isSheetsConfigured,
	exportMovieToSheet,
	exportMoviesToSheet,
	updateEndAttendees,
	readSheetRows,
	// Exported for tests
	parseRowNumber,
	findWatchpartyRow,
};
