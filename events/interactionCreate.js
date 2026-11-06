const { Events, MessageFlags } = require('discord.js');
const { checkPermission } = require('../utils/permissions');

// Reply ephemerally whether or not the command already replied or deferred
async function replyEphemeral(interaction, content) {
	const payload = { content, flags: MessageFlags.Ephemeral };
	if (interaction.deferred && !interaction.replied) return interaction.editReply(content);
	if (interaction.replied) return interaction.followUp(payload);
	return interaction.reply(payload);
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		const user = `${interaction.user.tag} (${interaction.user.id})`;
		const guild = interaction.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'DM';
		const channel = interaction.channel ? `#${interaction.channel.name}` : 'unknown';
		console.log(`[COMMAND] /${interaction.commandName} invoked by ${user} in ${guild} ${channel}`);

		if (command.permissions) {
			const permCheck = await checkPermission(interaction, command.permissions);
			if (!permCheck.allowed) {
				console.log(`[DENIED] /${interaction.commandName} - ${permCheck.reason}`);
				return replyEphemeral(interaction, `❌ ${permCheck.reason}`);
			}
		}

		try {
			await command.execute(interaction);
			console.log(`[SUCCESS] /${interaction.commandName} completed successfully`);
		}
		catch (error) {
			console.error(`[ERROR] /${interaction.commandName} failed for ${user} in ${guild}`);
			console.error(error);
			// Let the user know instead of leaving Discord's "interaction failed" message
			try {
				await replyEphemeral(interaction, '❌ Something went wrong running that command.');
			}
			catch (replyError) {
				console.error('[ERROR] Could not send error reply:', replyError.message);
			}
		}
	},
};
