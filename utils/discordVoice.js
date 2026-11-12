// utils/discordVoice.js
const { GuildScheduledEventStatus, GuildScheduledEventEntityType } = require('discord.js');

/**
 * Humans (not bots) in a voice channel.
 * @param {import('discord.js').Channel|null|undefined} channel
 * @returns {{id: string, tag: string}[]|null} null if it isn't a voice channel
 */
function voiceMembers(channel) {
	if (!channel?.isVoiceBased?.()) return null;
	return channel.members
		.filter(m => !m.user.bot)
		.map(m => ({ id: m.id, tag: m.user.tag }));
}

/**
 * The guild's live scheduled event for this voice channel, if there is one.
 * External events (no channel) count too, since the weekly night might be set up that way.
 * @param {import('discord.js').Guild} guild
 * @param {string} voiceChannelId
 * @returns {Promise<import('discord.js').GuildScheduledEvent|null>}
 */
async function findLiveEvent(guild, voiceChannelId) {
	try {
		const events = await guild.scheduledEvents.fetch();
		const live = events.filter(e => e.status === GuildScheduledEventStatus.Active);
		return live.find(e => e.channelId === voiceChannelId)
			?? live.find(e => e.entityType === GuildScheduledEventEntityType.External)
			?? null;
	}
	catch (err) {
		console.warn('[EVENTS] Could not fetch scheduled events:', err.message);
		return null;
	}
}

module.exports = { voiceMembers, findLiveEvent };
