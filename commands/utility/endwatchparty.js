// commands/utility/endwatchparty.js
const { SlashCommandBuilder } = require('discord.js');
const { updateEndAttendees } = require('../../utils/sheetsExporter');
const watchpartyTracker = require('../../utils/watchpartyTracker');

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

		// Capture end attendees
		const endAttendees = voiceChannel.members.map(m => m.user.tag);

		// End tracking (clears timer)
		watchpartyTracker.endTracking(interaction.channelId);

		// Update Google Sheets with end attendees
		if (process.env.GOOGLE_SHEETS_CREDENTIALS && process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
			try {
				const updated = await updateEndAttendees(party.title, party.startTime, endAttendees.join(', '));

				if (updated) {
					await interaction.editReply(
						`✅ Watchparty ended: **${party.title}**\n` +
						`Started with: ${party.startTime.toLocaleString()}\n` +
						`Final attendees (${endAttendees.length}): ${endAttendees.join(', ')}`,
					);
				}
				else {
					await interaction.editReply(
						'⚠️ Watchparty ended but could not find sheet entry to update.\n' +
						`Movie: **${party.title}**\n` +
						`Final attendees (${endAttendees.length}): ${endAttendees.join(', ')}`,
					);
				}
			}
			catch (error) {
				console.error('[SHEETS] Failed to update end attendees:', error);
				await interaction.editReply(
					'⚠️ Watchparty ended but sheet update failed.\n' +
					`Movie: **${party.title}**\n` +
					`Final attendees (${endAttendees.length}): ${endAttendees.join(', ')}\n` +
					`Error: ${error.message}`,
				);
			}
		}
		else {
			await interaction.editReply(
				`✅ Watchparty ended: **${party.title}**\n` +
				`Final attendees (${endAttendees.length}): ${endAttendees.join(', ')}\n` +
				'(Google Sheets not configured - data not saved)',
			);
		}

		console.log(`[WATCHPARTY] Manually ended by ${interaction.user.tag}: ${party.title}`);
	},
};
