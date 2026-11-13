const { Events } = require('discord.js');
const { getManager } = require('../utils/watchpartyManager');
const { voiceMembers } = require('../utils/discordVoice');
const { handleWatchpartyEnd } = require('../utils/watchpartyEnd');
const { EventAutoStarter } = require('../utils/eventAutoStart');

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

		// Start and end scheduled events (the weekly movie night) automatically
		await new EventAutoStarter(client).start();
	},
};
