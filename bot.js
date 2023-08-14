const { Client, Events, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
// const config = require("./config.json");

// We also need to make sure we're attaching the config to the CLIENT so it's accessible everywhere!
// client.config = config;

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
