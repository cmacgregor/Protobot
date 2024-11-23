const { Events } = require('discord.js');

const telePartyPrefix = 'https://www.netflix.com/watch/';
module.exports = {
	name: Events.MessageCreate,
	once: false,
	async execute(message) {
		try {
			if (message.author.bot) return;

			if (message.content.startsWith(telePartyPrefix)) {
				// TODO: make this into a class that derives this more robustly
				const videoId = message.content.split('/')[4].split('?')[0];

				// netflix service reaches out to netflix and gets the show name from the results

			}
		}
		catch (error) {
			console.error('Error processing messageCreate event:', error);
		}
	},
};