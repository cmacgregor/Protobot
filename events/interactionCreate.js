const { Events } = require('discord.js');
const { checkPermission } = require('../utils/permissions');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isAutocomplete()) return handleAutocomplete(interaction);
		if (interaction.isButton()) return handleButton(interaction);
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

async function handleAutocomplete(interaction) {
	const command = interaction.client.commands.get(interaction.commandName);
	if (!command?.autocomplete) return;

	try {
		await command.autocomplete(interaction);
	}
	catch (error) {
		console.error(`[ERROR] Autocomplete for /${interaction.commandName} failed:`, error);
	}
}

// Button custom IDs are prefixed with the name of the command that owns them, e.g. rate:12:8
async function handleButton(interaction) {
	const commandName = interaction.customId.split(':')[0];
	const command = interaction.client.commands.get(commandName);
	if (!command?.handleButton) return;

	try {
		await command.handleButton(interaction);
	}
	catch (error) {
		console.error(`[ERROR] Button ${interaction.customId} failed for ${interaction.user.tag}:`, error);
		const reply = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
		await (interaction.replied || interaction.deferred ? interaction.followUp(reply) : interaction.reply(reply)).catch(() => null);
	}
}
