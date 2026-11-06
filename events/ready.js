const { Events } = require('discord.js');
const { getManager } = require('../utils/watchpartyManager');
const { voiceMembers } = require('../utils/discordVoice');
const { handleWatchpartyEnd } = require('../utils/watchpartyEnd');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Bot Ready! Logged in as ${client.user.tag}`);

		const manager = getManager();
		manager.setHooks({
			getVoiceMembers: channelId => voiceMembers(client.channels.cache.get(channelId)),
			onEnd: summary => handleWatchpartyEnd(client, summary),
		});
		await manager.restore();
	},
};
