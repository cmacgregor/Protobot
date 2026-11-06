// commands/utility/endwatchparty.js
const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { getManager } = require('../../utils/watchpartyManager');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('endwatchparty')
		.setDescription('End the watchparty in this channel now and record who watched')
		.setContexts(InteractionContextType.Guild),

	category: 'utility',

	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const manager = getManager();
		const party = manager.getActive(interaction.channelId);
		if (!party) {
			return interaction.editReply('❌ No active watchparty in this channel.');
		}

		// The host, or anyone watching, can end it
		const inPartyVoice = interaction.member?.voice?.channelId === party.voice_channel_id;
		if (interaction.user.id !== party.host_id && !inPartyVoice) {
			return interaction.editReply('❌ Only the host or someone in the watchparty voice channel can end it.');
		}

		const summary = await manager.end(party.id, 'manual');
		const watched = summary?.attendees.filter(a => a.watched).length ?? 0;
		await interaction.editReply(`✅ Ended **${party.display_name}**. ${watched} watched it.`);
		console.log(`[WATCHPARTY] Manually ended by ${interaction.user.tag}: ${party.display_name}`);
	},
};
