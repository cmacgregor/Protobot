// commands/utility/watched.js
const { SlashCommandBuilder, EmbedBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { getDb } = require('../../utils/db');
const { searchWatchedTitles, titleViewings } = require('../../utils/watchStats');
const { discordTime, userLabel, titleLabel, plural, clampLines } = require('../../utils/format');
const { DEFAULT_COLOR } = require('../../utils/services');

const MAX_VIEWINGS_SHOWN = 10;

function viewingsEmbed({ title, viewings }) {
	const lines = viewings.slice(0, MAX_VIEWINGS_SHOWN).map(v => {
		const who = v.watchers.length ? v.watchers.map(w => userLabel(w.userId, w.userTag)).join(', ') : 'nobody stayed';
		return `${discordTime(v.started_at)}${v.weekly_event_id ? ' 📅' : ''} · ${who}`;
	});
	if (viewings.length > MAX_VIEWINGS_SHOWN) lines.push(`…and ${viewings.length - MAX_VIEWINGS_SHOWN} earlier`);

	const embed = new EmbedBuilder()
		.setTitle(`✅ Watched: ${titleLabel(title.name, title.year)}`)
		.setColor(DEFAULT_COLOR)
		.setDescription(`Watched ${plural(viewings.length, 'time')}.`)
		.addFields({ name: 'When and who', value: clampLines(lines) });
	if (title.poster_url) embed.setThumbnail(title.poster_url);
	return embed;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('watched')
		.setDescription('Have we watched this? When, and who was there')
		.addStringOption(o => o.setName('title')
			.setDescription('Title to look up')
			.setRequired(true)
			.setAutocomplete(true))
		.setContexts(InteractionContextType.Guild),

	category: 'utility',

	async autocomplete(interaction) {
		const query = interaction.options.getFocused().trim();
		const matches = searchWatchedTitles(getDb(), interaction.guildId, query, 25);
		await interaction.respond(matches.map(t => ({
			name: `${titleLabel(t.name, t.year)} · ${t.times}×`.slice(0, 100),
			value: `title:${t.id}`,
		})));
	},

	async execute(interaction) {
		const db = getDb();
		const input = interaction.options.getString('title', true).trim();

		// A pick from the list carries the title id; typed text uses the best match
		const picked = /^title:(\d+)$/.exec(input);
		const titleId = picked
			? Number(picked[1])
			: searchWatchedTitles(db, interaction.guildId, input, 1)[0]?.id;
		const result = titleId ? titleViewings(db, interaction.guildId, titleId) : null;

		if (!result || result.viewings.length === 0) {
			return interaction.reply({
				content: `❌ No record of watching **${picked ? 'that' : input}** here.`,
				flags: MessageFlags.Ephemeral,
				allowedMentions: { parse: [] },
			});
		}
		await interaction.reply({ embeds: [viewingsEmbed(result)], allowedMentions: { parse: [] } });
	},

	// Exported for tests
	viewingsEmbed,
};
