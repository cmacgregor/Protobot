const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function buildResponse({ title, thumbnail, url }) {
	const cleanedTitle = title
		?.replace(/^Watch\s+/, '')
		.replace(/\s*\|.*/, '')
		.trim();

	const finalTitle = cleanedTitle || title;

	return {
		title: finalTitle,
		thumbnail,
		platform: 'Netflix',
		footerNote: null,
		url,
		color: 0xe50914,
	};
}

module.exports = {
	platform: 'Netflix',

	match: url => /^https?:\/\/(www\.)?netflix\.com\/watch\/\d+/.test(url),

	getInfo: async (url, message) => {
		const embed = message.embeds?.[0];
		if (embed?.title) {
			return buildResponse({
				title: embed.title,
				thumbnail: embed.thumbnail?.url,
				url,
			});
		}

		const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
		if (!res.ok) return null;

		const html = await res.text();
		const $ = cheerio.load(html);

		const title = $('title').text().trim();
		const thumbnail = $('meta[property="og:image"]').attr('content');

		if (!title || title === 'Netflix') return null;

		return buildResponse({ title, thumbnail, url });
	},
};
