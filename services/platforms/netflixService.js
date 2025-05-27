// netflixService.js
const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
	match: url => url.includes('netflix.com'),

	getInfo: async url => {
		const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
		if (!res.ok) return null;

		const html = await res.text();
		const $ = cheerio.load(html);
		const rawTitle = $('title').text().trim();
		const ogImage = $('meta[property="og:image"]').attr('content');

		// Defensive fallback
		if (!rawTitle || rawTitle === 'Netflix') {
			console.warn('⚠️ Netflix page returned generic title (likely login wall).');
			return null;
		}

		const title = rawTitle.replace(/^Watch\s+/, '').replace(/\s*\|.*/, '').trim();

		return {
			title,
			thumbnail: ogImage || null,
			platform: 'Netflix',
			footerNote: null,
		};
	},

};
