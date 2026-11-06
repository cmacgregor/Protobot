// utils/watchpartyEnd.js
// What happens when a watchparty ends: a summary in the text channel and the sheet mirror.

const { EmbedBuilder } = require('discord.js');
const { isSheetsConfigured, exportMovieToSheet } = require('./sheetsExporter');
const { DEFAULT_COLOR, normalizeUrl, detectService } = require('./services');

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
 * @param {{party: Object, title: Object|null, attendees: Object[], reason: string, watchCount: number}} summary
 */
async function handleWatchpartyEnd(client, { party, title, attendees, reason, watchCount }) {
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
		const tags = pick => attendees.filter(pick).map(a => a.userTag).filter(Boolean).join(', ');
		const parsed = party.url ? normalizeUrl(party.url) : null;
		try {
			await exportMovieToSheet({
				// The media's own name when TMDB knows it, otherwise what was typed
				title: title?.name || party.display_name,
				url: party.url || '',
				postedDate: new Date(party.started_at),
				service: parsed ? detectService(parsed.hostname).name : '',
				genre: title?.genres || '',
				rewatchCount: watchCount,
				runtime: title?.runtime,
				imdbId: title?.imdb_id,
				host: party.host_tag || '',
				attendees: tags(a => a.presentAtStart),
				endAttendees: tags(a => a.presentAtEnd),
				mediaType: title?.media_type,
			});
		}
		catch (err) {
			// The database has the record; the sheet is only a mirror
			console.error(`[SHEETS] Failed to mirror "${party.display_name}":`, err.message);
		}
	}
}

module.exports = { handleWatchpartyEnd };
