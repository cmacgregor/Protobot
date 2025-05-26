const { Events, EmbedBuilder } = require('discord.js');
const { getStreamingInfo } = require('../services/streamingTitleService');
const streamingDomains = Object.keys(require('../services/streamingDomains'));

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    const watchChannelId = process.env.WATCH_CHANNEL_ID;
    if (message.channel.id !== watchChannelId) return;

    const urls = [...message.content.matchAll(/https?:\/\/[^\s]+/g)].map(m => m[0]);
    if (!urls.length) return;

    for (const url of urls) {
      if (streamingDomains.some(domain => url.includes(domain))) {
        try {
          const info = await getStreamingInfo(url);
          if (!info?.title) continue;

          const embed = new EmbedBuilder()
            .setTitle(info.title)
            .setURL(url)
            .setColor(0xff5252)
            .setFooter({ text: info.platform });

          if (info.thumbnail) {
            embed.setImage(info.thumbnail);
          }

          await message.reply({
            embeds: [embed],
            allowedMentions: { repliedUser: false },
          });
        } catch (err) {
          console.error(`❌ Error processing URL ${url}:`, err);
        }
      }
    }
  },
};
