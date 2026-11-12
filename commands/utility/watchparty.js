// commands/utility/watchparty.js
const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require('discord.js');
const { normalizeUrl, detectService } = require('../../utils/services');
const { searchTitles, getTitleDetails, findTitle } = require('../../utils/tmdb');
const { getManager } = require('../../utils/watchpartyManager');
const { voiceMembers, findLiveEvent } = require('../../utils/discordVoice');

// Autocomplete values look like "tmdb:movie:348"
const PICK_RX = /^tmdb:(movie|tv):(\d+)$/;

// Autocomplete fires on every keystroke; remember recent searches
const SEARCH_CACHE_MS = 10 * 60 * 1000;
const searchCache = new Map();

async function cachedSearch(query) {
	const key = query.toLowerCase();
	const hit = searchCache.get(key);
	if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) return hit.results;
	// Discord gives autocomplete 3 seconds to respond
	const results = await searchTitles(query, { limit: 10, timeoutMs: 2000 });
	searchCache.set(key, { at: Date.now(), results });
	if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value);
	return results;
}

function choiceLabel(t) {
	const label = `${t.name}${t.year ? ` (${t.year})` : ''} · ${t.mediaType === 'tv' ? 'Show' : 'Movie'}`;
	return label.length > 100 ? `${label.slice(0, 99)}…` : label;
}

/**
 * Resolve the name option: a TMDB pick from autocomplete, or free text we look up.
 * @returns {Promise<{displayName: string, title: Object}>}
 */
async function resolveTitle(input) {
	const pick = PICK_RX.exec(input);
	if (pick) {
		const details = await getTitleDetails(pick[1], Number(pick[2]));
		if (details) return { displayName: details.name, title: details };
	}
	// Free text: keep what they typed as the display name, but link a TMDB match if there is one
	const match = await findTitle(input);
	return { displayName: input, title: match ?? { name: input } };
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('watchparty')
		.setDescription('Start a watchparty: posts the link and records who watches.')
		.addStringOption(o => o.setName('name')
			.setDescription('Movie or show (pick from the list to link it to TMDB)')
			.setRequired(true)
			.setAutocomplete(true))
		.addStringOption(o => o.setName('url').setDescription('Where to watch it').setRequired(true))
		.setContexts(InteractionContextType.Guild),

	category: 'utility',

	async autocomplete(interaction) {
		const query = interaction.options.getFocused().trim();
		if (query.length < 2) return interaction.respond([]);
		const results = await cachedSearch(query);
		await interaction.respond(results.map(t => ({
			name: choiceLabel(t),
			value: `tmdb:${t.mediaType}:${t.tmdbId}`,
		})));
	},

	async execute(interaction) {
		await interaction.deferReply();

		const parsed = normalizeUrl(interaction.options.getString('url', true).trim());
		if (!parsed) {
			return interaction.editReply('❌ Invalid URL. Please provide a full link like `https://…`');
		}
		const url = parsed.toString();
		const svc = detectService(parsed.hostname);

		const { displayName, title } = await resolveTitle(interaction.options.getString('name', true).trim());
		const voiceChannel = interaction.member?.voice?.channel ?? null;
		const members = voiceMembers(voiceChannel) ?? [];
		const liveEvent = voiceChannel ? await findLiveEvent(interaction.guild, voiceChannel.id) : null;

		const embed = new EmbedBuilder()
			.setTitle(title.year ? `${displayName} (${title.year})` : displayName)
			.setURL(url)
			.setColor(svc.color)
			.setImage(title.posterUrl
				|| interaction.user.displayAvatarURL({ size: 512, extension: 'png', forceStatic: false }))
			.addFields({ name: 'Link', value: url, inline: false })
			.setFooter({ text: liveEvent ? `${svc.name} · ${liveEvent.name}` : svc.name });

		if (members.length > 0) {
			embed.addFields({
				name: `Attendees (${members.length})`,
				value: members.map(m => m.tag).join(', '),
				inline: false,
			});
		}
		if (!voiceChannel) {
			embed.addFields({ name: 'Attendance', value: 'Not tracked: join a voice channel before starting.', inline: false });
		}

		await interaction.editReply({ embeds: [embed] });

		// Attendance needs a voice channel; without one this is just a link post
		if (!voiceChannel) return;

		// Recorded in the database now; mirrored to Google Sheets when it ends
		await getManager().start({
			guildId: interaction.guildId,
			channelId: interaction.channelId,
			voiceChannelId: voiceChannel.id,
			hostId: interaction.user.id,
			hostTag: interaction.user.tag,
			displayName,
			url,
			title,
			weeklyEventId: liveEvent?.id ?? null,
			members,
		});
	},
};
