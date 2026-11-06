// utils/watchpartyEnd.js
// What happens when a watchparty ends: a summary in the text channel and the sheet mirror.

const { EmbedBuilder } = require('discord.js');
const { isSheetsConfigured, updateEndAttendees } = require('./sheetsExporter');
const { DEFAULT_COLOR } = require('./services');

const REASONS = {
	manual: 'Ended by command',
	runtime: 'Runtime finished',
	empty: 'Voice channel emptied',
	max: 'Time limit reached',
	replaced: 'A new watchparty started',
};

function formatDuration(minutes) {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{party: Object, title: Object|null, attendees: Object[], reason: string}} summary
 */
async function handleWatchpartyEnd(client, { party, title, attendees, reason }) {
	const watched = attendees.filter(a => a.watched);
	const minutes = Math.round((Date.parse(party.ended_at) - Date.parse(party.started_at)) / 60000);

	const embed = new EmbedBuilder()
		.setTitle(`🎬 Watchparty ended: ${party.display_name}${title?.year ? ` (${title.year})` : ''}`)
		.setColor(DEFAULT_COLOR)
		.addFields(
			{ name: 'Length', value: formatDuration(minutes), inline: true },
			{ name: 'Host', value: party.host_id ? `<@${party.host_id}>` : party.host_tag ?? 'Unknown', inline: true },
			{
				name: `Watched (${watched.length})`,
				value: watched.length ? watched.map(a => `<@${a.userId}>`).join(', ').slice(0, 1024) : 'Nobody stayed long enough',
				inline: false,
			},
		)
		.setFooter({ text: REASONS[reason] ?? reason });
	if (title?.poster_url) embed.setThumbnail(title.poster_url);

	try {
		const channel = await client.channels.fetch(party.channel_id);
		// Mentions show names without pinging anyone
		await channel?.send({ embeds: [embed], allowedMentions: { parse: [] } });
	}
	catch (err) {
		console.warn(`[WATCHPARTY] Could not post end summary for "${party.display_name}":`, err.message);
	}

	if (isSheetsConfigured()) {
		const atEnd = attendees.filter(a => a.presentAtEnd).map(a => a.userTag).filter(Boolean);
		try {
			await updateEndAttendees(
				{ title: party.display_name, sheetRow: party.sheet_row, postedText: party.posted_text },
				atEnd.join(', '),
			);
		}
		catch (err) {
			console.error('[SHEETS] Failed to update end attendees:', err.message);
		}
	}
}

module.exports = { handleWatchpartyEnd };
