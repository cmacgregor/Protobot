// commands/utility/stats.js
const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require('discord.js');
const { getDb } = require('../../utils/db');
const { serverStats, memberStats } = require('../../utils/watchStats');
const { discordTime, userLabel, titleLabel, plural, clampLines } = require('../../utils/format');
const { DEFAULT_COLOR } = require('../../utils/services');

const round1 = n => Math.round(n * 10) / 10;
const orNone = text => text || 'None yet';

function serverEmbed(guildName, s) {
	const embed = new EmbedBuilder()
		.setTitle(`📊 ${guildName} watchparty stats`)
		.setColor(DEFAULT_COLOR)
		.addFields(
			{ name: 'Watchparties', value: String(s.parties), inline: true },
			{ name: 'Titles', value: String(s.titles), inline: true },
			{ name: 'Hours watched', value: String(s.hours), inline: true },
		);

	if (s.weeklyParties > 0) {
		const avg = n => (n === null ? '–' : round1(n));
		embed.addFields({
			name: 'Movie nights',
			value: `${s.weeklyParties} of ${s.parties} parties · avg ${avg(s.avgWatchersWeekly)} watchers `
				+ `(other nights ${avg(s.avgWatchersOther)})`,
		});
	}

	embed.addFields(
		{ name: 'Top genres', value: orNone(s.topGenres.map(g => `${g.genre} (${g.count})`).join(', ')) },
		{
			name: 'Most rewatched',
			value: orNone(clampLines(s.rewatched.map(r => `${titleLabel(r.name, r.year)} · ${r.times}×`))),
		},
		{
			name: 'Top hosts',
			value: orNone(clampLines(s.topHosts.map(h => `${userLabel(h.userId, h.userTag)} · ${h.parties}`))),
			inline: true,
		},
		{
			name: 'Most watched',
			value: orNone(clampLines(s.topViewers.map(v => `${userLabel(v.userId, v.userTag)} · ${v.watched}`))),
			inline: true,
		},
	);
	return embed;
}

function memberEmbed(user, m) {
	const embed = new EmbedBuilder()
		.setTitle(`📊 ${user.displayName ?? user.username}'s watchparty stats`)
		.setColor(DEFAULT_COLOR)
		.setThumbnail(user.displayAvatarURL({ size: 128 }))
		.addFields(
			{ name: 'Watched', value: String(m.watched), inline: true },
			{
				name: 'Attendance',
				value: m.attendanceRate === null ? '–' : `${Math.round(m.attendanceRate * 100)}%`,
				inline: true,
			},
			{ name: 'Hosted', value: String(m.hosted), inline: true },
		);

	// Only parties tracked live have join/leave times
	if (m.liveParties > 0) {
		const lateText = m.lateCount
			? `${m.lateCount} of ${m.liveParties} · avg ${Math.round(m.avgLateMinutes)} min late`
			: `Never (${plural(m.liveParties, 'party', 'parties')})`;
		embed.addFields(
			{ name: 'Arrived late', value: lateText, inline: true },
			{ name: 'Left early', value: `${m.leftEarlyCount} of ${m.liveParties}`, inline: true },
		);
	}

	embed.addFields(
		{ name: 'Favorite genres', value: orNone(m.topGenres.map(g => g.genre).join(', ')) },
		{
			name: 'Recently watched',
			value: orNone(clampLines(m.recent.map(r => `${titleLabel(r.name, r.year)} · ${discordTime(r.startedAt)}`))),
		},
	);
	return embed;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stats')
		.setDescription('Watchparty stats for the server, or for one member')
		.addUserOption(o => o.setName('member').setDescription('Show stats for this member'))
		.setContexts(InteractionContextType.Guild),

	category: 'utility',

	async execute(interaction) {
		const db = getDb();
		const user = interaction.options.getUser('member');

		if (user) {
			const m = memberStats(db, interaction.guildId, user.id);
			if (m.attended === 0) {
				return interaction.reply({
					content: `${userLabel(user.id)} hasn't been to a recorded watchparty yet.`,
					allowedMentions: { parse: [] },
				});
			}
			const member = interaction.options.getMember('member');
			return interaction.reply({
				embeds: [memberEmbed(member ?? user, m)],
				allowedMentions: { parse: [] },
			});
		}

		const s = serverStats(db, interaction.guildId);
		if (s.parties === 0) {
			return interaction.reply('No watchparties recorded yet. Start one with `/watchparty`.');
		}
		await interaction.reply({ embeds: [serverEmbed(interaction.guild.name, s)], allowedMentions: { parse: [] } });
	},

	// Exported for tests
	serverEmbed,
	memberEmbed,
};
