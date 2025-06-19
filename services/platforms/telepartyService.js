const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

function inferServiceFromUrl(url) {
	if (!url) return null;
	if (url.includes('netflix.com')) return 'Netflix';
	if (url.includes('hulu.com')) return 'Hulu';
	if (url.includes('disneyplus.com')) return 'Disney+';
	if (url.includes('primevideo.com')) return 'Prime Video';
	if (url.includes('crunchyroll.com')) return 'Crunchyroll';
	return null;
}

function extractTargetServiceUrl($) {
	const iframeSrc = $('iframe').attr('src');
	if (iframeSrc) return iframeSrc;

	const metaRedirect = $('meta[http-equiv="refresh"]').attr('content');
	if (metaRedirect) {
		const match = metaRedirect.match(/URL=['"]?(https?:\/\/[^'"]+)['"]?/i);
		if (match) return match[1];
	}

	const anchor = $('a[href*="netflix.com"], a[href*="hulu.com"], a[href*="disneyplus.com"]').attr('href');
	if (anchor) return anchor;

	return null;
}

function buildResponse({ title, thumbnail, inferredPlatform, url }) {
	const cleanedTitle = title
		?.replace(/^Watch\s+/i, '')
		.replace(/\s*\|.*$/, '')
		.trim();

	const finalTitle = !cleanedTitle || cleanedTitle.toLowerCase() === 'teleparty'
		? 'Join the Watch Party!'
		: cleanedTitle;

	return {
		title: finalTitle,
		thumbnail: thumbnail || 'https://www.teleparty.com/images/tp-logo-red.png',
		platform: inferredPlatform ? `${inferredPlatform} via Teleparty` : 'Teleparty',
		footerNote: inferredPlatform
			? `Watch party synced with ${inferredPlatform}`
			: 'Watch party shared via Teleparty',
		url,
		color: 0xff3366,
	};
}

module.exports = {
	platform: 'Teleparty',
	match: url => url.includes('teleparty.com'),

	getInfo: async (url, message) => {
		const embed = message.embeds?.[0];

		// ✅ Prefer embed if available
		if (embed?.title) {
			const inferredPlatform = inferServiceFromUrl(embed.thumbnail?.url || '');
			return buildResponse({
				title: embed.title,
				thumbnail: embed.thumbnail?.url,
				inferredPlatform,
				url,
			});
		}

		// 🛠️ Fallback: external fetch
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

			const streamUrl = extractTargetServiceUrl($);
			const inferredPlatform = inferServiceFromUrl(streamUrl);

			return buildResponse({
				title: rawTitle,
				thumbnail,
				inferredPlatform,
				url,
			});
		}
		catch (err) {
			console.error('❌ Failed to fetch Teleparty page:', err);
			return null;
		}
	},
};
