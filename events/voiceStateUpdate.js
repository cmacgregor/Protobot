const { Events } = require('discord.js');
const { getManager } = require('../utils/watchpartyManager');

module.exports = {
	name: Events.VoiceStateUpdate,
	execute(oldState, newState) {
		const user = newState.member?.user ?? oldState.member?.user;
		getManager().handleVoiceChange({
			userId: newState.id,
			userTag: user?.tag ?? null,
			isBot: user?.bot ?? false,
			oldChannelId: oldState.channelId,
			newChannelId: newState.channelId,
		});
	},
};
