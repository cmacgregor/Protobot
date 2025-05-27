const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function inferServiceFromThumbnail(url) {
	if (!url) return null;
	if (url.includes('nflxso.net') || url.includes('netflix.com')) return 'Netflix';
	if (url.includes('hulu.com')) return 'Hulu';
	if (url.includes('disneyplus.com')) return 'Disney+';
	if (url.includes('primevideo.com')) return 'Prime Video';
	if (url.includes('crunchyroll.com')) return 'Crunchyroll';
	return null;
}

module.exports = {
	match: url => url.includes('teleparty.com'),

	getInfo: async url => {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
			if (!res.ok) return null;

			const html = await res.text();
			const $ = cheerio.load(html);

			const rawTitle =
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim();

			const thumbnail =
        $('meta[property="og:image"]').attr('content') ||
        'https://www.teleparty.com/images/tp-logo-red.png';

			const cleanedTitle = rawTitle
				.replace(/^Watch\s+/i, '')
				.replace(/\s*\|.*$/, '')
				.trim();

			const inferredPlatform = inferServiceFromThumbnail(thumbnail);
			const isGeneric = !cleanedTitle || cleanedTitle.toLowerCase() === 'teleparty';

			return {
				title: isGeneric ? 'Join the Watch Party!' : cleanedTitle,
				thumbnail,
				platform: 'Teleparty',
				footerNote: inferredPlatform
					? `Watch party synced with ${inferredPlatform}`
					: 'Watch party shared via Teleparty',

			};
		}
		catch (err) {
			console.error('❌ Failed to process Teleparty link:', err);
			return null;
		}
	},
};
