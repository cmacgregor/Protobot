// utils/movieExtractor.js
const fetch = require('node-fetch');
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

// Port from watchparty.js
function normalizeUrl(input) {
	try {
		const withScheme = /^(https?:)?\/\//i.test(input) ? input : `https://${input}`;
		const u = new URL(withScheme);
		if (!u.protocol.startsWith('http')) throw new Error('Invalid protocol');
		return u;
	}
	catch {
		return null;
	}
}

const SERVICES = [
	{ rx: /(^|\.)netflix\.com$/i, name: 'Netflix' },
	{ rx: /(^|\.)hulu\.com$/i, name: 'Hulu' },
	{ rx: /(^|\.)disneyplus\.com$/i, name: 'Disney+' },
	{ rx: /(^|\.)primevideo\.com$/i, name: 'Prime Video' },
	{ rx: /(^|\.)amazon\./i, name: 'Prime Video' },
	{ rx: /(^|\.)crunchyroll\.com$/i, name: 'Crunchyroll' },
	{ rx: /(^|\.)max\.com$/i, name: 'Max' },
	{ rx: /(^|\.)hbomax\.com$/i, name: 'Max' },
	{ rx: /(^|\.)tv\.apple\.com$/i, name: 'Apple TV' },
	{ rx: /(^|\.)apple\.com$/i, name: 'Apple TV' },
	{ rx: /(^|\.)youtube\.com$/i, name: 'YouTube' },
	{ rx: /(^|\.)youtu\.be$/i, name: 'YouTube' },
	{ rx: /(^|\.)teleparty\.com$/i, name: 'Teleparty' },
	{ rx: /(^|\.)themoviedb\.org$/i, name: 'TMDB' },
	{ rx: /(^|\.)imdb\.com$/i, name: 'IMDb' },
	{ rx: /(^|\.)animekai\.to$/i, name: 'AnimeKai' },
	{ rx: /(^|\.)peacocktv\.com$/i, name: 'Peacock' },
	{ rx: /(^|\.)paramountplus\.com$/i, name: 'Paramount+' },
];

function detectService(hostname) {
	const host = hostname.toLowerCase();
	for (const s of SERVICES) if (s.rx.test(host)) return s.name;
	return hostname;
}

