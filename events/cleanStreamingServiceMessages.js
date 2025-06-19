const { Events } = require('discord.js');
const { getStreamingInfo } = require('../services/streamingTitleService');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		if (message.author.bot) return;

		// 🔎 Match only the first URL in the message
		const url = message.content.match(/https?:\/\/[^\s]+/)?.[0];
		if (!url) return;

		// ⏱️ Wait for Discord to populate embeds
		await new Promise(resolve => setTimeout(resolve, 1500));

		try {
			const streamingInfo = await getStreamingInfo(url, message);
			if (!streamingInfo) return;

			await message.delete().catch(err => {
				console.warn('⚠️ Could not delete original message:', err.message);
			});

			await message.channel.send({
				embeds: [
					{
						title: streamingInfo.title,
						url: streamingInfo.url,
						description: `Watch on: **${streamingInfo.platform}**`,
						image: streamingInfo.thumbnail
							? { url: streamingInfo.thumbnail }
							: undefined,
						color: streamingInfo.color || 0xcccccc,
					},
				],
			});
		}
		catch (err) {
			console.error(`❌ Failed to process URL: ${url}`, err);
		}
	},
};
