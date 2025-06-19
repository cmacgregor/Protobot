const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function buildResponse({ title, thumbnail, url }) {
	const cleanedTitle = title
		?.replace(/\s*\|\s*Watch.*$/, '')
		.trim();

	const finalTitle = cleanedTitle || title;

	return {
		title: finalTitle,
		thumbnail,
		platform: 'Hulu',
		footerNote: null,
		url,
		color: 0x1ce783, // Hulu green
	};
}

module.exports = {
	platform: 'Hulu',

	match: url => url.includes('hulu.com/watch/'),

	getInfo: async (url, message) => {
		const embed = message.embeds?.[0];

		// ✅ Use embed first if available
		if (embed?.title) {
			return buildResponse({
				title: embed.title,
				thumbnail: embed.thumbnail?.url,
				url,
			});
		}

		// 🛠️ Fallback: fetch and parse
		try {
			const res = await fetch(url, {
				headers: { 'User-Agent': 'Mozilla/5.0' },
			});
			if (!res.ok) return null;

			const html = await res.text();
			const $ = cheerio.load(html);

			const rawTitle =
				$('meta[property="og:title"]').attr('content') ||
				$('title').text().trim();

			const thumbnail = $('meta[property="og:image"]').attr('content');

			if (!rawTitle || rawTitle.toLowerCase().includes('hulu')) {
				console.warn('⚠️ Hulu page returned generic or login-protected content.');
				return null;
			}

			return buildResponse({ title: rawTitle, thumbnail, url });
		}
		catch (err) {
			console.error('❌ Failed to fetch Hulu content:', err);
			return null;
		}
	},
};
