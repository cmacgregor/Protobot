const Events = require('discord.js');
const cheerio = require('cheerio');
const axios = require('axios');

const telePartyPrefix = 'https://www.netflix.com/watch/';

module.exports = {
	name: Events.MessageCreate,
	once: false,
	async execute(message) {
		console.log("Event: watchPartMessage");
		console.log(`Message from ${message.author.tag}: ${message.content}`);
		try {
			if (message.author.bot) return;

			if (message.content.startsWith(telePartyPrefix)) {
				// TODO: make this into a class that derives this more robustly
				const videoId = message.content.split('/')[4].split('?')[0];

				// netflix service reaches out to netflix and gets the show name from the results
				const videoTitle = GetVideoTitle(videoId);

				console.log(videoTitle);
			}
		}
		catch (error) {
			console.error('Error processing messageCreate event:', error);
		}
	},
};

GetVideoTitle = (videoId) => {
	const netflixResponse = fetchNetflixData(videoId)
	
	return parseNetflixData(netflixResponse);
}

//get video from netflix
fetchNetflixData = async (videoId) => 
{
	const netflixUrlPrefix = "https://www.netflix.com/watch/" 
	const url = netflixUrlPrefix + videoId
	try {
		const response = await axios.get(url);
		if (response.status !== 200) {
		  throw new Error(`Response status: ${response.status}`);
		}

		const html = await response.data;

		const $ = cheerio.load(html);
		const title = $('title').text();

		return title.split('|')[0].split('Watch')[1];
	  } catch (error) {
		console.error(error.message);
	  }
}

//parse info from netflix to get title
parseNetflixData = (netflixData) =>
{
	return netflixData;
}
