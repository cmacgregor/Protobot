const { Events, EmbedBuilder } = require('discord.js');
const { getStreamingInfo } = require('../services/streamingTitleService');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		if (message.author.bot) return;
		if (message.channel.id !== process.env.WATCH_CHANNEL_ID) return;

		const urls = [...message.content.matchAll(/https?:\/\/[^\s]+/g)].map(m => m[0]);
		if (!urls.length) return;

		for (const url of urls) {
			try {
				const info = await getStreamingInfo(url);
				if (!info?.title) continue;

				const embed = new EmbedBuilder()
					.setTitle(info.title)
					.setURL(url)
					.setColor(0x5865f2)
					.setFooter({ text: info.footerNote || info.platform });

				if (info.thumbnail) {
					embed.setImage(info.thumbnail);
				}

				await message.delete();
				await message.channel.send({ embeds: [embed] });
			}
			catch (err) {
				console.error(`❌ Error processing URL ${url}:`, err);
			}
		}
	},
};
