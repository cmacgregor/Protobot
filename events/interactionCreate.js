const { Events } = require('discord.js');
const { checkPermission } = require('../utils/permissions');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		// Log command invocation
		const user = `${interaction.user.tag} (${interaction.user.id})`;
		const guild = interaction.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'DM';
		const channel = interaction.channel ? `#${interaction.channel.name}` : 'unknown';
		console.log(`[COMMAND] /${interaction.commandName} invoked by ${user} in ${guild} ${channel}`);

		// Check permissions
		if (command.permissions) {
			const permCheck = await checkPermission(interaction, command.permissions);
			if (!permCheck.allowed) {
				console.log(`[DENIED] /${interaction.commandName} - ${permCheck.reason}`);
				return interaction.reply({
					content: `❌ ${permCheck.reason}`,
					ephemeral: true,
				});
			}
		}

		try {
			await command.execute(interaction);
			console.log(`[SUCCESS] /${interaction.commandName} completed successfully`);
		}
		catch (error) {
			console.error(`[ERROR] /${interaction.commandName} failed for ${user} in ${guild}`);
			console.error(error);
		}
	},
};