// TMDB API wrapper
async function searchTMDB(query) {
	if (!TMDB_API_KEY || !query) return null;
	try {
		const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(TMDB_API_KEY)}&query=${encodeURIComponent(query)}&include_adult=false`;
		const res = await fetch(url, { timeout: 6000 });
		if (!res.ok) return null;
		const data = await res.json();
		return data?.results?.[0]?.title || data?.results?.[0]?.name || null;
	}
	catch {
		return null;
	}
}

// Extract title from Open Graph metadata
async function fetchOpenGraphTitle(url) {
	try {
		const res = await fetch(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
		if (!res.ok) return null;
		const html = await res.text();
		const match = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
		if (match) return match[1];
		// Fallback to title tag
		const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
		return titleMatch ? titleMatch[1] : null;
	}
	catch {
		return null;
	}
}

// Extract potential movie title from message text
function extractTitleFromMessage(messageText, url) {
	// Remove the URL from the message text to get surrounding context
	const textWithoutUrl = messageText.replace(url, '').trim();

	// Look for quoted strings (common pattern: "Movie Name" https://link)
	const quotedMatch = textWithoutUrl.match(/["']([^"']+)["']/);
	if (quotedMatch && quotedMatch[1].length > 3) {
		return quotedMatch[1].trim();
	}

	// Look for text before common phrases
	const beforePhrases = /(.*?)\s*(watch|watching|link|party|join|tonight|now|@|https?:)/i;
	const beforeMatch = textWithoutUrl.match(beforePhrases);
	if (beforeMatch && beforeMatch[1] && beforeMatch[1].length > 3) {
		return beforeMatch[1].trim();
	}

	// If message is short enough, it might be the title itself
	if (textWithoutUrl.length > 3 && textWithoutUrl.length < 100) {
		// Remove common noise words
		const cleaned = textWithoutUrl
			.replace(/^(watch|watching|check out|join me for)\s+/i, '')
			.replace(/\s+(tonight|now|later|anyone\??)$/i, '')
			.trim();
		if (cleaned.length > 3) {
			return cleaned;
		}
	}

	return null;
}

// Main extraction function - now accepts optional message text and Discord embed
async function extractMovieFromUrl(url, messageText = null, discordEmbed = null) {
	const parsed = normalizeUrl(url);
	if (!parsed) return null;

	// Skip Twitch links (not movies/shows)
	if (/(^|\.)twitch\.tv$/i.test(parsed.hostname)) {
		return null;
	}

	const service = detectService(parsed.hostname);
	let title = null;

	// TMDB URLs - extract movie ID and fetch title
	if (/(^|\.)themoviedb\.org$/i.test(parsed.hostname)) {
		const match = parsed.pathname.match(/\/(movie|tv)\/\d+-([^/?]+)/);
		if (match) {
			// Extract title from URL slug
			title = match[2].replace(/-/g, ' ');
		}
		else {
			title = await fetchOpenGraphTitle(url);
		}
	}

	// IMDb URLs - search by title from URL or fetch OG
	else if (/(^|\.)imdb\.com$/i.test(parsed.hostname)) {
		title = await fetchOpenGraphTitle(url);
		// Clean IMDb title format (often includes "- IMDb" suffix)
		if (title) {
			title = title.replace(/\s*-\s*IMDb\s*$/i, '').trim();
		}
	}

	// Teleparty URLs - try multiple strategies
	else if (/(^|\.)teleparty\.com$/i.test(parsed.hostname)) {
		// Strategy 1: Extract embedded URL from query params
		const embeddedUrl = parsed.searchParams.get('url');
		if (embeddedUrl) {
			const nested = await extractMovieFromUrl(embeddedUrl, messageText, discordEmbed);
			if (nested && nested.title !== 'Teleparty Session') {
				// Update service to show it's from Teleparty
				return {
					...nested,
					service: `${nested.service} (Teleparty)`,
				};
			}
		}

		// Strategy 2: Try to extract from message text
		if (messageText) {
			const extractedTitle = extractTitleFromMessage(messageText, url);
			if (extractedTitle) {
				title = extractedTitle;
			}
		}

		// Strategy 3: Fallback
		if (!title) {
			title = 'Teleparty Session';
		}
	}

	// Netflix URLs - special handling (multi-strategy)
	else if (/(^|\.)netflix\.com$/i.test(parsed.hostname)) {
		// Strategy 1: Check if Discord auto-embedded the link with title
		if (discordEmbed?.title) {
			title = discordEmbed.title
				.replace(/^Watch\s+/i, '')
				.replace(/\s*\|\s*Netflix.*$/i, '')
				.replace(/\s*-\s*Netflix.*$/i, '')
				.trim();
		}

		// Strategy 2: Try fetching Open Graph metadata from the page
		if (!title) {
			title = await fetchOpenGraphTitle(url);

			// Clean Netflix-specific title formats
			if (title) {
				title = title
					.replace(/^Watch\s+/i, '')
					.replace(/\s*\|\s*Netflix.*$/i, '')
					.replace(/\s*-\s*Netflix.*$/i, '')
					.replace(/^Netflix\s*[-:]\s*/i, '')
					.trim();
			}
		}

		// Strategy 3: If title is just "Netflix" or empty, try extracting from message text
		if (!title || title.toLowerCase() === 'netflix') {
			if (messageText) {
				const extractedTitle = extractTitleFromMessage(messageText, url);
				if (extractedTitle) {
					title = extractedTitle;
				}
			}
		}

		// Final fallback - if we still don't have a good title, return null
		if (!title || title.toLowerCase() === 'netflix') {
			title = null;
		}
	}

	// Other streaming services and generic URLs - try Open Graph
	else {
		title = await fetchOpenGraphTitle(url);
		// Clean common suffixes
		if (title) {
			title = title
				.replace(/^Watch\s+/i, '')
				.replace(/\s*\|.*$/, '')
				.replace(/\s*-\s*(Netflix|Hulu|Disney\+|Prime Video|YouTube|Max|Apple TV).*$/i, '')
				.trim();
		}
	}

	// Fallback: use hostname
	if (!title) {
		title = parsed.hostname;
	}

	return {
		title: title,
		sourceUrl: url,
		service: service,
	};
}

module.exports = { extractMovieFromUrl };
