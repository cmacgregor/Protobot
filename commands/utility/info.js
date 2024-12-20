const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('info')
		.setDescription('Get info about a user or a server!')
		.addSubcommand(subcommand =>
			subcommand
				.setName('user')
				.setDescription('Info about a user')
				.addUserOption(option => option.setName('target').setDescription('The user')))
		.addSubcommand(subcommand =>
			subcommand
				.setName('server')
				.setDescription('Info about the server')),
	category: 'utility',
	async execute(interaction) {
		if (interaction.options.getSubcommand() === 'user') {
			const targetUser = interaction.options.getUser('target');

			if (targetUser) {
				await interaction.reply(`Username: ${targetUser.username}\nID: ${targetUser.id}`);
			}
			else {
				await interaction.reply(`Your username: ${interaction.user.username}\nYour ID: ${interaction.user.id}`);
			}
		}
		else if (interaction.options.getSubcommand() === 'server') {
			await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
		}
		else {
			await interaction.reply('Please Specify an option');
		}
	},
};