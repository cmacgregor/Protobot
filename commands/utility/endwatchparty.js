// commands/utility/endwatchparty.js
const { SlashCommandBuilder } = require('discord.js');
const watchpartyTracker = require('../../utils/watchpartyTracker');
const { finishWatchparty } = require('../../utils/ratingPrompt');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('endwatchparty')
		.setDescription('Manually end the active watchparty and record final attendees')
		.setDMPermission(false),

	category: 'utility',

	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });

		// Check if there's an active watchparty in this channel
		const party = watchpartyTracker.getActive(interaction.channelId);

		if (!party) {
			return interaction.editReply('❌ No active watchparty found in this channel.');
		}

		// Get current voice channel attendees
		const voiceChannel = interaction.member?.voice?.channel;
		if (!voiceChannel) {
			return interaction.editReply('❌ You must be in a voice channel to end the watchparty.');
		}

		// Verify it's the same voice channel as the watchparty
		if (voiceChannel.id !== party.voiceChannelId) {
			return interaction.editReply('❌ You must be in the watchparty voice channel to end it.');
		}

		// End tracking (clears timer), then record end attendees and post the rating prompt
		watchpartyTracker.endTracking(interaction.channelId);
		const { endAttendees, sheetUpdated } = await finishWatchparty(party, voiceChannel.members, interaction.channel);

		const lines = [
			`✅ Watchparty ended: **${party.title}**`,
			`Started: ${party.startTime.toLocaleString()}`,
			`Final attendees (${endAttendees.length}): ${endAttendees.join(', ')}`,
		];
		if (sheetUpdated === false) {
			lines.push('⚠️ Could not update the Google Sheets entry.');
		}
		await interaction.editReply(lines.join('\n'));

		console.log(`[WATCHPARTY] Manually ended by ${interaction.user.tag}: ${party.title}`);
	},
};
