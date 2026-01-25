// commands/utility/watchparty.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

const COLORS = {
	DISCORD_BLURPLE: 0x5865F2,
	NETFLIX: 0xE50914,
	HULU: 0x1CE783,
	DISNEY_PLUS: 0x113CCF,
	PRIME_VIDEO: 0x00A8E1,
	CRUNCHYROLL: 0xF47521,
	MAX: 0x0026FF,
	APPLE_TV: 0x000000,
	PEACOCK: 0xFFC700,
	PARAMOUNT_PLUS: 0x0064FF,
	YOUTUBE: 0xFF0000,
	ANIMEKAI: 0x228B22, // forest green
	TELEPARTY: 0xE54037, // Teleparty red-orange
};

const SERVICES = [
	{ rx: /(^|\.)animekai\.to$/i, color: COLORS.ANIMEKAI, name: 'AnimeKai' },
	{ rx: /(^|\.)netflix\.com$/i, color: COLORS.NETFLIX, name: 'Netflix' },
	{ rx: /(^|\.)hulu\.com$/i, color: COLORS.HULU, name: 'Hulu' },
	{ rx: /(^|\.)disneyplus\.com$/i, color: COLORS.DISNEY_PLUS, name: 'Disney+' },
	{ rx: /(^|\.)primevideo\.com$/i, color: COLORS.PRIME_VIDEO, name: 'Prime Video' },
	{ rx: /(^|\.)amazon\./i, color: COLORS.PRIME_VIDEO, name: 'Prime Video' },
	{ rx: /(^|\.)crunchyroll\.com$/i, color: COLORS.CRUNCHYROLL, name: 'Crunchyroll' },
	{ rx: /(^|\.)max\.com$/i, color: COLORS.MAX, name: 'Max' },
	{ rx: /(^|\.)hbomax\.com$/i, color: COLORS.MAX, name: 'Max' },
	{ rx: /(^|\.)tv\.apple\.com$/i, color: COLORS.APPLE_TV, name: 'Apple TV' },
	{ rx: /(^|\.)apple\.com$/i, color: COLORS.APPLE_TV, name: 'Apple TV' },
	{ rx: /(^|\.)peacocktv\.com$/i, color: COLORS.PEACOCK, name: 'Peacock' },
	{ rx: /(^|\.)paramountplus\.com$/i, color: COLORS.PARAMOUNT_PLUS, name: 'Paramount+' },
	{ rx: /(^|\.)youtube\.com$/i, color: COLORS.YOUTUBE, name: 'YouTube' },
	{ rx: /(^|\.)youtu\.be$/i, color: COLORS.YOUTUBE, name: 'YouTube' },
	{ rx: /(^|\.)teleparty\.com$/i, color: COLORS.TELEPARTY, name: 'Teleparty' }, // NEW
];

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

function detectService(hostname) {
	const host = hostname.toLowerCase();
	for (const s of SERVICES) if (s.rx.test(host)) return s;
	return { color: COLORS.DISCORD_BLURPLE, name: host };
}

async function tmdbPoster(title) {
	if (!TMDB_API_KEY || !title) return null;
	try {
		const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(
			TMDB_API_KEY,
		)}&query=${encodeURIComponent(title)}&include_adult=false&language=en-US&page=1`;
		const res = await fetch(url, { timeout: 6000 });
		if (!res.ok) return null;
		const data = await res.json();
		if (!data?.results?.length) return null;

		const best = data.results.find(r => r.poster_path) || data.results[0];
		if (!best?.poster_path) return null;
		return `https://image.tmdb.org/t/p/w780${best.poster_path}`;
	}
	catch {
		return null;
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('watchparty')
		.setDescription('Post a link embed with brand color and large poster image.')
		.addStringOption(o => o.setName('name').setDescription('Display name (used as title)').setRequired(true))
		.addStringOption(o => o.setName('url').setDescription('Target URL').setRequired(true)),

	async execute(interaction) {
		await interaction.deferReply();

		const title = interaction.options.getString('name', true).trim();
		const rawUrl = interaction.options.getString('url', true).trim();
		const parsed = normalizeUrl(rawUrl);
		if (!parsed) {
			return interaction.editReply('❌ Invalid URL. Please provide a full link like `https://…`');
		}

		const svc = detectService(parsed.hostname);

		// Poster (from TMDB if possible, else user avatar)
		let poster = await tmdbPoster(title);
		if (!poster) {
			poster = interaction.user.displayAvatarURL({ size: 512, extension: 'png', forceStatic: false });
		}

		const embed = new EmbedBuilder()
			.setTitle(title)
			.setURL(parsed.toString())
			.setColor(svc.color)
			.setImage(poster) // large poster image between title & footer
			.addFields({ name: 'Link', value: parsed.toString(), inline: false })
			.setFooter({ text: svc.name });

		await interaction.editReply({ embeds: [embed] });
	},
};
