const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function extractSlugTitle(url) {
	const match = url.match(/watch\/([a-z0-9-]+)-[a-z0-9]{4,}$/i);
	if (!match) return null;

	const slug = match[1];
	return slug
		.split('-')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

module.exports = {
	match: url => url.includes('animekai.to'),

	getInfo: async url => {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
			if (!res.ok) return null;

			const html = await res.text();
			const $ = cheerio.load(html);

			const rawTitle =
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim();

			const cleanedTitle = rawTitle
				?.replace(/Watch\s+/i, '')
				.replace(/Online\s+Free/i, '')
				.replace(/[-|]\s*AnimeKAI/i, '')
				.trim();

			const extractedFromSlug = extractSlugTitle(url);

			const rawThumbnail =
        $('div.anime__details__pic img').attr('src') ||
        $('div.anime__video__player').attr('data-setbg') ||
        $('meta[property="og:image"]').attr('content');

			const thumbnail = rawThumbnail && !rawThumbnail.includes('banner')
				? rawThumbnail
				: 'https://animekai.to/favicon-32x32.png';

			return {
				title: cleanedTitle || extractedFromSlug || 'Watch this anime',
				thumbnail,
				platform: 'AnimeKai',
				footerNote: `Metadata extracted from AnimeKai${!cleanedTitle && extractedFromSlug ? ' (via fallback)' : ''}`,
			};
		}
		catch (err) {
			console.error('❌ Failed to fetch AnimeKai metadata:', err);
			return null;
		}
	},
};
