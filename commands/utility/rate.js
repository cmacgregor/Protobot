// commands/utility/rate.js
const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('../../utils/database');
const { formatSummary, handleRatingButton, respondWithWatchpartyChoices } = require('../../utils/ratingPrompt');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('rate')
		.setDescription('Rate a watchparty movie from 1 to 10')
		.addStringOption(o => o
			.setName('movie')
			.setDescription('The watchparty to rate')
			.setRequired(true)
			.setAutocomplete(true))
		.addIntegerOption(o => o
			.setName('score')
			.setDescription('Your score from 1 to 10')
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(10))
		.setDMPermission(false),

	category: 'utility',

	async autocomplete(interaction) {
		await respondWithWatchpartyChoices(interaction);
	},

	// Rating prompt buttons (custom ID rate:<watchpartyId>:<score>)
	async handleButton(interaction) {
		await handleRatingButton(interaction);
	},

	async execute(interaction) {
		const db = getDatabase();
		const movie = interaction.options.getString('movie', true).trim();
		const score = interaction.options.getInteger('score', true);

		// Autocomplete supplies the watchparty id; fall back to the latest watchparty with that title
		const watchparty = /^\d+$/.test(movie)
			? db.getWatchparty(Number(movie))
			: db.findLatestByTitle(movie);

		if (!watchparty) {
			return interaction.reply({
				content: `❌ No watchparty found for **${movie}**. Pick one from the suggestions.`,
				ephemeral: true,
			});
		}

		const previous = db.setRating(watchparty.id, { id: interaction.user.id, tag: interaction.user.tag }, score);
		const summary = db.getWatchpartyRatingSummary(watchparty.id);

		const action = previous === null
			? `You rated **${watchparty.title}** ${score}/10.`
			: `Updated your rating for **${watchparty.title}**: ${previous} → ${score}/10.`;

		await interaction.reply({
			content: `✅ ${action}\nGroup rating: ${formatSummary(summary)}`,
			ephemeral: true,
		});
	},
};
