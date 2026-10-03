// utils/ratingPrompt.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getDatabase } = require('./database');
const { updateEndAttendees } = require('./sheetsExporter');

// Custom ID format: rate:<watchpartyId>:<score>
const RATE_PREFIX = 'rate';

function buildRatingComponents(watchpartyId) {
	const rows = [];
	for (let start = 1; start <= 10; start += 5) {
		const row = new ActionRowBuilder();
		for (let score = start; score < start + 5; score++) {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`${RATE_PREFIX}:${watchpartyId}:${score}`)
					.setLabel(String(score))
					.setStyle(score >= 8 ? ButtonStyle.Success : score <= 3 ? ButtonStyle.Danger : ButtonStyle.Secondary),
			);
		}
		rows.push(row);
	}
	return rows;
}

function buildRatingEmbed(watchparty, summary) {
	const embed = new EmbedBuilder()
		.setTitle(`Rate: ${watchparty.title}`)
		.setDescription('How was it? Pick a score from 1 to 10. You can change your rating any time, or use `/rate` later.')
		.setColor(0x5865F2);
	if (watchparty.url) embed.setURL(watchparty.url);
	embed.addFields({ name: 'Group rating', value: formatSummary(summary), inline: false });
	return embed;
}

function formatSummary(summary) {
	if (!summary.count) return 'No ratings yet';
	return `**${summary.average.toFixed(1)}**/10 from ${summary.count} rating${summary.count === 1 ? '' : 's'}`;
}

/**
 * Posts the rating prompt for a watchparty in the given text channel
 */
async function postRatingPrompt(channel, watchpartyId) {
	const db = getDatabase();
	const watchparty = db.getWatchparty(watchpartyId);
	if (!watchparty || !channel?.isTextBased()) return null;

	return channel.send({
		embeds: [buildRatingEmbed(watchparty, db.getWatchpartyRatingSummary(watchpartyId))],
		components: buildRatingComponents(watchpartyId),
	});
}

/**
 * Records end attendees for a tracked watchparty (database and Sheets) and posts the rating prompt
 * @param {Object} party - Tracked watchparty from watchpartyTracker
 * @param {import('discord.js').Collection} voiceMembers - Members in the voice channel at the end
 * @param {import('discord.js').TextBasedChannel} channel - Channel to post the rating prompt in
 * @returns {Promise<{endAttendees: string[], sheetUpdated: boolean|null}>}
 */
async function finishWatchparty(party, voiceMembers, channel) {
	const members = voiceMembers ? [...voiceMembers.values()] : [];
	const endAttendees = members.map(m => m.user.tag);

	let sheetUpdated = null;
	if (process.env.GOOGLE_SHEETS_CREDENTIALS && process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
		try {
			sheetUpdated = await updateEndAttendees(party.title, party.startTime, endAttendees.join(', '));
		}
		catch (err) {
			console.error('[SHEETS] Failed to update end attendees:', err.message);
			sheetUpdated = false;
		}
	}

	if (party.watchpartyId) {
		try {
			getDatabase().endWatchparty(party.watchpartyId, members.map(m => ({ id: m.user.id, tag: m.user.tag })));
			await postRatingPrompt(channel, party.watchpartyId);
		}
		catch (err) {
			console.error('[DB] Failed to finish watchparty:', err);
		}
	}

	return { endAttendees, sheetUpdated };
}

/**
 * Handles a click on one of the rating prompt buttons
 */
async function handleRatingButton(interaction) {
	const [, idPart, scorePart] = interaction.customId.split(':');
	const watchpartyId = Number(idPart);
	const score = Number(scorePart);

	const db = getDatabase();
	const watchparty = db.getWatchparty(watchpartyId);
	if (!watchparty) {
		return interaction.reply({ content: '❌ That watchparty no longer exists.', ephemeral: true });
	}

	const previous = db.setRating(watchpartyId, { id: interaction.user.id, tag: interaction.user.tag }, score);
	const summary = db.getWatchpartyRatingSummary(watchpartyId);

	await interaction.reply({
		content: previous === null
			? `✅ You rated **${watchparty.title}** ${score}/10.`
			: `✅ Updated your rating for **${watchparty.title}**: ${previous} → ${score}/10.`,
		ephemeral: true,
	});

	await interaction.message.edit({ embeds: [buildRatingEmbed(watchparty, summary)] }).catch(err => {
		console.error('[RATING] Failed to update rating prompt:', err.message);
	});
}

/**
 * Autocomplete choices for watchparty options, most recent first
 * @param {boolean} byTitle - Use the title as the value (one choice per movie) instead of the watchparty id
 */
async function respondWithWatchpartyChoices(interaction, { byTitle = false } = {}) {
	const query = interaction.options.getFocused();
	const results = getDatabase().searchWatchparties(query, 50);

	const seen = new Set();
	const choices = [];
	for (const w of results) {
		const key = w.title.trim().toLowerCase();
		if (byTitle && seen.has(key)) continue;
		seen.add(key);

		const date = new Date(w.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		const name = byTitle ? w.title : `${w.title} (${date})`;
		const value = byTitle ? w.title : String(w.id);
		choices.push({ name: name.slice(0, 100), value: value.slice(0, 100) });
		if (choices.length === 25) break;
	}
	await interaction.respond(choices);
}

module.exports = {
	RATE_PREFIX,
	respondWithWatchpartyChoices,
	buildRatingComponents,
	finishWatchparty,
	formatSummary,
	handleRatingButton,
	postRatingPrompt,
};
