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

		// Check permissions
		if (command.permissions) {
			const permCheck = await checkPermission(interaction, command.permissions);
			if (!permCheck.allowed) {
				return interaction.reply({
					content: `❌ ${permCheck.reason}`,
					ephemeral: true,
				});
			}
		}

		try {
			await command.execute(interaction);
		}
		catch (error) {
			console.error(`Error executing ${interaction.commandName}`);
			console.error(error);
		}
	},
};