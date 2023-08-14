const { Client, Events, GatewayIntentBits } = require('discord.js');
const Enmap = require('enmap');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const config = require('./config.json');

console.log(process.env.DISCORD_TOKEN);
// We also need to make sure we're attaching the config to the CLIENT so it's accessible everywhere!
client.config = config;

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

// read events handled from filesystem and map them
// fs.readdir('./events/', (err, files) => {
// 	if (err) return console.error(err);
// 	files.forEach((file) => {
// 		const event = require(`./events/${file}`);
// 		const eventName = file.split('.')[0];
// 		client.on(eventName, event.bind(null, client));
// 	});
// });

// read commands handled from filesystem and map them
// client.commands = new Enmap();
// fs.readdir('./commands/', (err, files) => {
// 	if (err) return console.error(err);
// 	files.forEach((file) => {
// 		if (!file.endsWith('.js')) return;
// 		const props = require(`./commands/${file}`);
// 		const commandName = file.split('.')[0];
// 		console.log(`Attempting to load command ${commandName}`);
// 		client.commands.set(commandName, props);
// 	});
// });

client.login(config.token);
