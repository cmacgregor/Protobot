// commands/utility/moviestats.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDatabase } = require('../../utils/database');
const { respondWithWatchpartyChoices } = require('../../utils/ratingPrompt');

const EMBED_COLOR = 0x5865F2;
const MEDALS = ['🥇', '🥈', '🥉'];

function avg(value) {
	return value === null || value === undefined ? '—' : value.toFixed(1);
}

function plural(count, word, pluralWord = `${word}s`) {
	return `${count} ${count === 1 ? word : pluralWord}`;
}

function rank(i) {
	return MEDALS[i] || `**${i + 1}.**`;
}

function percent(value) {
	return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

function emptyEmbed(title, message) {
	return new EmbedBuilder().setTitle(title).setColor(EMBED_COLOR).setDescription(message);
}

function topEmbed(db, order, minRatings) {
	const rows = db.getTopMovies({ order, minRatings, limit: 10 });
	const title = order === 'worst' ? '🍅 Lowest rated movies' : '🏆 Highest rated movies';
	if (!rows.length) return emptyEmbed(title, `No movies with at least ${plural(minRatings, 'rating')} yet.`);

	return new EmbedBuilder()
		.setTitle(title)
		.setColor(EMBED_COLOR)
		.setDescription(rows.map((r, i) =>
			`${rank(i)} **${r.title}** — ${avg(r.average)}/10 (${plural(r.count, 'rating')})`,
		).join('\n'))
		.setFooter({ text: `Minimum ${plural(minRatings, 'rating')}` });
}

function controversialEmbed(db, minRatings) {
	const rows = db.getControversialMovies({ minRatings, limit: 10 });
	const title = '🌶️ Most divisive movies';
	if (!rows.length) return emptyEmbed(title, `No movies with at least ${plural(minRatings, 'rating')} yet.`);

	return new EmbedBuilder()
		.setTitle(title)
		.setColor(EMBED_COLOR)
		.setDescription(rows.map((r, i) =>
			`${rank(i)} **${r.title}** — avg ${avg(r.average)}, spread ±${avg(r.stddev)} (scores ${r.low}–${r.high}, ${plural(r.count, 'rating')})`,
		).join('\n'))
		.setFooter({ text: `Ranked by standard deviation · minimum ${plural(minRatings, 'rating')}` });
}

function movieEmbed(db, title) {
	const stats = db.getMovieStats(title);
	if (!stats.watchparties.length) return emptyEmbed('Movie not found', `No watchparty found for **${title}**.`);

	const embed = new EmbedBuilder()
		.setTitle(`🎬 ${stats.title}`)
		.setColor(EMBED_COLOR)
		.addFields(
			{ name: 'Average', value: stats.count ? `**${avg(stats.average)}**/10` : 'Not rated yet', inline: true },
			{ name: 'Ratings', value: String(stats.count), inline: true },
			{ name: 'Spread', value: stats.count > 1 ? `±${avg(stats.stddev)}` : '—', inline: true },
		);

	if (stats.count) {
		const maxCount = Math.max(...Object.values(stats.distribution));
		const lines = [];
		for (let score = 10; score >= 1; score--) {
			const n = stats.distribution[score] || 0;
			const bar = n ? '█'.repeat(Math.max(1, Math.round((n / maxCount) * 10))) : '';
			lines.push(`\`${String(score).padStart(2)}\` ${bar} ${n || ''}`.trimEnd());
		}
		embed.addFields({ name: 'Distribution', value: lines.join('\n'), inline: false });

		const scores = stats.ratings.map(r => `<@${r.user_id}> ${r.score}`).join(' · ');
		embed.addFields({ name: 'Who rated', value: scores.slice(0, 1024), inline: false });
	}

	const watches = stats.watchparties.slice(0, 5).map(w => {
		const date = new Date(w.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		const attendance = w.ended_at ? `${w.start_count} → ${w.end_count} attendees` : `${w.start_count} attendees`;
		return `${date} · hosted by <@${w.host_id}> · ${attendance}`;
	});
	embed.addFields({ name: `Watched ${plural(stats.watchparties.length, 'time')}`, value: watches.join('\n'), inline: false });

	const latest = stats.watchparties[0];
	const details = [latest.genre, latest.service].filter(Boolean).join(' · ');
	if (details) embed.setFooter({ text: details });
	return embed;
}

function userEmbed(db, user) {
	const stats = db.getUserStats(user.id);
	const a = stats.attendance;
	const embed = new EmbedBuilder()
		.setTitle(`📊 ${user.displayName ?? user.username}'s movie stats`)
		.setColor(EMBED_COLOR)
		.setThumbnail(user.displayAvatarURL({ size: 128 }));

	if (!stats.ratingCount && !a.attended && !a.hosted) {
		return embed.setDescription('No watchparties or ratings yet.');
	}

	let generosity = '—';
	if (stats.generosity !== null) {
		const delta = stats.generosity;
		const label = Math.abs(delta) < 0.25 ? 'in line with the group' : delta > 0 ? 'more generous than the group' : 'harsher than the group';
		generosity = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} (${label})`;
	}

	embed.addFields(
		{ name: 'Movies rated', value: String(stats.ratingCount), inline: true },
		{ name: 'Average score', value: stats.ratingCount ? `${avg(stats.averageScore)}/10` : '—', inline: true },
		{ name: 'vs. group', value: generosity, inline: true },
		{ name: 'Attended', value: String(a.attended), inline: true },
		{ name: 'Stayed to the end', value: a.started ? `${a.stayed}/${a.started} (${percent(a.stayed / a.started)})` : '—', inline: true },
		{ name: 'Hosted', value: String(a.hosted), inline: true },
	);

	if (stats.favoriteGenre) {
		embed.addFields({
			name: 'Favorite genre',
			value: `${stats.favoriteGenre.key} (avg ${avg(stats.favoriteGenre.average)}, ${plural(stats.favoriteGenre.count, 'rating')})`,
			inline: false,
		});
	}
	if (stats.favorites.length) {
		embed.addFields({ name: 'Top picks', value: stats.favorites.map(f => `${f.score}/10 — ${f.title}`).join('\n'), inline: true });
	}
	if (stats.ratingCount > 3) {
		embed.addFields({ name: 'Least favorite', value: stats.leastFavorites.map(f => `${f.score}/10 — ${f.title}`).join('\n'), inline: true });
	}
	return embed;
}

function breakdownEmbed(db, dimension, minRatings) {
	const rows = db.getBreakdown(dimension, { minRatings }).slice(0, 15);
	const titles = { genre: '🎭 Ratings by genre', service: '📺 Ratings by service', host: '🎤 Ratings by host' };
	if (!rows.length) return emptyEmbed(titles[dimension], 'Not enough ratings yet.');

	return new EmbedBuilder()
		.setTitle(titles[dimension])
		.setColor(EMBED_COLOR)
		.setDescription(rows.map((r, i) => {
			const name = dimension === 'host' ? `<@${r.key}>` : `**${r.key}**`;
			return `${rank(i)} ${name} — ${avg(r.average)}/10 (${plural(r.count, 'rating')}, ${plural(r.watchparties, 'watchparty', 'watchparties')})`;
		}).join('\n'))
		.setFooter({ text: `Minimum ${plural(minRatings, 'rating')}` });
}

function attendanceEmbed(db) {
	const stats = db.getAttendanceStats({ limit: 10 });
	const embed = new EmbedBuilder()
		.setTitle('🍿 Watchparty attendance')
		.setColor(EMBED_COLOR)
		.addFields(
			{ name: 'Watchparties', value: String(stats.totalWatchparties), inline: true },
			{ name: 'Unique attendees', value: String(stats.uniqueAttendees), inline: true },
			{ name: 'Stayed to the end', value: percent(stats.retentionRate), inline: true },
		);

	if (stats.endedWatchparties) {
		embed.addFields({
			name: 'Average crowd',
			value: `${avg(stats.averageStart)} at start → ${avg(stats.averageEnd)} at end`,
			inline: false,
		});
	}
	if (stats.leaderboard.length) {
		embed.addFields({
			name: 'Most watchparties attended',
			value: stats.leaderboard.map((r, i) =>
				`${rank(i)} <@${r.user_id}> — ${plural(r.attended, 'watchparty', 'watchparties')} (${r.finished} to the end)`,
			).join('\n'),
			inline: false,
		});
	}
	embed.setFooter({ text: 'Retention only counts watchparties whose end was recorded' });
	return embed;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('moviestats')
		.setDescription('Watchparty ratings and attendance stats')
		.addSubcommand(sc => sc
			.setName('top')
			.setDescription('Highest or lowest rated movies')
			.addStringOption(o => o
				.setName('order')
				.setDescription('Best or worst first')
				.addChoices({ name: 'Best', value: 'best' }, { name: 'Worst', value: 'worst' }))
			.addIntegerOption(o => o
				.setName('min_ratings')
				.setDescription('Only include movies with at least this many ratings (default 2)')
				.setMinValue(1)))
		.addSubcommand(sc => sc
			.setName('movie')
			.setDescription('Stats for one movie')
			.addStringOption(o => o
				.setName('movie')
				.setDescription('Movie title')
				.setRequired(true)
				.setAutocomplete(true)))
		.addSubcommand(sc => sc
			.setName('user')
			.setDescription('Rating and attendance stats for a member')
			.addUserOption(o => o.setName('user').setDescription('Member (defaults to you)')))
		.addSubcommand(sc => sc
			.setName('breakdown')
			.setDescription('Average rating by genre, service, or host')
			.addStringOption(o => o
				.setName('by')
				.setDescription('What to group by')
				.setRequired(true)
				.addChoices(
					{ name: 'Genre', value: 'genre' },
					{ name: 'Service', value: 'service' },
					{ name: 'Host', value: 'host' },
				))
			.addIntegerOption(o => o
				.setName('min_ratings')
				.setDescription('Only include groups with at least this many ratings (default 1)')
				.setMinValue(1)))
		.addSubcommand(sc => sc
			.setName('controversial')
			.setDescription('Movies the group disagreed on the most')
			.addIntegerOption(o => o
				.setName('min_ratings')
				.setDescription('Only include movies with at least this many ratings (default 3)')
				.setMinValue(2)))
		.addSubcommand(sc => sc
			.setName('attendance')
			.setDescription('Attendance leaderboard and how many people stay to the end'))
		.setDMPermission(false),

	category: 'utility',

	async autocomplete(interaction) {
		await respondWithWatchpartyChoices(interaction, { byTitle: true });
	},

	async execute(interaction) {
		const db = getDatabase();
		const sub = interaction.options.getSubcommand();
		const minRatings = interaction.options.getInteger('min_ratings');

		let embed;
		switch (sub) {
		case 'top':
			embed = topEmbed(db, interaction.options.getString('order') || 'best', minRatings ?? 2);
			break;
		case 'movie':
			embed = movieEmbed(db, interaction.options.getString('movie', true));
			break;
		case 'user':
			embed = userEmbed(db, interaction.options.getUser('user') || interaction.user);
			break;
		case 'breakdown':
			embed = breakdownEmbed(db, interaction.options.getString('by', true), minRatings ?? 1);
			break;
		case 'controversial':
			embed = controversialEmbed(db, minRatings ?? 3);
			break;
		case 'attendance':
			embed = attendanceEmbed(db);
			break;
		}

		// Mentions inside embeds never ping, but disable them anyway in case content is added later
		await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
	},
};
