// commands/utility/watchparty.js
const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require('discord.js');
const { normalizeUrl, detectService } = require('../../utils/services');
const { fetchTMDBInfo } = require('../../utils/tmdb');
const { isSheetsConfigured, exportMovieToSheet, updateEndAttendees } = require('../../utils/sheetsExporter');
const watchpartyTracker = require('../../utils/watchpartyTracker');

function voiceMemberTags(channel) {
	return channel ? channel.members.map(m => m.user.tag) : [];
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('watchparty')
		.setDescription('Post a link embed with brand color and large poster image.')
		.addStringOption(o => o.setName('name').setDescription('Display name (used as title)').setRequired(true))
		.addStringOption(o => o.setName('url').setDescription('Target URL').setRequired(true))
		.setContexts(InteractionContextType.Guild),

	category: 'utility',

	async execute(interaction) {
		await interaction.deferReply();

		const title = interaction.options.getString('name', true).trim();
		const parsed = normalizeUrl(interaction.options.getString('url', true).trim());
		if (!parsed) {
			return interaction.editReply('❌ Invalid URL. Please provide a full link like `https://…`');
		}
		const url = parsed.toString();
		const svc = detectService(parsed.hostname);

		const tmdbInfo = await fetchTMDBInfo(title);
		const poster = tmdbInfo.posterUrl
			|| interaction.user.displayAvatarURL({ size: 512, extension: 'png', forceStatic: false });

		const voiceChannel = interaction.member?.voice?.channel;
		const attendees = voiceMemberTags(voiceChannel);
		const startTime = new Date();

		const embed = new EmbedBuilder()
			.setTitle(title)
			.setURL(url)
			.setColor(svc.color)
			.setImage(poster)
			.addFields({ name: 'Link', value: url, inline: false })
			.setFooter({ text: svc.name });

		if (attendees.length > 0) {
			embed.addFields({ name: `Attendees (${attendees.length})`, value: attendees.join(', '), inline: false });
		}

		await interaction.editReply({ embeds: [embed] });

		if (!isSheetsConfigured()) return;

		// Fire and forget: a Sheets failure shouldn't affect the posted embed
		exportMovieToSheet({
			title,
			url,
			postedDate: startTime,
			host: interaction.user.tag,
			service: svc.name,
			attendees: attendees.join(', '),
			genre: tmdbInfo.genre || '',
			rewatchCount: 1,
			runtime: tmdbInfo.runtime,
			imdbId: tmdbInfo.imdbId,
		}).catch(err => console.error('[SHEETS] Failed to export watchparty:', err.message));

		// Auto-capture end attendees once the runtime has elapsed
		if (voiceChannel && tmdbInfo.runtime) {
			watchpartyTracker.startTracking({
				channelId: interaction.channelId,
				voiceChannelId: voiceChannel.id,
				title,
				url,
				host: interaction.user.tag,
				startTime,
				runtime: tmdbInfo.runtime,
				onEnd: () => {
					const endChannel = interaction.guild?.channels.cache.get(voiceChannel.id);
					if (!endChannel?.isVoiceBased()) return;

					const endAttendees = voiceMemberTags(endChannel);
					updateEndAttendees(title, startTime, endAttendees.join(', '))
						.catch(err => console.error('[SHEETS] Failed to update end attendees:', err.message));
					console.log(`[WATCHPARTY] Ended: ${title} - ${endAttendees.length} attendees at end`);
				},
			});
		}
	},
};
