// utils/services.js
// Streaming-service detection and URL helpers shared by commands and utils.

const DEFAULT_COLOR = 0x5865F2;

// Order matters: the first matching pattern wins.
const SERVICES = [
	{ rx: /(^|\.)animekai\.to$/i, name: 'AnimeKai', color: 0x228B22 },
	{ rx: /(^|\.)netflix\.com$/i, name: 'Netflix', color: 0xE50914 },
	{ rx: /(^|\.)hulu\.com$/i, name: 'Hulu', color: 0x1CE783 },
	{ rx: /(^|\.)disneyplus\.com$/i, name: 'Disney+', color: 0x113CCF },
	{ rx: /(^|\.)primevideo\.com$/i, name: 'Prime Video', color: 0x00A8E1 },
	{ rx: /(^|\.)amazon\./i, name: 'Prime Video', color: 0x00A8E1 },
	{ rx: /(^|\.)crunchyroll\.com$/i, name: 'Crunchyroll', color: 0xF47521 },
	{ rx: /(^|\.)max\.com$/i, name: 'Max', color: 0x0026FF },
	{ rx: /(^|\.)hbomax\.com$/i, name: 'Max', color: 0x0026FF },
	{ rx: /(^|\.)tv\.apple\.com$/i, name: 'Apple TV', color: 0x000000 },
	{ rx: /(^|\.)apple\.com$/i, name: 'Apple TV', color: 0x000000 },
	{ rx: /(^|\.)peacocktv\.com$/i, name: 'Peacock', color: 0xFFC700 },
	{ rx: /(^|\.)paramountplus\.com$/i, name: 'Paramount+', color: 0x0064FF },
	{ rx: /(^|\.)youtube\.com$/i, name: 'YouTube', color: 0xFF0000 },
	{ rx: /(^|\.)youtu\.be$/i, name: 'YouTube', color: 0xFF0000 },
	{ rx: /(^|\.)teleparty\.com$/i, name: 'Teleparty', color: 0xE54037 },
	{ rx: /(^|\.)themoviedb\.org$/i, name: 'TMDB', color: DEFAULT_COLOR },
	{ rx: /(^|\.)imdb\.com$/i, name: 'IMDb', color: DEFAULT_COLOR },
];

/**
 * Parse user input into a URL, adding https:// when the scheme is missing.
 * @param {string} input
 * @returns {URL|null} null if the input isn't a valid http(s) URL
 */
function normalizeUrl(input) {
	try {
		const withScheme = /^(https?:)?\/\//i.test(input) ? input : `https://${input}`;
		const u = new URL(withScheme);
		if (!u.protocol.startsWith('http')) return null;
		return u;
	}
	catch {
		return null;
	}
}

/**
 * @param {string} hostname
 * @returns {{name: string, color: number}} the hostname itself when no service matches
 */
function detectService(hostname) {
	const host = hostname.toLowerCase();
	const match = SERVICES.find(s => s.rx.test(host));
	return match
		? { name: match.name, color: match.color }
		: { name: host, color: DEFAULT_COLOR };
}

module.exports = { normalizeUrl, detectService, DEFAULT_COLOR };
