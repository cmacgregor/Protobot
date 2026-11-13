// commands/utility/history.js
const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require('discord.js');
const { getDb } = require('../../utils/db');
const { listHistory } = require('../../utils/watchStats');
const { discordTime, userLabel, titleLabel, ordinal, plural, clampLines } = require('../../utils/format');
const { DEFAULT_COLOR } = require('../../utils/services');

const PER_PAGE = 10;

function historyLine(item) {
	const parts = [
		`**${titleLabel(item.title_name || item.display_name, item.year)}**`,
		discordTime(item.started_at),
		`${plural(item.watchers, 'watcher')}`,
		`host ${userLabel(item.host_id, item.host_tag)}`,
	];
	if (item.watch_number > 1) parts.push(`🔁 ${ordinal(item.watch_number)} watch`);
	if (item.weekly_event_id) parts.push('📅 movie night');
	return parts.join(' · ');
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('history')
		.setDescription('What we\'ve watched, newest first')
		.addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))
		.setContexts(InteractionContextType.Guild),

	category: 'utility',

	async execute(interaction) {
		const { total, page, pages, items } = listHistory(getDb(), interaction.guildId, {
			page: interaction.options.getInteger('page') ?? 1,
			perPage: PER_PAGE,
		});

		if (total === 0) {
			return interaction.reply('No watchparties recorded yet. Start one with `/watchparty`.');
		}

		const embed = new EmbedBuilder()
			.setTitle('🎬 Watch history')
			.setColor(DEFAULT_COLOR)
			.setDescription(clampLines(items.map(historyLine), 4096))
			.setFooter({ text: `Page ${page} of ${pages} · ${plural(total, 'watchparty', 'watchparties')}` });

		await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
	},

	// Exported for tests
	historyLine,
};
